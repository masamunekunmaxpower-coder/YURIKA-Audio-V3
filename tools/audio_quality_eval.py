#!/usr/bin/env python3
"""
YURIKA Audio Fine-Grained Quality Evaluator

Development/regression evaluator for reference-vs-processed audio.
This tool is offline-only and has no runtime connection to the YURIKA DSP,
GIRO MCP, or any model service.

Metrics are engineering/proxy measurements, not listening-test certification.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import tempfile
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import numpy as np
    import soundfile as sf
    from scipy import integrate, signal
    from scipy.ndimage import uniform_filter1d
except Exception as exc:  # pragma: no cover
    print("Missing evaluator dependencies. Run: pip install -r tools/requirements-audio-eval.txt", file=sys.stderr)
    print(f"Import error: {exc}", file=sys.stderr)
    raise SystemExit(2)

VERSION = "1.2.0"
EPS = 1e-12


@dataclass
class AudioMeta:
    path: str
    samplerate: int
    channels: int
    frames: int
    duration_s: float
    subtype: str
    format: str


def _finite(x: np.ndarray) -> np.ndarray:
    return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)


def _db20(x: float, floor: float = -300.0) -> float:
    if not math.isfinite(x) or x <= 0:
        return floor
    return max(floor, 20.0 * math.log10(x))


def _db10(x: float, floor: float = -300.0) -> float:
    if not math.isfinite(x) or x <= 0:
        return floor
    return max(floor, 10.0 * math.log10(x))


def _clip(v: float, lo: float, hi: float) -> float:
    return float(min(hi, max(lo, v)))


def _safe_corr(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64).reshape(-1)
    b = np.asarray(b, dtype=np.float64).reshape(-1)
    n = min(a.size, b.size)
    if n < 4:
        return 0.0
    a = a[:n] - np.mean(a[:n])
    b = b[:n] - np.mean(b[:n])
    da = float(np.dot(a, a))
    db = float(np.dot(b, b))
    if da <= EPS or db <= EPS:
        return 1.0 if da <= EPS and db <= EPS else 0.0
    return _clip(float(np.dot(a, b) / math.sqrt(da * db)), -1.0, 1.0)


def _resample(x: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return np.asarray(x, dtype=np.float32)
    frac = Fraction(dst_sr, src_sr).limit_denominator(2048)
    y = signal.resample_poly(x, frac.numerator, frac.denominator, axis=0)
    return np.asarray(y, dtype=np.float32)


def _meta(path: str) -> AudioMeta:
    with sf.SoundFile(path) as f:
        return AudioMeta(
            path=str(path), samplerate=int(f.samplerate), channels=int(f.channels),
            frames=int(len(f)), duration_s=float(len(f) / f.samplerate),
            subtype=str(f.subtype), format=str(f.format),
        )


def _read_seconds(path: str, start_s: float, duration_s: float, dst_sr: int) -> np.ndarray:
    with sf.SoundFile(path) as f:
        start = max(0, int(round(start_s * f.samplerate)))
        frames = max(0, int(round(duration_s * f.samplerate)))
        if start >= len(f) or frames <= 0:
            return np.zeros((0, f.channels), dtype=np.float32)
        f.seek(start)
        x = f.read(min(frames, len(f) - start), dtype="float32", always_2d=True)
        x = _finite(x)
        return _resample(x, int(f.samplerate), dst_sr)


def _mono(x: np.ndarray) -> np.ndarray:
    if x.ndim == 1:
        return x.astype(np.float32, copy=False)
    if x.shape[1] == 1:
        return x[:, 0].astype(np.float32, copy=False)
    return np.mean(x, axis=1, dtype=np.float32)


def _match_channels(a: np.ndarray, b: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    ca = 1 if a.ndim == 1 else a.shape[1]
    cb = 1 if b.ndim == 1 else b.shape[1]
    if a.ndim == 1:
        a = a[:, None]
    if b.ndim == 1:
        b = b[:, None]
    c = max(ca, cb)
    if ca == 1 and c > 1:
        a = np.repeat(a, c, axis=1)
    if cb == 1 and c > 1:
        b = np.repeat(b, c, axis=1)
    c = min(a.shape[1], b.shape[1], 2)  # evaluator focuses on mono/stereo
    return a[:, :c], b[:, :c]


def _estimate_lag(ref: np.ndarray, proc: np.ndarray, sr: int, max_lag_ms: float) -> Tuple[int, float]:
    a = _mono(ref).astype(np.float64)
    b = _mono(proc).astype(np.float64)
    n = min(a.size, b.size)
    if n < 64:
        return 0, 0.0
    a = a[:n] - np.mean(a[:n])
    b = b[:n] - np.mean(b[:n])
    # Normalize to stop level differences from dominating correlation magnitude.
    a /= math.sqrt(float(np.dot(a, a)) + EPS)
    b /= math.sqrt(float(np.dot(b, b)) + EPS)
    corr = signal.correlate(b, a, mode="full", method="fft")
    lags = signal.correlation_lags(b.size, a.size, mode="full")
    m = int(round(max_lag_ms * sr / 1000.0))
    mask = (lags >= -m) & (lags <= m)
    if not np.any(mask):
        return 0, 0.0
    sub = corr[mask]
    sublags = lags[mask]
    i = int(np.argmax(sub))
    lag = int(sublags[i])  # positive = processed is delayed vs reference
    conf = _clip(float(sub[i]), -1.0, 1.0)
    return lag, conf


def _align_pair(ref: np.ndarray, proc: np.ndarray, lag: int) -> Tuple[np.ndarray, np.ndarray]:
    ref, proc = _match_channels(ref, proc)
    if lag > 0:
        proc = proc[lag:]
        ref = ref[:proc.shape[0]]
    elif lag < 0:
        ref = ref[-lag:]
        proc = proc[:ref.shape[0]]
    n = min(ref.shape[0], proc.shape[0])
    return ref[:n], proc[:n]


def _stratified_pair(reference: str, processed: str, common_sr: int, lag: int,
                     usable_s: float, max_seconds: float, window_seconds: float) -> Tuple[np.ndarray, np.ndarray, List[float]]:
    total = max(1.0, min(max_seconds, usable_s))
    w = max(0.5, min(window_seconds, total))
    count = max(1, int(math.ceil(total / w)))
    w = total / count
    max_start = max(0.0, usable_s - w - abs(lag) / common_sr - 0.01)
    if count == 1:
        starts = [min(max_start, max(0.0, usable_s * 0.5 - w * 0.5))]
    else:
        starts = np.linspace(0.0, max_start, count).tolist()
    rs: List[np.ndarray] = []
    ps: List[np.ndarray] = []
    for t in starts:
        r = _read_seconds(reference, t, w + abs(lag) / common_sr + 0.02, common_sr)
        p = _read_seconds(processed, t, w + abs(lag) / common_sr + 0.02, common_sr)
        r, p = _align_pair(r, p, lag)
        n = min(r.shape[0], p.shape[0], int(round(w * common_sr)))
        if n >= 128:
            rs.append(r[:n])
            ps.append(p[:n])
    if not rs:
        raise ValueError("No overlapping audio samples available after alignment")
    return np.concatenate(rs, axis=0), np.concatenate(ps, axis=0), starts


def _si_sdr(ref: np.ndarray, est: np.ndarray) -> float:
    x = ref.astype(np.float64).reshape(-1)
    y = est.astype(np.float64).reshape(-1)
    n = min(x.size, y.size)
    x = x[:n] - np.mean(x[:n])
    y = y[:n] - np.mean(y[:n])
    den = float(np.dot(x, x)) + EPS
    alpha = float(np.dot(y, x) / den)
    target = alpha * x
    noise = y - target
    return _db10(float(np.dot(target, target)) / (float(np.dot(noise, noise)) + EPS))


def _welch(x: np.ndarray, sr: int, nperseg: int = 16384) -> Tuple[np.ndarray, np.ndarray]:
    m = _mono(x)
    nperseg = int(min(max(256, nperseg), max(256, m.size)))
    f, p = signal.welch(m, fs=sr, window="hann", nperseg=nperseg, noverlap=nperseg // 2,
                        detrend="constant", scaling="density")
    return f, np.maximum(p, 1e-30)


def _band_mask(f: np.ndarray, lo: float, hi: Optional[float]) -> np.ndarray:
    if hi is None:
        return f >= lo
    return (f >= lo) & (f < hi)


def _band_power(f: np.ndarray, p: np.ndarray, lo: float, hi: Optional[float]) -> float:
    m = _band_mask(f, lo, hi)
    if np.count_nonzero(m) < 2:
        return 0.0
    return float(integrate.trapezoid(p[m], f[m]))


def _spectral_centroid(f: np.ndarray, p: np.ndarray) -> float:
    return float(np.sum(f * p) / (np.sum(p) + EPS))


def _rolloff(f: np.ndarray, p: np.ndarray, q: float = 0.95) -> float:
    c = np.cumsum(p)
    if c.size == 0 or c[-1] <= 0:
        return 0.0
    i = int(np.searchsorted(c, q * c[-1]))
    return float(f[min(i, f.size - 1)])


def _multi_resolution_sc(ref: np.ndarray, proc: np.ndarray, sr: int) -> Dict[str, float]:
    x = _mono(ref)
    y = _mono(proc)
    out: Dict[str, float] = {}
    vals = []
    for nfft in (1024, 4096, 16384):
        if min(x.size, y.size) < nfft:
            continue
        _, _, X = signal.stft(x, fs=sr, window="hann", nperseg=nfft, noverlap=nfft // 2,
                              boundary=None, padded=False)
        _, _, Y = signal.stft(y, fs=sr, window="hann", nperseg=nfft, noverlap=nfft // 2,
                              boundary=None, padded=False)
        frames = min(X.shape[1], Y.shape[1])
        X = np.abs(X[:, :frames])
        Y = np.abs(Y[:, :frames])
        sc = float(np.linalg.norm(Y - X) / (np.linalg.norm(X) + EPS))
        out[str(nfft)] = sc
        vals.append(sc)
    out["mean"] = float(np.mean(vals)) if vals else 0.0
    return out


def _lsd_bands(f: np.ndarray, pref: np.ndarray, pproc: np.ndarray, bands: Sequence[Tuple[str, float, Optional[float]]]) -> Dict[str, float]:
    # Use magnitude dB rather than PSD dB; sqrt(PSD) -> 10log10(PSD) equivalence.
    dr = 10.0 * np.log10(np.maximum(pref, 1e-30))
    dp = 10.0 * np.log10(np.maximum(pproc, 1e-30))
    out: Dict[str, float] = {}
    for name, lo, hi in bands:
        m = _band_mask(f, lo, hi)
        if np.count_nonzero(m) < 2:
            continue
        d = dp[m] - dr[m]
        out[name] = float(np.sqrt(np.mean(d * d)))
    return out


def _spectral_flux(x: np.ndarray, sr: int, nfft: int = 2048) -> np.ndarray:
    m = _mono(x)
    if m.size < nfft:
        return np.zeros(1, dtype=np.float32)
    _, _, Z = signal.stft(m, fs=sr, window="hann", nperseg=nfft, noverlap=3 * nfft // 4,
                          boundary=None, padded=False)
    M = np.abs(Z)
    M /= np.maximum(np.sum(M, axis=0, keepdims=True), EPS)
    d = np.maximum(0.0, np.diff(M, axis=1))
    return np.sum(d, axis=0).astype(np.float32)


def _moving_rms(m: np.ndarray, win: int) -> np.ndarray:
    win = max(1, int(win))
    p = uniform_filter1d(np.square(m, dtype=np.float64), size=win, mode="nearest")
    return np.sqrt(np.maximum(p, 0.0)).astype(np.float32)


def _frame_crest(m: np.ndarray, frame: int, hop: int) -> np.ndarray:
    if m.size < frame:
        peak = float(np.max(np.abs(m))) if m.size else 0.0
        rms = float(np.sqrt(np.mean(m * m) + EPS)) if m.size else 0.0
        return np.array([peak / (rms + EPS)], dtype=np.float32)
    vals = []
    for i in range(0, m.size - frame + 1, hop):
        z = m[i:i + frame]
        vals.append(float(np.max(np.abs(z))) / (float(np.sqrt(np.mean(z * z) + EPS)) + EPS))
    return np.asarray(vals, dtype=np.float32)


def _band_filter(x: np.ndarray, sr: int, lo: Optional[float], hi: Optional[float], order: int = 4) -> np.ndarray:
    nyq = sr * 0.5
    if lo is None and hi is None:
        return np.asarray(x, dtype=np.float32)
    if hi is not None and hi >= nyq * 0.995:
        hi = None
    if lo is not None and lo >= nyq * 0.995:
        return np.zeros_like(x, dtype=np.float32)
    if lo is None:
        sos = signal.butter(order, hi, btype="lowpass", fs=sr, output="sos")
    elif hi is None:
        sos = signal.butter(order, lo, btype="highpass", fs=sr, output="sos")
    else:
        if hi <= lo:
            return np.zeros_like(x, dtype=np.float32)
        sos = signal.butter(order, [lo, hi], btype="bandpass", fs=sr, output="sos")
    return signal.sosfilt(sos, x).astype(np.float32)


def _spectral_flatness(p: np.ndarray) -> float:
    p = np.maximum(np.asarray(p, dtype=np.float64), 1e-30)
    return float(np.exp(np.mean(np.log(p))) / (np.mean(p) + EPS))


def _harmonic_continuation(f: np.ndarray, p: np.ndarray, hf_lo: float, source_lo: float = 1000.0,
                           source_hi: float = 20000.0) -> Dict[str, float]:
    src = (f >= source_lo) & (f < min(source_hi, hf_lo))
    hf = f >= hf_lo
    if np.count_nonzero(src) < 8 or np.count_nonzero(hf) < 8:
        return {"coherence": 0.0, "projected_bins": 0}
    ps = p[src]
    fs = f[src]
    prominence = max(float(np.max(ps)) * 0.02, float(np.median(ps)) * 6.0)
    peaks, props = signal.find_peaks(ps, prominence=prominence)
    if peaks.size == 0:
        return {"coherence": 0.0, "projected_bins": 0}
    # Keep strongest source peaks; project integer multiples into HF.
    strongest = peaks[np.argsort(ps[peaks])[-12:]]
    projected: List[float] = []
    nyq = float(f[-1])
    for idx in strongest:
        base = float(fs[idx])
        if base <= 0:
            continue
        k0 = max(2, int(math.ceil(hf_lo / base)))
        for k in range(k0, min(12, int(nyq // base)) + 1):
            hz = base * k
            if hf_lo <= hz <= nyq:
                projected.append(hz)
    if not projected:
        return {"coherence": 0.0, "projected_bins": 0}
    df = float(np.median(np.diff(f))) if f.size > 1 else 1.0
    radius = max(150.0, 3.0 * df)
    hf_total = _band_power(f, p, hf_lo, None)
    if hf_total <= EPS:
        return {"coherence": 0.0, "projected_bins": len(projected)}
    mask = np.zeros_like(f, dtype=bool)
    for hz in projected:
        mask |= (np.abs(f - hz) <= radius)
    mask &= hf
    if np.count_nonzero(mask) < 2:
        return {"coherence": 0.0, "projected_bins": len(projected)}
    captured = float(integrate.trapezoid(np.where(mask, p, 0.0), f))
    return {"coherence": _clip(captured / (hf_total + EPS), 0.0, 1.0), "projected_bins": len(projected)}


def _true_peak_4x(x: np.ndarray) -> float:
    if x.size == 0:
        return 0.0
    # Short FIR oversampling proxy. Good for regression, not an IEC conformance meter.
    vals = []
    for c in range(x.shape[1]):
        up = signal.resample_poly(x[:, c], 4, 1)
        vals.append(float(np.max(np.abs(up))))
    return max(vals) if vals else 0.0


def _safety_metrics(x: np.ndarray) -> Dict[str, Any]:
    finite_mask = np.isfinite(x)
    nonfinite = int(np.size(x) - int(np.count_nonzero(finite_mask)))
    y = _finite(x)
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    true_peak = _true_peak_4x(y)
    clip_ratio = float(np.mean(np.abs(y) >= 0.9999)) if y.size else 0.0
    dc = [float(np.mean(y[:, c])) for c in range(y.shape[1])]
    return {
        "sample_peak_dbfs": _db20(peak),
        "true_peak_4x_dbfs_proxy": _db20(true_peak),
        "clipping_ratio": clip_ratio,
        "nonfinite_count": nonfinite,
        "dc_offset_per_channel": dc,
    }


def _stereo_metrics(ref: np.ndarray, proc: np.ndarray, sr: int) -> Dict[str, Any]:
    if ref.shape[1] < 2 or proc.shape[1] < 2:
        return {"available": False}

    def calc(x: np.ndarray) -> Dict[str, float]:
        l = x[:, 0].astype(np.float64)
        r = x[:, 1].astype(np.float64)
        corr = _safe_corr(l, r)
        mid = (l + r) * 0.5
        side = (l - r) * 0.5
        ms_db = _db10(float(np.mean(side * side) + EPS) / (float(np.mean(mid * mid)) + EPS))
        rms_l = math.sqrt(float(np.mean(l * l)) + EPS)
        rms_r = math.sqrt(float(np.mean(r * r)) + EPS)
        ild = _db20((rms_l + EPS) / (rms_r + EPS))
        # Frequency-domain interchannel coherence proxy.
        n = min(16384, max(1024, 1 << int(math.floor(math.log2(max(1024, min(len(l), 16384)))))))
        _, Pxy = signal.csd(l, r, fs=sr, nperseg=n)
        _, Pxx = signal.welch(l, fs=sr, nperseg=n)
        _, Pyy = signal.welch(r, fs=sr, nperseg=n)
        coh = float(np.mean(np.abs(Pxy) / np.sqrt(np.maximum(Pxx * Pyy, EPS))))
        imbalance = _db20((rms_l + EPS) / (rms_r + EPS))
        low_l = _band_filter(l, sr, 20.0, min(700.0, sr * 0.45))
        low_r = _band_filter(r, sr, 20.0, min(700.0, sr * 0.45))
        high_lo = min(4000.0, sr * 0.2)
        high_hi = min(18000.0, sr * 0.45)
        hi_l = _band_filter(l, sr, high_lo, high_hi)
        hi_r = _band_filter(r, sr, high_lo, high_hi)
        low_ild = _db20((np.sqrt(np.mean(low_l * low_l) + EPS)) / (np.sqrt(np.mean(low_r * low_r) + EPS) + EPS))
        high_ild = _db20((np.sqrt(np.mean(hi_l * hi_l) + EPS)) / (np.sqrt(np.mean(hi_r * hi_r) + EPS) + EPS))
        return {"interchannel_correlation": corr, "mid_side_ratio_db": ms_db, "ild_db": ild,
                "low_band_ild_db": low_ild, "high_band_ild_db": high_ild,
                "interchannel_phase_coherence_proxy": _clip(coh, 0.0, 1.0),
                "channel_imbalance_db": imbalance}

    a = calc(ref)
    b = calc(proc)
    delta = {k + "_delta": float(b[k] - a[k]) for k in a}
    # Composite integrity proxy: only a regression aid, not a perceptual score.
    penalty = (
        abs(delta["interchannel_correlation_delta"]) * 2.5
        + abs(delta["mid_side_ratio_db_delta"]) / 6.0
        + abs(delta["ild_db_delta"]) / 3.0
        + abs(delta["interchannel_phase_coherence_proxy_delta"]) * 2.0
    )
    index = 100.0 * math.exp(-penalty)
    return {"available": True, "reference": a, "processed": b, "delta": delta,
            "stereo_integrity_index": _clip(index, 0.0, 100.0)}


def evaluate(reference: str, processed: str, max_seconds: float = 30.0,
             window_seconds: float = 5.0, max_lag_ms: float = 500.0) -> Dict[str, Any]:
    mr = _meta(reference)
    mp = _meta(processed)
    common_sr = max(mr.samplerate, mp.samplerate)
    usable_s = min(mr.duration_s, mp.duration_s)
    if usable_s < 0.05:
        raise ValueError("Audio is too short for evaluation")

    probe_s = min(8.0, usable_s)
    r0 = _read_seconds(reference, 0.0, probe_s, common_sr)
    p0 = _read_seconds(processed, 0.0, probe_s, common_sr)
    lag, lag_conf = _estimate_lag(r0, p0, common_sr, max_lag_ms)

    ref, proc, starts = _stratified_pair(reference, processed, common_sr, lag, usable_s, max_seconds, window_seconds)
    ref, proc = _match_channels(ref, proc)
    ref = _finite(ref)
    proc = _finite(proc)

    rm = _mono(ref)
    pm = _mono(proc)

    # Core aligned metrics.
    ref_rms = math.sqrt(float(np.mean(rm * rm)) + EPS)
    proc_rms = math.sqrt(float(np.mean(pm * pm)) + EPS)
    gain_offset = _db20((proc_rms + EPS) / (ref_rms + EPS))
    sisdr = _si_sdr(rm, pm)
    corr = _safe_corr(rm, pm)
    inband_hi = min(20000.0, common_sr * 0.45)
    if inband_hi > 1000.0:
        inband_ref = _band_filter(rm, common_sr, None, inband_hi)
        inband_proc = _band_filter(pm, common_sr, None, inband_hi)
        inband_sisdr = _si_sdr(inband_ref, inband_proc)
        inband_err = inband_proc.astype(np.float64) - inband_ref.astype(np.float64)
        inband_error_rms_dbfs = _db20(math.sqrt(float(np.mean(inband_err * inband_err)) + EPS))
    else:
        inband_sisdr = sisdr
        inband_error_rms_dbfs = _db20(math.sqrt(float(np.mean((pm-rm) ** 2)) + EPS))

    f, pref = _welch(ref, common_sr)
    f2, pproc = _welch(proc, common_sr)
    if f.size != f2.size or not np.allclose(f, f2):
        pproc = np.interp(f, f2, pproc)

    nyq = common_sr * 0.5
    bands: List[Tuple[str, float, Optional[float]]] = [
        ("20_200", 20.0, min(200.0, nyq)),
        ("200_2k", 200.0, min(2000.0, nyq)),
        ("2k_8k", 2000.0, min(8000.0, nyq)),
        ("8k_20k", 8000.0, min(20000.0, nyq)),
    ]
    if nyq > 20500:
        bands.append(("20k_24k", 20000.0, min(24000.0, nyq)))
    if nyq > 24500:
        bands.append(("above_24k", 24000.0, None))

    band_delta: Dict[str, float] = {}
    for name, lo, hi in bands:
        pr = _band_power(f, pref, lo, hi)
        pp = _band_power(f, pproc, lo, hi)
        band_delta[name] = _db10((pp + 1e-30) / (pr + 1e-30))

    sc = _multi_resolution_sc(ref, proc, common_sr)
    lsd = _lsd_bands(f, pref, pproc, bands)
    centroid_ref = _spectral_centroid(f, pref)
    centroid_proc = _spectral_centroid(f, pproc)
    roll_ref = _rolloff(f, pref)
    roll_proc = _rolloff(f, pproc)

    flux_r = _spectral_flux(ref, common_sr)
    flux_p = _spectral_flux(proc, common_sr)
    flux_corr = _safe_corr(flux_r, flux_p)
    flux_delta = float(np.mean(flux_p) - np.mean(flux_r)) if flux_r.size and flux_p.size else 0.0

    # Transient and microdynamics proxies.
    env5_r = _moving_rms(rm, max(1, int(common_sr * 0.005)))
    env5_p = _moving_rms(pm, max(1, int(common_sr * 0.005)))
    der_r = np.maximum(0.0, np.diff(env5_r))
    der_p = np.maximum(0.0, np.diff(env5_p))
    transient_corr = _safe_corr(der_r, der_p)
    q_r = float(np.quantile(der_r, 0.99)) if der_r.size else 0.0
    q_p = float(np.quantile(der_p, 0.99)) if der_p.size else 0.0
    attack_ratio = float(q_p / (q_r + EPS))
    attack_score = math.exp(-abs(math.log(max(attack_ratio, 1e-6))))
    transient_index = 100.0 * (0.7 * (transient_corr + 1.0) * 0.5 + 0.3 * attack_score)

    micro: Dict[str, float] = {}
    for ms in (5, 20, 100):
        er = _moving_rms(rm, max(1, int(common_sr * ms / 1000.0)))
        ep = _moving_rms(pm, max(1, int(common_sr * ms / 1000.0)))
        # Downsample envelope before correlation to avoid millions of redundant points.
        step = max(1, int(common_sr * 0.002))
        micro[f"envelope_corr_{ms}ms"] = _safe_corr(er[::step], ep[::step])

    crest_r = _frame_crest(rm, max(32, int(common_sr * 0.020)), max(16, int(common_sr * 0.010)))
    crest_p = _frame_crest(pm, max(32, int(common_sr * 0.020)), max(16, int(common_sr * 0.010)))
    ncrest = min(crest_r.size, crest_p.size)
    crest_delta = float(np.mean(crest_p[:ncrest] - crest_r[:ncrest])) if ncrest else 0.0
    crest_mae = float(np.mean(np.abs(crest_p[:ncrest] - crest_r[:ncrest]))) if ncrest else 0.0

    hi_lo = 5500.0
    hi_hi = min(18000.0, nyq * 0.9)
    if hi_hi > hi_lo * 1.05:
        h_r = _band_filter(rm, common_sr, hi_lo, hi_hi)
        h_p = _band_filter(pm, common_sr, hi_lo, hi_hi)
        high_detail_corr = _safe_corr(h_r, h_p)
    else:
        high_detail_corr = 0.0

    slow_r = _moving_rms(rm, max(1, int(common_sr * 0.100)))
    slow_p = _moving_rms(pm, max(1, int(common_sr * 0.100)))
    low_mask = slow_r <= np.quantile(slow_r, 0.30)
    ambience_corr = _safe_corr(slow_r[low_mask], slow_p[low_mask]) if np.count_nonzero(low_mask) >= 16 else 0.0

    inband_lsd_vals = [v for k, v in lsd.items() if k != "above_24k"]
    inband_lsd = float(np.mean(inband_lsd_vals)) if inband_lsd_vals else 0.0
    micro_mean = float(np.mean(list(micro.values()))) if micro else 0.0
    sr_penalty = 0.16 * min(inband_lsd / 6.0, 3.0) + 0.16 * min(sc.get("mean", 0.0), 3.0)
    sr_support = (
        0.30 * ((high_detail_corr + 1.0) * 0.5)
        + 0.20 * ((flux_corr + 1.0) * 0.5)
        + 0.25 * ((micro_mean + 1.0) * 0.5)
        + 0.15 * ((transient_corr + 1.0) * 0.5)
        + 0.10 * ((corr + 1.0) * 0.5)
    )
    sr_index = 100.0 * _clip(sr_support * math.exp(-sr_penalty), 0.0, 1.0)

    # BWE metrics only when output Nyquist is meaningfully above 24 kHz.
    bwe: Dict[str, Any] = {"available": nyq > 25000.0}
    if bwe["available"]:
        src_ref = _band_power(f, pref, 5000.0, min(20000.0, nyq))
        src_proc = _band_power(f, pproc, 5000.0, min(20000.0, nyq))
        hf_ref = _band_power(f, pref, 24000.0, None)
        hf_proc = _band_power(f, pproc, 24000.0, None)
        ratio_ref_db = _db10((hf_ref + 1e-30) / (src_ref + 1e-30))
        ratio_proc_db = _db10((hf_proc + 1e-30) / (src_proc + 1e-30))
        native_present = ratio_ref_db > -55.0
        native_retention_db = _db10((hf_proc + 1e-30) / (hf_ref + 1e-30)) if native_present else None

        below = _band_power(f, pproc, 20000.0, min(23500.0, nyq))
        above = _band_power(f, pproc, 24500.0, min(29000.0, nyq)) if nyq > 24500 else 0.0
        bw_below = max(1.0, min(3500.0, nyq - 20000.0))
        bw_above = max(1.0, min(4500.0, nyq - 24500.0))
        continuity_jump = _db10((above / bw_above + 1e-30) / (below / bw_below + 1e-30))

        hf_mask = f >= 24000.0
        flatness = _spectral_flatness(pproc[hf_mask]) if np.count_nonzero(hf_mask) > 4 else 0.0
        harmonic = _harmonic_continuation(f, pproc, 24000.0)

        src_band = _band_filter(pm, common_sr, 5000.0, min(20000.0, nyq * 0.9))
        hf_band = _band_filter(pm, common_sr, 24000.0, None)
        src_env = _moving_rms(src_band, max(1, int(common_sr * 0.010)))
        hf_env = _moving_rms(hf_band, max(1, int(common_sr * 0.010)))
        step = max(1, int(common_sr * 0.005))
        src_e = src_env[::step].astype(np.float64)
        hf_e = hf_env[::step].astype(np.float64)
        src_cv = float(np.std(src_e) / (np.mean(src_e) + EPS)) if src_e.size else 0.0
        hf_cv = float(np.std(hf_e) / (np.mean(hf_e) + EPS)) if hf_e.size else 0.0
        transient_coupling_valid = bool(src_cv >= 0.01 and hf_cv >= 0.01)
        transient_coupling = _safe_corr(src_e, hf_e) if transient_coupling_valid else 0.0

        overgen = bool((not native_present) and ratio_proc_db > -35.0)
        generated_present = bool(ratio_proc_db > -80.0)
        continuity_score = math.exp(-abs(continuity_jump) / 18.0)
        structure_terms = [(0.45, harmonic["coherence"]), (0.20, continuity_score)]
        if transient_coupling_valid:
            structure_terms.append((0.35, (transient_coupling + 1.0) * 0.5))
        weight_sum = sum(w for w, _ in structure_terms)
        structure = 100.0 * _clip(sum(w*v for w, v in structure_terms) / max(weight_sum, EPS), 0.0, 1.0) if generated_present else 0.0
        hf_added = _band_filter((pm-rm).astype(np.float32), common_sr, 24000.0, None)
        hf_added_rms_dbfs = _db20(math.sqrt(float(np.mean(hf_added.astype(np.float64)**2)) + EPS))
        bwe.update({
            "reference_hf_to_source_db": ratio_ref_db,
            "processed_hf_to_source_db": ratio_proc_db,
            "native_reference_present": native_present,
            "generated_hf_present": generated_present,
            "native_hf_retention_db": native_retention_db,
            "added_hf_rms_dbfs_above_24k": hf_added_rms_dbfs,
            "cutoff_continuity_jump_db": continuity_jump,
            "hf_spectral_flatness": flatness,
            "harmonic_continuation_coherence": harmonic["coherence"],
            "harmonic_projected_bins": harmonic["projected_bins"],
            "hf_transient_coupling": transient_coupling,
            "hf_transient_coupling_valid": transient_coupling_valid,
            "source_envelope_cv": src_cv,
            "hf_envelope_cv": hf_cv,
            "bwe_overgeneration_flag": overgen,
            "bwe_structure_index": structure,
        })

    stereo = _stereo_metrics(ref, proc, common_sr)
    safety_ref = _safety_metrics(ref)
    safety_proc = _safety_metrics(proc)

    flags: List[str] = []
    if safety_proc["nonfinite_count"] > 0:
        flags.append("NONFINITE_OUTPUT")
    if safety_proc["clipping_ratio"] > 0:
        flags.append("CLIPPING")
    if safety_proc["true_peak_4x_dbfs_proxy"] > 0.2:
        flags.append("INTERSAMPLE_OVERSHOOT")
    if any(abs(v) > 1e-3 for v in safety_proc["dc_offset_per_channel"]):
        flags.append("DC_OFFSET")
    if bwe.get("bwe_overgeneration_flag"):
        flags.append("BWE_OVERGENERATION")

    result: Dict[str, Any] = {
        "evaluator": {"name": "YURIKA Audio Fine-Grained Quality Evaluator", "version": VERSION,
                      "claim_scope": "engineering regression/proxy metrics; not third-party or listening-test certification",
                      "runtime_dependency_on_dsp_or_mcp": False},
        "inputs": {"reference": mr.__dict__, "processed": mp.__dict__},
        "analysis": {
            "common_samplerate": common_sr,
            "sampled_total_seconds": float(ref.shape[0] / common_sr),
            "stratified_window_starts_s": [round(float(x), 6) for x in starts],
            "alignment": {"lag_samples": lag, "lag_ms": 1000.0 * lag / common_sr,
                          "positive_means_processed_delayed": True, "correlation_confidence_proxy": lag_conf},
        },
        "core_fidelity": {
            "si_sdr_db": sisdr,
            "inband_si_sdr_db_below_20k": inband_sisdr,
            "inband_error_rms_dbfs": inband_error_rms_dbfs,
            "aligned_waveform_correlation": corr,
            "gain_offset_db": gain_offset,
            "multi_resolution_spectral_convergence": sc,
            "log_spectral_distance_db_by_band": lsd,
            "band_energy_delta_db": band_delta,
            "spectral_centroid_hz": {"reference": centroid_ref, "processed": centroid_proc,
                                     "delta": centroid_proc - centroid_ref},
            "spectral_rolloff95_hz": {"reference": roll_ref, "processed": roll_proc,
                                      "delta": roll_proc - roll_ref},
            "spectral_flux": {"correlation": flux_corr, "mean_delta": flux_delta},
        },
        "perceptual_super_resolution": {
            "transient_derivative_correlation": transient_corr,
            "attack_quantile_ratio": attack_ratio,
            "transient_integrity_index": _clip(transient_index, 0.0, 100.0),
            "microdynamics": micro,
            "local_crest_factor_delta": crest_delta,
            "local_crest_factor_mae": crest_mae,
            "high_detail_5p5k_18k_correlation": high_detail_corr,
            "low_energy_ambience_envelope_correlation": ambience_corr,
            "sr_fidelity_index": _clip(sr_index, 0.0, 100.0),
        },
        "bandwidth_extension": bwe,
        "stereo_spatial_integrity": stereo,
        "safety": {"reference": safety_ref, "processed": safety_proc,
                   "flags": flags, "safety_flag_count": len(flags)},
    }
    return result


def _fmt(v: Any, digits: int = 5) -> str:
    if v is None:
        return "n/a"
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        if not math.isfinite(float(v)):
            return str(v)
        return f"{float(v):.{digits}f}"
    return str(v)


def render_text(r: Dict[str, Any]) -> str:
    a = r["analysis"]
    c = r["core_fidelity"]
    p = r["perceptual_super_resolution"]
    b = r["bandwidth_extension"]
    s = r["stereo_spatial_integrity"]
    safety = r["safety"]
    lines = [
        f"YURIKA Audio Fine-Grained Quality Evaluator v{VERSION}",
        "Engineering regression/proxy metrics; not third-party or listening-test certification.",
        "GIRO MCP / model runtime dependency: NONE",
        "",
        "[Alignment]",
        f"Latency: {_fmt(a['alignment']['lag_samples'],0)} samples / {_fmt(a['alignment']['lag_ms'],4)} ms",
        f"Sampled duration: {_fmt(a['sampled_total_seconds'],3)} s @ {a['common_samplerate']} Hz",
        "",
        "[Core fidelity]",
        f"SI-SDR: {_fmt(c['si_sdr_db'],4)} dB",
        f"In-band SI-SDR (<20 kHz): {_fmt(c['inband_si_sdr_db_below_20k'],4)} dB",
        f"In-band error RMS: {_fmt(c['inband_error_rms_dbfs'],4)} dBFS",
        f"Waveform correlation: {_fmt(c['aligned_waveform_correlation'],6)}",
        f"Gain offset: {_fmt(c['gain_offset_db'],5)} dB",
        f"Multi-resolution spectral convergence mean: {_fmt(c['multi_resolution_spectral_convergence']['mean'],6)}",
        f"Spectral flux correlation: {_fmt(c['spectral_flux']['correlation'],6)}",
        f"Centroid delta: {_fmt(c['spectral_centroid_hz']['delta'],3)} Hz",
        f"Rolloff95 delta: {_fmt(c['spectral_rolloff95_hz']['delta'],3)} Hz",
        "  LSD by band (dB): " + ", ".join(f"{k}={_fmt(v,4)}" for k,v in c['log_spectral_distance_db_by_band'].items()),
        "  Band energy delta (dB): " + ", ".join(f"{k}={_fmt(v,4)}" for k,v in c['band_energy_delta_db'].items()),
        "",
        "[Perceptual super-resolution proxies]",
        f"SR fidelity index: {_fmt(p['sr_fidelity_index'],2)} / 100",
        f"Transient integrity index: {_fmt(p['transient_integrity_index'],2)} / 100",
        f"Transient derivative correlation: {_fmt(p['transient_derivative_correlation'],6)}",
        f"Attack quantile ratio: {_fmt(p['attack_quantile_ratio'],5)}",
        f"High-detail 5.5-18 kHz correlation: {_fmt(p['high_detail_5p5k_18k_correlation'],6)}",
        f"Low-energy ambience envelope correlation: {_fmt(p['low_energy_ambience_envelope_correlation'],6)}",
        f"Local crest-factor MAE: {_fmt(p['local_crest_factor_mae'],6)}",
        "  Microdynamics: " + ", ".join(f"{k}={_fmt(v,6)}" for k,v in p['microdynamics'].items()),
        "",
        "[Bandwidth extension proxies]",
    ]
    if not b.get("available"):
        lines.append("BWE metrics unavailable: analysis Nyquist <= 25 kHz.")
    else:
        lines.extend([
            f"BWE structure index: {_fmt(b['bwe_structure_index'],2)} / 100",
            f"Reference HF/source: {_fmt(b['reference_hf_to_source_db'],4)} dB",
            f"Processed HF/source: {_fmt(b['processed_hf_to_source_db'],4)} dB",
            f"Native >24 kHz reference present: {_fmt(b['native_reference_present'])}",
            f"Generated >24 kHz present: {_fmt(b['generated_hf_present'])}",
            f"Native HF retention: {_fmt(b['native_hf_retention_db'],4)} dB",
            f"Added >24 kHz RMS: {_fmt(b['added_hf_rms_dbfs_above_24k'],4)} dBFS",
            f"Cutoff continuity jump: {_fmt(b['cutoff_continuity_jump_db'],4)} dB",
            f"HF harmonic continuation coherence: {_fmt(b['harmonic_continuation_coherence'],6)}",
            f"HF spectral flatness: {_fmt(b['hf_spectral_flatness'],6)}",
            f"HF transient coupling: {_fmt(b['hf_transient_coupling'],6)} (valid={_fmt(b['hf_transient_coupling_valid'])})",
            f"BWE overgeneration flag: {_fmt(b['bwe_overgeneration_flag'])}",
        ])
    lines += ["", "[Stereo / spatial integrity]"]
    if not s.get("available"):
        lines.append("Stereo metrics unavailable (mono input or output).")
    else:
        lines += [
            f"Stereo integrity index: {_fmt(s['stereo_integrity_index'],2)} / 100",
            "  Deltas: " + ", ".join(f"{k}={_fmt(v,6)}" for k,v in s['delta'].items()),
        ]
    lines += [
        "", "[Safety]",
        f"Processed sample peak: {_fmt(safety['processed']['sample_peak_dbfs'],4)} dBFS",
        f"Processed true-peak 4x proxy: {_fmt(safety['processed']['true_peak_4x_dbfs_proxy'],4)} dBFS",
        f"Clipping ratio: {_fmt(safety['processed']['clipping_ratio'],8)}",
        f"Nonfinite samples: {safety['processed']['nonfinite_count']}",
        f"Flags ({safety['safety_flag_count']}): " + (", ".join(safety['flags']) if safety['flags'] else "none"),
        "",
        "No single overall quality score is produced. Interpret the section metrics according to the DSP goal.",
    ]
    return "\n".join(lines) + "\n"


def _write_wav(path: str, x: np.ndarray, sr: int) -> None:
    sf.write(path, x, sr, subtype="FLOAT")


def selftest() -> Dict[str, Any]:
    sr = 96000
    dur = 3.0
    n = int(sr * dur)
    t = np.arange(n, dtype=np.float64) / sr
    # Deterministic stereo reference with tonal, HF, transient, and ambience-like components.
    base = (0.18*np.sin(2*np.pi*997*t) + 0.10*np.sin(2*np.pi*10007*t) + 0.025*np.sin(2*np.pi*30013*t))
    env = np.ones(n)
    for sec in (0.45, 1.2, 2.1):
        i = int(sec*sr)
        k = min(n-i, int(0.03*sr))
        if k > 0:
            env[i:i+k] += 1.5*np.exp(-np.arange(k)/(0.004*sr))
    ref_m = base * env
    ref = np.column_stack([ref_m, 0.97*np.roll(ref_m, 9)]).astype(np.float32)

    delay = 48
    good = np.zeros_like(ref)
    good[delay:] = ref[:-delay] * 0.999
    # Mild in-band change but retain HF.
    good[:, 0] += (2e-5*np.sin(2*np.pi*27000*t)).astype(np.float32)
    good[:, 1] += (2e-5*np.sin(2*np.pi*27000*t + 0.2)).astype(np.float32)

    bad = np.clip(ref * 7.0, -1.0, 1.0).astype(np.float32)
    nohf = _band_filter(ref_m.astype(np.float32), sr, None, 21000.0)
    nohf = np.column_stack([nohf, nohf]).astype(np.float32)

    with tempfile.TemporaryDirectory() as td:
        rp = os.path.join(td, "ref.wav")
        gp = os.path.join(td, "good.wav")
        bp = os.path.join(td, "bad.wav")
        hp = os.path.join(td, "nohf.wav")
        _write_wav(rp, ref, sr)
        _write_wav(gp, good, sr)
        _write_wav(bp, bad, sr)
        _write_wav(hp, nohf, sr)
        good_r = evaluate(rp, gp, max_seconds=3.0, window_seconds=3.0, max_lag_ms=10.0)
        bad_r = evaluate(rp, bp, max_seconds=3.0, window_seconds=3.0, max_lag_ms=10.0)
        nohf_r = evaluate(rp, hp, max_seconds=3.0, window_seconds=3.0, max_lag_ms=10.0)

        # 48 kHz reference -> 96 kHz processed with synthetic >24 kHz continuation.
        sr48 = 48000
        n48 = int(sr48 * dur)
        t48 = np.arange(n48, dtype=np.float64) / sr48
        r48m = (0.18*np.sin(2*np.pi*997*t48) + 0.10*np.sin(2*np.pi*10007*t48)).astype(np.float32)
        r48 = np.column_stack([r48m, r48m]).astype(np.float32)
        up = _resample(r48, sr48, sr)
        tt = np.arange(up.shape[0], dtype=np.float64) / sr
        up[:,0] += (0.002*np.sin(2*np.pi*30013*tt)).astype(np.float32)
        up[:,1] += (0.002*np.sin(2*np.pi*30013*tt+0.1)).astype(np.float32)
        r48p=os.path.join(td,"ref48.wav"); p96p=os.path.join(td,"proc96.wav")
        _write_wav(r48p,r48,sr48); _write_wav(p96p,up,sr)
        cross_r = evaluate(r48p, p96p, max_seconds=3.0, window_seconds=3.0, max_lag_ms=10.0)

    checks = {
        "alignment_recovers_48_samples": abs(good_r["analysis"]["alignment"]["lag_samples"] - delay) <= 1,
        "good_si_sdr_high": good_r["core_fidelity"]["si_sdr_db"] > 35.0,
        "clipping_flag_detected": "CLIPPING" in bad_r["safety"]["flags"],
        "native_hf_loss_detected": (nohf_r["bandwidth_extension"].get("native_hf_retention_db") or 0.0) < -10.0,
        "no_runtime_dependency": good_r["evaluator"]["runtime_dependency_on_dsp_or_mcp"] is False,
        "cross_rate_bwe_available": cross_r["bandwidth_extension"].get("available") is True,
        "cross_rate_reference_not_native_hf": cross_r["bandwidth_extension"].get("native_reference_present") is False,
        "cross_rate_generated_hf_detected": cross_r["bandwidth_extension"].get("processed_hf_to_source_db", -300) > cross_r["bandwidth_extension"].get("reference_hf_to_source_db", -300) + 10.0,
    }
    return {"pass": all(checks.values()), "checks": checks,
            "good_alignment": good_r["analysis"]["alignment"],
            "good_sr_index": good_r["perceptual_super_resolution"]["sr_fidelity_index"],
            "bad_safety_flags": bad_r["safety"]["flags"],
            "nohf_native_retention_db": nohf_r["bandwidth_extension"].get("native_hf_retention_db"),
            "cross_rate_bwe": cross_r["bandwidth_extension"]}


def _flatten(obj: Any, prefix: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            out.update(_flatten(v, key))
    elif isinstance(obj, list):
        if all(not isinstance(v, (dict, list)) for v in obj):
            out[prefix] = ";".join(str(v) for v in obj)
        else:
            for i, v in enumerate(obj):
                out.update(_flatten(v, f"{prefix}[{i}]"))
    else:
        out[prefix] = obj
    return out


def write_csv(path: str, report: Dict[str, Any]) -> None:
    flat = _flatten(report)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["metric", "value"])
        for k in sorted(flat):
            w.writerow([k, flat[k]])


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="YURIKA Audio fine-grained reference-vs-processed evaluator")
    ap.add_argument("--reference", help="Reference/original audio (WAV/FLAC etc. supported by libsndfile)")
    ap.add_argument("--processed", help="Processed/DSP output audio")
    ap.add_argument("--json", dest="json_path", help="Write JSON report")
    ap.add_argument("--text", dest="text_path", help="Write text report")
    ap.add_argument("--csv", dest="csv_path", help="Write flattened metric/value CSV for regression history")
    ap.add_argument("--fail-on-safety", action="store_true", help="Return exit code 3 when safety flags are present")
    ap.add_argument("--max-seconds", type=float, default=30.0, help="Total stratified audio seconds to analyze (default: 30)")
    ap.add_argument("--window-seconds", type=float, default=5.0, help="Each stratified analysis window length (default: 5)")
    ap.add_argument("--max-lag-ms", type=float, default=500.0, help="Maximum alignment search lag in ms (default: 500)")
    ap.add_argument("--selftest", action="store_true", help="Run deterministic evaluator self-test")
    ap.add_argument("--version", action="version", version=VERSION)
    args = ap.parse_args(argv)

    if args.selftest:
        r = selftest()
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return 0 if r["pass"] else 1
    if not args.reference or not args.processed:
        ap.error("--reference and --processed are required unless --selftest is used")
    for p in (args.reference, args.processed):
        if not os.path.isfile(p):
            ap.error(f"file not found: {p}")
    r = evaluate(args.reference, args.processed, max_seconds=args.max_seconds,
                 window_seconds=args.window_seconds, max_lag_ms=args.max_lag_ms)
    text = render_text(r)
    print(text, end="")
    if args.json_path:
        Path(args.json_path).write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.text_path:
        Path(args.text_path).write_text(text, encoding="utf-8")
    if args.csv_path:
        write_csv(args.csv_path, r)
    if args.fail_on_safety and r["safety"]["safety_flag_count"] > 0:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
