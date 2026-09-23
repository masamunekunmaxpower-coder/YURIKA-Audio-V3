from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

try:
    import pyloudnorm as pyln
except Exception:
    pyln = None

HERE = Path(__file__).resolve().parent
LEGACY_REF = Path(os.environ.get("YURIKA_REF_FILE", HERE / "quality-stimulus.wav"))
RESULTS = Path(os.environ.get("YURIKA_RESULTS_DIR", HERE / "results"))
PROFILES = ["neutral", "clean", "music", "selfdap"]

SEG = {
    "silence": (0.00, 0.25),
    "sweep": (0.25, 1.25),
    "sine": (1.25, 2.25),
    "twotone": (2.25, 3.25),
    "multitone": (3.25, 4.25),
    "stereo": (4.25, 5.25),
    "transient": (5.25, 6.25),
    "music": (6.25, 7.25),
}

FREQS = np.array([63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], float)


def rms(x):
    x = np.asarray(x, dtype=np.float64)
    return float(np.sqrt(np.mean(np.square(x)) + 1e-30))


def db(x):
    return 20 * np.log10(np.maximum(np.asarray(x), 1e-15))


def corr_align(ref, out, maxlag):
    r = np.mean(ref, axis=1)
    o = np.mean(out, axis=1)
    n = min(len(r), len(o))
    r = r[:n]
    o = o[:n]
    c = signal.correlate(o, r, mode="full", method="fft")
    lags = signal.correlation_lags(len(o), len(r), mode="full")
    mask = np.abs(lags) <= maxlag
    lag = int(lags[mask][np.argmax(c[mask])])
    return lag


def aligned(ref, out, lag):
    if lag >= 0:
        o = out[lag:]
        r = ref[: len(o)]
    else:
        r = ref[-lag:]
        o = out[: len(r)]
    n = min(len(r), len(o))
    return r[:n], o[:n]


def crop_stimulus(ref, out, pre_frames, stimulus_frames):
    start = max(0, int(pre_frames))
    end = start + max(1, int(stimulus_frames))
    n = min(len(ref), len(out), end)
    if n <= start:
        raise ValueError("capture shorter than declared pre-roll/stimulus window")
    return ref[start:n], out[start:n]


def slice_seg(x, sr, name):
    a, b = SEG[name]
    return x[int(a * sr) : int(b * sr)]


def tone_complex(x, sr, f):
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    t = np.arange(n) / sr
    return (np.sqrt(2.0) / n) * np.sum(x * np.exp(-2j * np.pi * f * t))


def tone_amp(x, sr, f):
    return float(abs(tone_complex(x, sr, f)))


def thdn_1k(x, sr):
    if x.ndim == 2:
        x = np.mean(x, axis=1)
    x = x[int(0.12 * sr) : int(0.88 * sr)]
    n = len(x)
    t = np.arange(n) / sr
    A = np.column_stack(
        [np.sin(2 * np.pi * 1000 * t), np.cos(2 * np.pi * 1000 * t), np.ones(n)]
    )
    coef = np.linalg.lstsq(A, x, rcond=None)[0]
    fit = A @ coef
    fund = rms(fit - np.mean(fit))
    resid = rms(x - fit)
    return 20 * math.log10(max(resid, 1e-15) / max(fund, 1e-15))


def imd_19_20(x, sr):
    if x.ndim == 2:
        x = np.mean(x, axis=1)
    x = x[int(0.12 * sr) : int(0.88 * sr)]
    a19 = tone_amp(x, sr, 19000)
    a20 = tone_amp(x, sr, 20000)
    a1 = tone_amp(x, sr, 1000)
    ref = max((a19 + a20) / 2, 1e-15)
    return 20 * math.log10(max(a1, 1e-15) / ref)


def multitone_response(ref, out, sr):
    rr = np.mean(slice_seg(ref, sr, "multitone"), axis=1)
    oo = np.mean(slice_seg(out, sr, "multitone"), axis=1)
    vals = []
    for f in FREQS:
        vals.append(
            float(
                20
                * np.log10(
                    max(tone_amp(oo, sr, f), 1e-15)
                    / max(tone_amp(rr, sr, f), 1e-15)
                )
            )
        )
    return vals


def multitone_phase(ref, out, sr):
    rr = np.mean(slice_seg(ref, sr, "multitone"), axis=1)
    oo = np.mean(slice_seg(out, sr, "multitone"), axis=1)
    vals = []
    for f in FREQS:
        rc = tone_complex(rr, sr, f)
        oc = tone_complex(oo, sr, f)
        deg = np.angle(oc * np.conj(rc), deg=True)
        vals.append(float(((deg + 180.0) % 360.0) - 180.0))
    return vals


def stereo_xtalk(x, sr):
    s = slice_seg(x, sr, "stereo")
    L, R = s[:, 0], s[:, 1]
    lown = tone_amp(L, sr, 997)
    lcross = tone_amp(L, sr, 1499)
    rown = tone_amp(R, sr, 1499)
    rcross = tone_amp(R, sr, 997)
    return [
        20 * math.log10(max(lcross, 1e-15) / max(lown, 1e-15)),
        20 * math.log10(max(rcross, 1e-15) / max(rown, 1e-15)),
    ]


def sisdr(ref, out):
    vals = []
    for ch in range(2):
        s = ref[:, ch].astype(np.float64)
        y = out[:, ch].astype(np.float64)
        s -= s.mean()
        y -= y.mean()
        a = np.dot(y, s) / (np.dot(s, s) + 1e-30)
        target = a * s
        e = y - target
        vals.append(
            10
            * np.log10(
                (np.dot(target, target) + 1e-30) / (np.dot(e, e) + 1e-30)
            )
        )
    return float(np.mean(vals))


def bandlimited_pair(ref, out, sr, low=40.0, high=18000.0):
    nyq = sr / 2.0
    high = min(high, nyq * 0.92)
    if high <= low * 1.2:
        return ref, out
    sos = signal.butter(4, [low, high], btype="bandpass", fs=sr, output="sos")
    rr = signal.sosfiltfilt(sos, ref, axis=0)
    oo = signal.sosfiltfilt(sos, out, axis=0)
    return rr, oo


def lsd(ref, out, sr):
    vals = []
    for ch in range(2):
        f, _, R = signal.stft(
            ref[:, ch], sr, nperseg=2048, noverlap=1536, boundary=None
        )
        _, _, O = signal.stft(
            out[:, ch], sr, nperseg=2048, noverlap=1536, boundary=None
        )
        n = min(R.shape[1], O.shape[1])
        m = (f >= 40) & (f <= min(20000, sr * 0.45))
        d = (
            20 * np.log10(np.maximum(np.abs(O[m, :n]), 1e-10))
            - 20 * np.log10(np.maximum(np.abs(R[m, :n]), 1e-10))
        )
        vals.append(float(np.sqrt(np.mean(d * d))))
    return float(np.mean(vals))


def loudness(x, sr):
    if pyln is None:
        return None
    try:
        return float(pyln.Meter(sr).integrated_loudness(x))
    except Exception:
        return None


def crest_db(x):
    x = np.asarray(x, dtype=np.float64)
    return float(
        20 * np.log10((np.max(np.abs(x)) + 1e-15) / (rms(x) + 1e-15))
    )


def noise_floor_dbfs(x, sr):
    s = slice_seg(x, sr, "silence")
    return float(db(rms(s)))


def idle_noise_floor_dbfs(x, pre_frames):
    n = max(0, min(len(x), int(pre_frames)))
    if n < 64:
        return -300.0
    return float(db(rms(x[:n])))


def dc_dbfs(x):
    return float(db(abs(float(np.mean(x)))))


def transient_metrics(ref, out, sr):
    r = slice_seg(ref, sr, "transient")
    o = slice_seg(out, sr, "transient")
    rpk = max(float(np.max(np.abs(r))), 1e-15)
    opk = max(float(np.max(np.abs(o))), 1e-15)
    rr = max(rms(r), 1e-15)
    ro = max(rms(o), 1e-15)
    return {
        "peak_delta_db": float(20 * np.log10(opk / rpk)),
        "rms_delta_db": float(20 * np.log10(ro / rr)),
        "crest_delta_db": float(crest_db(o) - crest_db(r)),
    }


def music_dynamics(ref, out, sr):
    r = slice_seg(ref, sr, "music")
    o = slice_seg(out, sr, "music")
    return {
        "rms_delta_db": float(
            20 * np.log10(max(rms(o), 1e-15) / max(rms(r), 1e-15))
        ),
        "crest_delta_db": float(crest_db(o) - crest_db(r)),
    }


def technical_score(m, neutral=False):
    # Diagnostic convenience only. Not MOS and not a preference score.
    score = 100.0

    if m["nonfinite"] > 0:
        score -= 60
    if m["clip_samples"] > 0:
        score -= 35
    if m["peak_dbfs"] > -0.05:
        score -= 8

    if m["thdn_db"] > -25:
        score -= 15
    elif m["thdn_db"] > -35:
        score -= 6

    if m["imd_1khz_db"] > -35:
        score -= 12
    elif m["imd_1khz_db"] > -45:
        score -= 5

    if m["noise_floor_dbfs"] > -70:
        score -= 6

    # Correct sign test: -40 dBFS DC is bad, -180 dBFS is excellent.
    if m["dc_dbfs"] > -55:
        score -= 5

    if neutral:
        if m["latency_ms"] > 100:
            score -= 20
        elif m["latency_ms"] > 50:
            score -= 10

        fr = np.array(m["multitone_db"])
        dev = float(np.max(np.abs(fr)))
        if dev > 1.5:
            score -= 18
        elif dev > 0.5:
            score -= 6

        if max(m["stereo_crosstalk_db"]) > -35:
            score -= 10

        # SI-SDR is retained as a diagnostic, but no longer dominates the score.
        if m["si_sdr_db"] < 8:
            score -= 15
        elif m["si_sdr_db"] < 15:
            score -= 7

    return round(max(0, score), 1)


def load_status(profile):
    p = RESULTS / f"{profile}.status.json"
    if not p.exists():
        return {}, {}
    raw = json.loads(p.read_text(encoding="utf-8"))
    if "runtime_status" in raw or "capture_meta" in raw:
        return raw.get("runtime_status", {}), raw.get("capture_meta", {})
    # Backward compatibility with v2 status files.
    return raw, {}


def load_pair(profile):
    out_path = RESULTS / f"{profile}.wav"
    ref_path = RESULTS / f"{profile}.reference.wav"

    if not out_path.exists():
        return None

    out, sro = sf.read(out_path, always_2d=True, dtype="float32")

    if ref_path.exists():
        ref, srr = sf.read(ref_path, always_2d=True, dtype="float32")
    else:
        # Legacy fallback only. New runs should always have matched references.
        ref, srr = sf.read(LEGACY_REF, always_2d=True, dtype="float32")

    if sro != srr:
        from math import gcd

        g = gcd(int(sro), int(srr))
        out = signal.resample_poly(
            out, int(srr // g), int(sro // g), axis=0
        ).astype(np.float32)
        sro = srr

    return ref, out, int(srr)


def analyze():
    report = {
        "version": 3,
        "profiles": {},
        "notes": [
            "technical_score is a diagnostic heuristic, not MOS or a listening-preference score.",
            "v3 compares DSP output against a browser-matched direct bypass captured in the same AudioContext.",
            "latency is measured between matched captures and excludes the intentional capture pre-roll.",
        ],
    }

    for p in PROFILES:
        pair = load_pair(p)
        if pair is None:
            continue

        ref_capture, out_capture, sr = pair
        runtime_status, capture_meta = load_status(p)

        maxlag = int(0.50 * sr)
        lag = corr_align(ref_capture, out_capture, maxlag)
        r_aligned, o_aligned = aligned(ref_capture, out_capture, lag)

        pre_frames = int(
            capture_meta.get("preRollFrames", round(0.30 * sr))
        )
        stim_frames = int(
            capture_meta.get(
                "stimulusFrames",
                max(1, min(len(r_aligned), len(o_aligned)) - pre_frames),
            )
        )

        r, o = crop_stimulus(
            r_aligned, o_aligned, pre_frames, stim_frames
        )

        n = min(len(r), len(o))
        r = r[:n]
        o = o[:n]

        br, bo = bandlimited_pair(r, o, sr)

        m = {}
        m["runtime_sample_rate"] = sr
        m["reference_mode"] = (
            capture_meta.get("comparisonReference", "legacy-file")
        )
        m["latency_samples"] = lag
        m["latency_ms"] = round(lag * 1000 / sr, 3)

        m["peak_dbfs"] = round(float(db(np.max(np.abs(o)))), 3)
        m["rms_dbfs"] = round(float(db(rms(o))), 3)
        m["gain_delta_db"] = round(
            float(
                20
                * np.log10(
                    max(rms(o), 1e-15) / max(rms(r), 1e-15)
                )
            ),
            3,
        )

        m["nonfinite"] = int(
            np.size(o) - np.count_nonzero(np.isfinite(o))
        )
        m["clip_samples"] = int(np.count_nonzero(np.abs(o) >= 1.0))

        m["noise_floor_dbfs"] = round(noise_floor_dbfs(o, sr), 3)
        m["idle_noise_floor_dbfs"] = round(
            idle_noise_floor_dbfs(o_aligned, pre_frames), 3
        )
        m["dc_dbfs"] = round(dc_dbfs(o), 3)

        m["si_sdr_db"] = round(sisdr(r, o), 3)
        m["si_sdr_40_18k_db"] = round(sisdr(br, bo), 3)
        m["lsd_db"] = round(lsd(r, o, sr), 3)

        m["thdn_db"] = round(
            thdn_1k(slice_seg(o, sr, "sine"), sr), 3
        )
        m["imd_1khz_db"] = round(
            imd_19_20(slice_seg(o, sr, "twotone"), sr), 3
        )

        m["multitone_db"] = [
            round(x, 3) for x in multitone_response(r, o, sr)
        ]
        m["multitone_phase_deg"] = [
            round(x, 3) for x in multitone_phase(r, o, sr)
        ]
        m["max_phase_deviation_deg"] = round(
            float(np.max(np.abs(m["multitone_phase_deg"]))), 3
        )

        m["stereo_crosstalk_db"] = [
            round(x, 3) for x in stereo_xtalk(o, sr)
        ]

        lr = [rms(o[:, 0]), rms(o[:, 1])]
        m["lr_balance_db"] = round(
            float(
                20
                * np.log10(
                    max(lr[0], 1e-15) / max(lr[1], 1e-15)
                )
            ),
            3,
        )

        c = np.corrcoef(o[:, 0], o[:, 1])[0, 1]
        m["stereo_correlation"] = round(float(c), 6)

        lref = loudness(r, sr)
        lout = loudness(o, sr)
        m["lufs"] = None if lout is None else round(lout, 3)
        m["lufs_delta"] = (
            None
            if lref is None or lout is None
            else round(lout - lref, 3)
        )

        tr = transient_metrics(r, o, sr)
        m["transient_peak_delta_db"] = round(
            tr["peak_delta_db"], 3
        )
        m["transient_rms_delta_db"] = round(
            tr["rms_delta_db"], 3
        )
        m["transient_crest_delta_db"] = round(
            tr["crest_delta_db"], 3
        )

        md = music_dynamics(r, o, sr)
        m["music_rms_delta_db"] = round(md["rms_delta_db"], 3)
        m["music_crest_delta_db"] = round(
            md["crest_delta_db"], 3
        )

        m["technical_score"] = technical_score(
            m, neutral=(p == "neutral")
        )
        m["runtime_status"] = runtime_status
        m["capture_meta"] = capture_meta

        report["profiles"][p] = m

    critical = []
    warnings = []

    if "neutral" in report["profiles"]:
        n = report["profiles"]["neutral"]
        fr = np.array(n["multitone_db"])
        max_fr = float(np.max(np.abs(fr)))

        if n["nonfinite"] or n["clip_samples"]:
            critical.append("neutral non-finite/clipping")
        if max_fr > 1.5:
            critical.append("neutral multitone deviation > 1.5 dB")
        if n["thdn_db"] > -45:
            critical.append("neutral THD+N > -45 dB")
        if n["imd_1khz_db"] > -60:
            critical.append("neutral IMD 1 kHz > -60 dB")
        if max(n["stereo_crosstalk_db"]) > -35:
            critical.append("neutral stereo crosstalk > -35 dB")
        if n["noise_floor_dbfs"] > -60:
            critical.append("neutral stimulus-silence noise floor > -60 dBFS")
        if n["idle_noise_floor_dbfs"] > -60:
            critical.append("neutral idle noise floor > -60 dBFS")
        if n["dc_dbfs"] > -55:
            critical.append("neutral DC > -55 dBFS")
        if n["latency_ms"] > 50:
            critical.append("neutral latency > 50 ms")

        # SI-SDR is no longer a single-metric pass/fail oracle.
        if n["si_sdr_db"] < 8:
            critical.append("neutral SI-SDR < 8 dB")
        elif n["si_sdr_db"] < 25:
            warnings.append("neutral SI-SDR < 25 dB")
        if n["si_sdr_40_18k_db"] < 25:
            warnings.append("neutral band-limited SI-SDR < 25 dB")
        if n["lsd_db"] > 2.0:
            warnings.append("neutral LSD > 2.0 dB")
        if n["max_phase_deviation_deg"] > 30:
            warnings.append("neutral phase deviation > 30 degrees")

    for p, m in report["profiles"].items():
        if m["nonfinite"] or m["clip_samples"]:
            critical.append(f"{p} non-finite/clipping")

    if len(report["profiles"]) != 4:
        critical.append("not all four profiles were measured")

    report["gate"] = "PASS" if not critical else "FAIL"
    report["critical"] = sorted(set(critical))
    report["warnings"] = sorted(set(warnings))

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    lines = [
        "# YURIKA Audio Comprehensive Quality Report v3",
        "",
        f"Gate: **{report['gate']}**",
        "",
        "| Profile | SR Hz | Diagnostic | Peak dBFS | Noise dBFS | SI-SDR dB | SI-SDR 40-18k dB | LSD dB | THD+N dB | IMD 1k dB | Latency ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for p, m in report["profiles"].items():
        lines.append(
            f"| {p} | {m['runtime_sample_rate']} | {m['technical_score']:.1f} | "
            f"{m['peak_dbfs']:.2f} | {m['noise_floor_dbfs']:.2f} | "
            f"{m['si_sdr_db']:.2f} | {m['si_sdr_40_18k_db']:.2f} | "
            f"{m['lsd_db']:.2f} | {m['thdn_db']:.2f} | "
            f"{m['imd_1khz_db']:.2f} | {m['latency_ms']:.3f} |"
        )

    lines += [
        "",
        "## Multitone magnitude (dB vs matched reference)",
        "",
        "| Profile | " + " | ".join(str(int(f)) for f in FREQS) + " |",
        "|---|" + "|".join(["---:"] * len(FREQS)) + "|",
    ]
    for p, m in report["profiles"].items():
        lines.append(
            "| "
            + p
            + " | "
            + " | ".join(f"{x:.2f}" for x in m["multitone_db"])
            + " |"
        )

    lines += [
        "",
        "## Multitone phase (degrees vs matched reference)",
        "",
        "| Profile | " + " | ".join(str(int(f)) for f in FREQS) + " |",
        "|---|" + "|".join(["---:"] * len(FREQS)) + "|",
    ]
    for p, m in report["profiles"].items():
        lines.append(
            "| "
            + p
            + " | "
            + " | ".join(
                f"{x:.1f}" for x in m["multitone_phase_deg"]
            )
            + " |"
        )

    lines += [
        "",
        "## Dynamics / stereo",
        "",
        "| Profile | Gain Δ dB | LUFS Δ | L/R bal dB | Crosstalk L/R dB | Music crest Δ dB | Transient crest Δ dB | Idle noise dBFS |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for p, m in report["profiles"].items():
        lu = (
            "n/a"
            if m["lufs_delta"] is None
            else f"{m['lufs_delta']:.2f}"
        )
        xt = (
            f"{m['stereo_crosstalk_db'][0]:.1f}/"
            f"{m['stereo_crosstalk_db'][1]:.1f}"
        )
        lines.append(
            f"| {p} | {m['gain_delta_db']:.2f} | {lu} | "
            f"{m['lr_balance_db']:.2f} | {xt} | "
            f"{m['music_crest_delta_db']:.2f} | "
            f"{m['transient_crest_delta_db']:.2f} | "
            f"{m['idle_noise_floor_dbfs']:.2f} |"
        )

    lines += [
        "",
        "> `Diagnostic` is a fault-finding heuristic, not MOS and not a claim that a higher number sounds better.",
        "",
        "> v3 uses a same-context direct-bypass reference for every profile. 44.1/48/96 kHz profiles are therefore compared at their native runtime sample rate rather than forcing the DSP result back to 48 kHz.",
        "",
        "> The hard gate combines catastrophic defects, neutral-path frequency response, distortion, noise, crosstalk, DC and true path latency. SI-SDR remains important, but is no longer allowed to fail the build by itself unless it is extremely low.",
    ]

    if report["warnings"]:
        lines += ["", "## Warnings"] + [
            f"- {x}" for x in report["warnings"]
        ]

    if report["critical"]:
        lines += ["", "## Critical findings"] + [
            f"- {x}" for x in report["critical"]
        ]

    (RESULTS / "report.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )

    print("\n".join(lines))
    return report


if __name__ == "__main__":
    report = analyze()
    sys.exit(1 if report["gate"] != "PASS" else 0)
