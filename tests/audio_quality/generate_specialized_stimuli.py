from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
HERE = Path(__file__).resolve().parent
RNG = np.random.default_rng(20260925)


def fade(x: np.ndarray, n: int = 480) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64).copy()
    if len(x) >= 2 * n:
        w = np.linspace(0.0, 1.0, n, dtype=np.float64)
        x[:n] *= w
        x[-n:] *= w[::-1]
    return x


def band_noise(seconds: float, lo: float = 120.0, hi: float = 16000.0, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(20260925 + seed)
    n = int(round(seconds * SR))
    x = rng.standard_normal(n)
    sos = signal.butter(6, [lo / (SR / 2), hi / (SR / 2)], btype='bandpass', output='sos')
    x = signal.sosfiltfilt(sos, x)
    x /= max(np.max(np.abs(x)), 1e-12)
    return fade(x * 0.22)


def frac_delay(x: np.ndarray, delay_samples: float) -> np.ndarray:
    # Positive delay moves signal later. Out-of-range samples are zero.
    idx = np.arange(len(x), dtype=np.float64) - float(delay_samples)
    return np.interp(idx, np.arange(len(x), dtype=np.float64), x, left=0.0, right=0.0)


def split_low_high(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    sos_low = signal.butter(4, 1500 / (SR / 2), btype='lowpass', output='sos')
    sos_high = signal.butter(4, 2000 / (SR / 2), btype='highpass', output='sos')
    return signal.sosfiltfilt(sos_low, x), signal.sosfiltfilt(sos_high, x)


def encode_azimuth(x: np.ndarray, angle_deg: float) -> np.ndarray:
    """Deterministic synthetic binaural cue target, not a measured human HRTF."""
    s = np.sin(np.deg2rad(angle_deg))
    itd_us = 650.0 * s
    ild_low_db = 1.5 * s
    ild_high_db = 8.0 * s
    low, high = split_low_high(x)

    # Positive angle = source on right. Right is louder and earlier.
    l = low * 10 ** (-ild_low_db / 40) + high * 10 ** (-ild_high_db / 40)
    r = low * 10 ** ( ild_low_db / 40) + high * 10 ** ( ild_high_db / 40)
    d = abs(itd_us) * SR / 1e6
    if itd_us > 0:
        l = frac_delay(l, d)
    elif itd_us < 0:
        r = frac_delay(r, d)
    y = np.stack([l, r], axis=1)
    pk = np.max(np.abs(y))
    if pk > 0.30:
        y *= 0.30 / pk
    return y.astype(np.float32)


def spectral_shape(x: np.ndarray, peaks: list[tuple[float, float, float]]) -> np.ndarray:
    # peaks: center Hz, gain dB, sigma octaves. Frequency-domain smooth shape.
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    shape_db = np.zeros_like(f)
    safe_f = np.maximum(f, 20.0)
    for fc, gain_db, sigma_oct in peaks:
        octdist = np.log2(safe_f / fc)
        shape_db += gain_db * np.exp(-0.5 * (octdist / sigma_oct) ** 2)
    X *= 10 ** (shape_db / 20)
    y = np.fft.irfft(X, n=n)
    return y


def add_segment(parts, metadata, name, y):
    start = sum(len(p) for p in parts) / SR
    parts.append(np.asarray(y, dtype=np.float32))
    end = sum(len(p) for p in parts) / SR
    metadata['segments'][name] = {'start': round(start, 6), 'end': round(end, 6)}


def spacer(parts, sec=0.10):
    parts.append(np.zeros((int(round(sec * SR)), 2), np.float32))


def make_spatial():
    parts = []
    meta = {
        'sample_rate': SR,
        'kind': 'synthetic-localization-cue-benchmark',
        'notes': [
            'Azimuth stimuli use deterministic synthetic ITD/ILD cues; they are not individualized HRTFs.',
            'Front/back and elevation segments encode synthetic spectral cue classes for cue-retention testing.',
            'Reported localization metrics are objective cue proxies, not human-listener localization scores.'
        ],
        'segments': {},
        'azimuth_targets_deg': [-60, -30, 0, 30, 60],
        'azimuth_model': {'max_itd_us': 650.0, 'max_highband_ild_db': 8.0}
    }
    spacer(parts, 0.30)

    base = band_noise(0.72, seed=1)
    for angle in meta['azimuth_targets_deg']:
        add_segment(parts, meta, f'az_{angle:+d}', encode_azimuth(base, angle))
        spacer(parts, 0.12)

    # Same left/right cues, different high-frequency spectral signatures.
    fb_base = band_noise(0.82, seed=2)
    front = spectral_shape(fb_base, [(3800, +3.2, 0.34), (8200, -4.0, 0.28), (12000, +1.4, 0.30)])
    rear  = spectral_shape(fb_base, [(3800, -3.0, 0.34), (8200, +3.5, 0.28), (12000, -1.0, 0.30)])
    add_segment(parts, meta, 'front_30', encode_azimuth(front, 30)); spacer(parts, 0.12)
    add_segment(parts, meta, 'rear_30',  encode_azimuth(rear, 30));  spacer(parts, 0.12)

    # Elevation classes are represented by a broad notch that moves with class.
    elev_base = band_noise(0.82, seed=3)
    elev_specs = {'elev_-30': 6000.0, 'elev_0': 8200.0, 'elev_+30': 10800.0}
    meta['elevation_notch_hz'] = elev_specs
    for name, fc in elev_specs.items():
        shaped = spectral_shape(elev_base, [(fc, -7.0, 0.16), (fc * 0.55, +1.2, 0.28)])
        add_segment(parts, meta, name, np.stack([shaped, shaped], axis=1))
        spacer(parts, 0.12)

    # Center broadband for IACC / center stability.
    center = band_noise(0.82, seed=4)
    add_segment(parts, meta, 'center_broadband', np.stack([center, center], axis=1)); spacer(parts, 0.12)

    # Synchronized impulses for direct/early-reflection analysis.
    n = int(0.45 * SR)
    imp = np.zeros((n, 2), np.float32)
    imp[int(0.05 * SR), :] = 0.45
    add_segment(parts, meta, 'center_impulse', imp)
    spacer(parts, 0.25)

    y = np.concatenate(parts, axis=0)
    sf.write(HERE / 'spatial-localization-stimulus.wav', y, SR, subtype='PCM_24')
    (HERE / 'spatial-localization-metadata.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return y, meta


def make_amp():
    parts = []
    meta = {
        'sample_rate': SR,
        'kind': 'virtual-class-a-amplifier-benchmark',
        'segments': {},
        'rated_level_dbfs_peak': -1.7609125906,
        'reference_load_ohm': 6,
        'reference_rated_power_w_ch': 8,
        'reference_max_power_w_ch': 12,
        'notes': ['Electrical power figures are software reference-model mappings, not physical PC output power.']
    }
    spacer(parts, 0.50)
    t = np.arange(SR, dtype=np.float64) / SR

    def sine(freq, peak_dbfs, sec=1.0, right_same=True):
        n = int(round(sec * SR)); tt = np.arange(n) / SR
        x = (10 ** (peak_dbfs / 20)) * np.sin(2 * np.pi * freq * tt)
        x = fade(x)
        return np.stack([x, x if right_same else np.zeros_like(x)], axis=1)

    add_segment(parts, meta, 'rated_1k', sine(1000, meta['rated_level_dbfs_peak'])); spacer(parts, .10)
    add_segment(parts, meta, 'low_1k', sine(1000, -24.0)); spacer(parts, .10)

    # CCIF 19/20 kHz, normalized to -6 dBFS peak combined.
    x = np.sin(2*np.pi*19000*t) + np.sin(2*np.pi*20000*t)
    x *= (10**(-6/20)) / max(np.max(np.abs(x)), 1e-12)
    add_segment(parts, meta, 'ccif_19_20', np.stack([fade(x), fade(x)], axis=1)); spacer(parts, .10)

    # SMPTE-style 60 Hz + 7 kHz, 4:1 amplitude ratio, -6 dBFS peak combined.
    x = 4*np.sin(2*np.pi*60*t) + np.sin(2*np.pi*7000*t)
    x *= (10**(-6/20)) / max(np.max(np.abs(x)), 1e-12)
    add_segment(parts, meta, 'smpte_60_7k', np.stack([fade(x), fade(x)], axis=1)); spacer(parts, .10)

    # Dense multitone for transfer response.
    freqs = [20,40,80,160,315,630,1000,1250,2500,5000,10000,16000,20000]
    ph = RNG.uniform(0, 2*np.pi, len(freqs))
    x = sum(np.sin(2*np.pi*f*t+p) for f,p in zip(freqs, ph))
    x *= 0.35 / max(np.max(np.abs(x)), 1e-12)
    add_segment(parts, meta, 'multitone', np.stack([fade(x), fade(x)], axis=1)); spacer(parts, .10)
    meta['multitone_freqs_hz'] = freqs

    add_segment(parts, meta, 'left_only_1k', sine(1000, -12.0, right_same=False)); spacer(parts, .10)
    lo = sine(1000, -12.0, right_same=False)
    ro = lo[:, ::-1].copy()
    add_segment(parts, meta, 'right_only_1k', ro); spacer(parts, .10)

    # Fast transient train.
    n = SR
    x = np.zeros(n)
    for i in range(int(.08*SR), n, int(.1*SR)):
        x[i] = 0.70
    kernel = np.exp(-np.arange(int(.008*SR)) / (.0013*SR))
    x = np.convolve(x, kernel, mode='same')[:n]
    add_segment(parts, meta, 'transient', np.stack([x, x], axis=1)); spacer(parts, .10)

    add_segment(parts, meta, 'nearfull_997', sine(997, -0.30)); spacer(parts, .25)
    spacer(parts, .50)

    y = np.concatenate(parts, axis=0).astype(np.float32)
    sf.write(HERE / 'amp-benchmark-stimulus.wav', y, SR, subtype='PCM_24')
    (HERE / 'amp-benchmark-metadata.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return y, meta


if __name__ == '__main__':
    s, sm = make_spatial()
    a, am = make_amp()
    print(f'spatial stimulus: {len(s)/SR:.3f}s peak={np.max(np.abs(s)):.6f}')
    print(f'amp stimulus: {len(a)/SR:.3f}s peak={np.max(np.abs(a)):.6f}')
