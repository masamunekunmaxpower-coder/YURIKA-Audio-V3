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
LEGACY_REF = Path(
    os.environ.get("YURIKA_REF_FILE", HERE / "quality-stimulus.wav")
)
RESULTS = Path(
    os.environ.get("YURIKA_RESULTS_DIR", HERE / "results")
)

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

ANALYSIS_END = max(b for _, b in SEG.values())
FREQS = np.array(
    [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    float,
)


def rms(x):
    x = np.asarray(x, dtype=np.float64)
    return float(np.sqrt(np.mean(np.square(x)) + 1e-30))


def db(x):
    return 20 * np.log10(np.maximum(np.asarray(x), 1e-15))


def corr_align(ref, out, maxlag):
    r = np.mean(ref, axis=1)
    o = np.mean(out, axis=1)
    n = min(len(r), len(o), int(ANALYSIS_END * 192000))
    r = r[:n]
    o = o[:n]
    c = signal.correlate(o, r, mode="full", method="fft")
    lags = signal.correlation_lags(
        len(o), len(r), mode="full"
    )
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


def slice_seg(x, sr, name):
    a, b = SEG[name]
    return x[int(a * sr) : int(b * sr)]


def tone_complex(x, sr, f):
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    t = np.arange(n) / sr
    return (np.sqrt(2.0) / n) * np.sum(
        x * np.exp(-2j * np.pi * f * t)
    )


def tone_amp(x, sr, f):
    return float(abs(tone_complex(x, sr, f)))


def thdn_1k(x, sr):
    if x.ndim == 2:
        x = np.mean(x, axis=1)
    x = x[int(0.12 * sr) : int(0.88 * sr)]
    n = len(x)
    t = np.arange(n) / sr
    A = np.column_stack(
        [
            np.sin(2 * np.pi * 1000 * t),
            np.cos(2 * np.pi * 1000 * t),
            np.ones(n),
        ]
    )
    coef = np.linalg.lstsq(A, x, rcond=None)[0]
    fit = A @ coef
    fund = rms(fit - np.mean(fit))
    resid = rms(x - fit)
    return 20 * math.log10(
        max(resid, 1e-15) / max(fund, 1e-15)
    )


def imd_19_20(x, sr):
    if x.ndim == 2:
        x = np.mean(x, axis=1)
    x = x[int(0.12 * sr) : int(0.88 * sr)]
    a19 = tone_amp(x, sr, 19000)
    a20 = tone_amp(x, sr, 20000)
    a1 = tone_amp(x, sr, 1000)
    reference = max((a19 + a20) / 2, 1e-15)
    return 20 * math.log10(max(a1, 1e-15) / reference)


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
        20
        * math.log10(
            max(lcross, 1e-15) / max(lown, 1e-15)
        ),
        20
        * math.log10(
            max(rcross, 1e-15) / max(rown, 1e-15)
        ),
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
                (np.dot(target, target) + 1e-30)
                / (np.dot(e, e) + 1e-30)
            )
        )
    return float(np.mean(vals))


def bandlimit(x, sr, lo=30.0, hi=18000.0):
    nyq = sr / 2.0
    high = min(float(hi), nyq * 0.90)
    low = max(float(lo), 5.0)
    if not (0 < low < high < nyq):
        return np.asarray(x, dtype=np.float64)
    sos = signal.butter(
        4,
        [low / nyq, high / nyq],
        btype="bandpass",
        output="sos",
    )
    return signal.sosfiltfilt(
        sos,
        np.asarray(x, dtype=np.float64),
        axis=0,
    )


def sisdr_band(ref, out, sr):
    return sisdr(
        bandlimit(ref, sr),
        bandlimit(out, sr),
    )


def lsd(ref, out, sr):
    vals = []
    for ch in range(2):
        f, _, R = signal.stft(
            ref[:, ch],
            sr,
            nperseg=2048,
            noverlap=1536,
            boundary=None,
        )
        _, _, O = signal.stft(
            out[:, ch],
            sr,
            nperseg=2048,
            noverlap=1536,
            boundary=None,
        )
        n = min(R.shape[1], O.shape[1])
        mask = (f >= 40) & (f <= min(20000, sr * 0.45))
        d = (
            20
            * np.log10(
                np.maximum(np.abs(O[mask, :n]), 1e-10)
            )
            - 20
            * np.log10(
                np.maximum(np.abs(R[mask, :n]), 1e-10)
            )
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
        20
        * np.log10(
            (np.max(np.abs(x)) + 1e-15)
            / (rms(x) + 1e-15)
        )
    )


def noise_floor_dbfs(x, sr):
    return float(db(rms(slice_seg(x, sr, "silence"))))


def dc_dbfs(x, sr):
    # Estimate DC only during the dedicated silence segment. Measuring the
    # mean of the full program is invalid because asymmetric audio content
    # can have a non-zero sample mean without any electrical/DC offset.
    silence = slice_seg(x, sr, "silence")
    return float(db(abs(float(np.mean(silence)))))


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
        "crest_delta_db": float(
            crest_db(o) - crest_db(r)
        ),
    }


def music_dynamics(ref, out, sr):
    r = slice_seg(ref, sr, "music")
    o = slice_seg(out, sr, "music")
    return {
        "rms_delta_db": float(
            20
            * np.log10(
                max(rms(o), 1e-15)
                / max(rms(r), 1e-15)
            )
        ),
        "crest_delta_db": float(
            crest_db(o) - crest_db(r)
        ),
    }


def fr_summary(multitone_db):
    fr = np.asarray(multitone_db, dtype=float)
    offset = float(np.median(fr))
    flatness = float(np.max(np.abs(fr - offset)))
    span = float(np.max(fr) - np.min(fr))
    return offset, flatness, span


def technical_score(m, neutral=False):
    # Fault-finding convenience only. This is not MOS and is not a
    # listening-preference score.
    score = 100.0

    if m["nonfinite"] > 0:
        score -= 60
    if m["clip_samples"] > 0:
        score -= 35
    if m["peak_dbfs"] > -0.05:
        score -= 8

    if m["thdn_db"] > -40:
        score -= 15
    elif m["thdn_db"] > -55:
        score -= 8
    elif m["thdn_db"] > -70:
        score -= 3

    if m["imd_1khz_db"] > -45:
        score -= 12
    elif m["imd_1khz_db"] > -60:
        score -= 5

    if m["noise_floor_dbfs"] > -80:
        score -= 8

    if m["dc_dbfs"] > -70:
        score -= 5

    if neutral:
        if m["si_sdr_band_db"] < 20:
            score -= 25
        elif m["si_sdr_band_db"] < 35:
            score -= 10

        if abs(m["gain_delta_db"]) > 1.5:
            score -= 18
        elif abs(m["gain_delta_db"]) > 0.5:
            score -= 6

        if m["fr_flatness_db"] > 1.0:
            score -= 18
        elif m["fr_flatness_db"] > 0.5:
            score -= 6

        if max(m["stereo_crosstalk_db"]) > -50:
            score -= 12

        if abs(m["latency_ms"]) > 50:
            score -= 20
        elif abs(m["latency_ms"]) > 20:
            score -= 8

    return round(max(0, score), 1)


def resample_to(x, sr_from, sr_to):
    if sr_from == sr_to:
        return x
    from math import gcd

    g = gcd(int(sr_from), int(sr_to))
    return signal.resample_poly(
        x,
        int(sr_to // g),
        int(sr_from // g),
        axis=0,
    ).astype(np.float32)


def analyze():
    report = {
        "profiles": {},
        "notes": [
            "technical_score is a diagnostic heuristic, not MOS or a listening-preference score.",
            "Latency is measured between synchronized input/output taps inside the same DSP AudioContext.",
            "Each profile uses a captured input reference at the exact DSP runtime sample rate; no 44.1/48/96 kHz round-trip is used for the normal path.",
            "Active profiles intentionally change tone, dynamics and stereo image; their source-distance metrics are descriptive, not preference scores.",
        ],
    }

    critical = []
    warnings = []

    for profile in PROFILES:
        wav = RESULTS / f"{profile}.wav"
        ref_wav = RESULTS / f"{profile}.ref.wav"

        if not wav.exists():
            critical.append(f"{profile} output WAV missing")
            continue

        if ref_wav.exists():
            ref, sr_ref = sf.read(
                ref_wav,
                always_2d=True,
                dtype="float32",
            )
            reference_mode = "captured_input"
        else:
            # Kept only so old artifacts remain inspectable. New CI runs
            # deliberately fail the gate if a synchronized reference is absent.
            ref, sr_ref = sf.read(
                LEGACY_REF,
                always_2d=True,
                dtype="float32",
            )
            reference_mode = "legacy_global"
            critical.append(
                f"{profile} synchronized captured reference missing"
            )

        out, sr_out = sf.read(
            wav,
            always_2d=True,
            dtype="float32",
        )

        original_output_sr = int(sr_out)
        original_reference_sr = int(sr_ref)

        if sr_out != sr_ref:
            out = resample_to(out, sr_out, sr_ref)
            sr_out = sr_ref
            warnings.append(
                f"{profile} output/reference sample-rate mismatch required analyzer resampling"
            )

        sr = int(sr_ref)

        # Input and output captures are synchronized. Allow a generous search
        # window for genuine DSP buffering, but no artificial pre-roll is
        # included in the reference.
        lag = corr_align(
            ref,
            out,
            int(0.25 * sr),
        )
        r, o = aligned(ref, out, lag)

        n = min(
            len(r),
            len(o),
            int(ANALYSIS_END * sr),
        )
        r = r[:n]
        o = o[:n]

        m = {
            "reference_mode": reference_mode,
            "runtime_sample_rate": original_output_sr,
            "reference_sample_rate": original_reference_sr,
            "latency_samples": lag,
            "latency_ms": round(lag * 1000 / sr, 3),
        }

        m["peak_dbfs"] = round(
            float(db(np.max(np.abs(o)))),
            3,
        )
        m["rms_dbfs"] = round(
            float(db(rms(o))),
            3,
        )
        m["gain_delta_db"] = round(
            float(
                20
                * np.log10(
                    max(rms(o), 1e-15)
                    / max(rms(r), 1e-15)
                )
            ),
            3,
        )

        m["nonfinite"] = int(
            np.size(o)
            - np.count_nonzero(np.isfinite(o))
        )
        m["clip_samples"] = int(
            np.count_nonzero(np.abs(o) >= 1.0)
        )

        m["noise_floor_dbfs"] = round(
            noise_floor_dbfs(o, sr),
            3,
        )
        m["dc_dbfs"] = round(
            dc_dbfs(o, sr),
            3,
        )

        m["si_sdr_db"] = round(
            sisdr(r, o),
            3,
        )
        m["si_sdr_band_db"] = round(
            sisdr_band(r, o, sr),
            3,
        )
        m["lsd_db"] = round(
            lsd(r, o, sr),
            3,
        )

        m["thdn_db"] = round(
            thdn_1k(
                slice_seg(o, sr, "sine"),
                sr,
            ),
            3,
        )
        m["imd_1khz_db"] = round(
            imd_19_20(
                slice_seg(o, sr, "twotone"),
                sr,
            ),
            3,
        )

        m["multitone_db"] = [
            round(x, 3)
            for x in multitone_response(r, o, sr)
        ]
        (
            m["fr_offset_db"],
            m["fr_flatness_db"],
            m["fr_span_db"],
        ) = [
            round(x, 3)
            for x in fr_summary(m["multitone_db"])
        ]

        m["multitone_phase_deg"] = [
            round(x, 3)
            for x in multitone_phase(r, o, sr)
        ]
        m["max_phase_deviation_deg"] = round(
            float(
                np.max(
                    np.abs(
                        m["multitone_phase_deg"]
                    )
                )
            ),
            3,
        )

        m["stereo_crosstalk_db"] = [
            round(x, 3)
            for x in stereo_xtalk(o, sr)
        ]

        lr = [
            rms(o[:, 0]),
            rms(o[:, 1]),
        ]
        m["lr_balance_db"] = round(
            float(
                20
                * np.log10(
                    max(lr[0], 1e-15)
                    / max(lr[1], 1e-15)
                )
            ),
            3,
        )

        if np.std(o[:, 0]) > 0 and np.std(o[:, 1]) > 0:
            corr = np.corrcoef(
                o[:, 0],
                o[:, 1],
            )[0, 1]
            m["stereo_correlation"] = round(
                float(corr),
                6,
            )
        else:
            m["stereo_correlation"] = None

        lref = loudness(r, sr)
        lout = loudness(o, sr)
        m["lufs"] = (
            None
            if lout is None
            else round(lout, 3)
        )
        m["lufs_delta"] = (
            None
            if lref is None or lout is None
            else round(lout - lref, 3)
        )

        tr = transient_metrics(r, o, sr)
        m["transient_peak_delta_db"] = round(
            tr["peak_delta_db"],
            3,
        )
        m["transient_rms_delta_db"] = round(
            tr["rms_delta_db"],
            3,
        )
        m["transient_crest_delta_db"] = round(
            tr["crest_delta_db"],
            3,
        )

        md = music_dynamics(r, o, sr)
        m["music_rms_delta_db"] = round(
            md["rms_delta_db"],
            3,
        )
        m["music_crest_delta_db"] = round(
            md["crest_delta_db"],
            3,
        )

        m["technical_score"] = technical_score(
            m,
            neutral=(profile == "neutral"),
        )

        status_path = (
            RESULTS / f"{profile}.status.json"
        )
        if status_path.exists():
            m["runtime_status"] = json.loads(
                status_path.read_text(
                    encoding="utf-8"
                )
            )

        report["profiles"][profile] = m

    # Catastrophic conditions apply to every profile.
    for profile, m in report["profiles"].items():
        if m["nonfinite"] > 0:
            critical.append(
                f"{profile} contains non-finite samples"
            )
        if m["clip_samples"] > 0:
            critical.append(
                f"{profile} contains clipped samples"
            )

    # Neutral-path gate: independent fault dimensions instead of a single
    # SI-SDR threshold deciding everything.
    if "neutral" in report["profiles"]:
        n = report["profiles"]["neutral"]

        if n["reference_mode"] != "captured_input":
            critical.append(
                "neutral did not use synchronized captured input reference"
            )

        if n["si_sdr_band_db"] < 20:
            critical.append(
                "neutral in-band SI-SDR < 20 dB"
            )
        elif n["si_sdr_band_db"] < 35:
            warnings.append(
                "neutral in-band SI-SDR < 35 dB"
            )

        if abs(n["gain_delta_db"]) > 1.5:
            critical.append(
                "neutral absolute gain change > 1.5 dB"
            )
        elif abs(n["gain_delta_db"]) > 0.5:
            warnings.append(
                "neutral absolute gain change > 0.5 dB"
            )

        if n["fr_flatness_db"] > 1.0:
            critical.append(
                "neutral frequency-response flatness error > 1.0 dB"
            )
        elif n["fr_flatness_db"] > 0.5:
            warnings.append(
                "neutral frequency-response flatness error > 0.5 dB"
            )

        if n["thdn_db"] > -50:
            critical.append(
                "neutral THD+N > -50 dB"
            )
        elif n["thdn_db"] > -70:
            warnings.append(
                "neutral THD+N > -70 dB"
            )

        if n["imd_1khz_db"] > -60:
            critical.append(
                "neutral 19/20 kHz IMD product > -60 dB"
            )

        if n["noise_floor_dbfs"] > -80:
            critical.append(
                "neutral noise floor > -80 dBFS"
            )

        if n["dc_dbfs"] > -70:
            critical.append(
                "neutral DC component > -70 dBFS"
            )

        if max(n["stereo_crosstalk_db"]) > -50:
            critical.append(
                "neutral stereo crosstalk > -50 dB"
            )

        if abs(n["latency_ms"]) > 50:
            critical.append(
                "neutral measured DSP latency > 50 ms"
            )
        elif abs(n["latency_ms"]) > 20:
            warnings.append(
                "neutral measured DSP latency > 20 ms"
            )

    if len(report["profiles"]) != len(PROFILES):
        critical.append(
            "not all four profiles produced measurements"
        )

    # Deduplicate without losing order.
    critical = list(dict.fromkeys(critical))
    warnings = list(dict.fromkeys(warnings))

    report["critical"] = critical
    report["warnings"] = warnings
    report["gate"] = (
        "PASS"
        if not critical
        else "FAIL"
    )

    RESULTS.mkdir(
        parents=True,
        exist_ok=True,
    )

    (
        RESULTS / "report.json"
    ).write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    lines = [
        "# YURIKA Audio Comprehensive Quality Report",
        "",
        f"Gate: **{report['gate']}**",
        "",
        "| Profile | Diagnostic | Rate Hz | Latency ms | Peak dBFS | Noise dBFS | SI-SDR dB | In-band SI-SDR dB | LSD dB | THD+N dB | IMD 1k dB |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    for profile, m in report["profiles"].items():
        lines.append(
            f"| {profile} | "
            f"{m['technical_score']:.1f} | "
            f"{m['runtime_sample_rate']} | "
            f"{m['latency_ms']:.3f} | "
            f"{m['peak_dbfs']:.2f} | "
            f"{m['noise_floor_dbfs']:.2f} | "
            f"{m['si_sdr_db']:.2f} | "
            f"{m['si_sdr_band_db']:.2f} | "
            f"{m['lsd_db']:.2f} | "
            f"{m['thdn_db']:.2f} | "
            f"{m['imd_1khz_db']:.2f} |"
        )

    lines += [
        "",
        "## Neutral transparency helpers",
        "",
        "| Profile | Gain Δ dB | FR offset dB | FR flatness dB | FR span dB | Reference |",
        "|---|---:|---:|---:|---:|---|",
    ]

    for profile, m in report["profiles"].items():
        lines.append(
            f"| {profile} | "
            f"{m['gain_delta_db']:.2f} | "
            f"{m['fr_offset_db']:.2f} | "
            f"{m['fr_flatness_db']:.2f} | "
            f"{m['fr_span_db']:.2f} | "
            f"{m['reference_mode']} |"
        )

    lines += [
        "",
        "## Multitone magnitude (dB vs synchronized input)",
        "",
        "| Profile | "
        + " | ".join(str(int(f)) for f in FREQS)
        + " |",
        "|---|"
        + "|".join(["---:"] * len(FREQS))
        + "|",
    ]

    for profile, m in report["profiles"].items():
        lines.append(
            "| "
            + profile
            + " | "
            + " | ".join(
                f"{x:.2f}"
                for x in m["multitone_db"]
            )
            + " |"
        )

    lines += [
        "",
        "## Multitone phase (degrees vs aligned synchronized input)",
        "",
        "| Profile | "
        + " | ".join(str(int(f)) for f in FREQS)
        + " |",
        "|---|"
        + "|".join(["---:"] * len(FREQS))
        + "|",
    ]

    for profile, m in report["profiles"].items():
        lines.append(
            "| "
            + profile
            + " | "
            + " | ".join(
                f"{x:.1f}"
                for x in m["multitone_phase_deg"]
            )
            + " |"
        )

    lines += [
        "",
        "## Dynamics / stereo",
        "",
        "| Profile | LUFS Δ | L/R bal dB | Crosstalk L/R dB | Music crest Δ dB | Transient crest Δ dB |",
        "|---|---:|---:|---:|---:|---:|",
    ]

    for profile, m in report["profiles"].items():
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
            f"| {profile} | "
            f"{lu} | "
            f"{m['lr_balance_db']:.2f} | "
            f"{xt} | "
            f"{m['music_crest_delta_db']:.2f} | "
            f"{m['transient_crest_delta_db']:.2f} |"
        )

    lines += [
        "",
        "> `Diagnostic` is a fault-finding heuristic, not MOS and not a claim that a higher number sounds better.",
        "",
        "> Each profile is compared with a synchronized input tap captured in the same AudioContext at the same runtime sample rate. The latency figure therefore represents the measured DSP path rather than the old synthetic pre-roll.",
        "",
        "> Active profiles intentionally alter tone, dynamics and stereo image. Their SI-SDR/LSD values describe source distance; they are not preference scores.",
        "",
        "> The hard gate uses multiple independent neutral-path checks. SI-SDR alone no longer decides PASS/FAIL.",
    ]

    if warnings:
        lines += ["", "## Warnings"]
        lines += [f"- {x}" for x in warnings]

    if critical:
        lines += ["", "## Critical findings"]
        lines += [f"- {x}" for x in critical]

    (
        RESULTS / "report.md"
    ).write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )

    print("\n".join(lines))
    return report


if __name__ == "__main__":
    result = analyze()
    sys.exit(
        1
        if result["gate"] != "PASS"
        else 0
    )
