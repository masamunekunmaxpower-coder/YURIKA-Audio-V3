from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
ref_file = HERE / "quality-stimulus.wav"

if not ref_file.exists():
    subprocess.run(
        [sys.executable, str(HERE / "generate_stimulus.py")],
        check=True,
    )

ref, sr = sf.read(ref_file, always_2d=True, dtype="float32")


def write_status(out, profile, pre_frames=0, stim_frames=None):
    if stim_frames is None:
        stim_frames = len(ref)
    payload = {
        "runtime_status": {},
        "capture_meta": {
            "sampleRate": sr,
            "preRollFrames": pre_frames,
            "stimulusFrames": stim_frames,
            "comparisonReference": "selftest matched bypass",
        },
    }
    (out / f"{profile}.status.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )


def run_metrics(out):
    env = os.environ.copy()
    env["YURIKA_RESULTS_DIR"] = str(out)
    env["YURIKA_REF_FILE"] = str(ref_file)
    return subprocess.run(
        [sys.executable, str(HERE / "metrics.py")],
        env=env,
        text=True,
        capture_output=True,
    )


# Identity test: matched reference/output must be mathematically transparent.
with tempfile.TemporaryDirectory(
    prefix="yurika-quality-selftest-identity-"
) as td:
    out = Path(td)
    for p in ["neutral", "clean", "music", "selfdap"]:
        sf.write(out / f"{p}.reference.wav", ref, sr, subtype="FLOAT")
        sf.write(out / f"{p}.wav", ref, sr, subtype="FLOAT")
        write_status(out, p)

    cp = run_metrics(out)
    if cp.returncode != 0:
        print(cp.stdout)
        print(cp.stderr, file=sys.stderr)
        raise SystemExit("metrics identity self-test failed")

    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    n = report["profiles"]["neutral"]

    checks = {
        "gate_pass": report["gate"] == "PASS",
        "si_sdr_identity": n["si_sdr_db"] > 100,
        "band_sisdr_identity": n["si_sdr_40_18k_db"] > 100,
        "lsd_identity": abs(n["lsd_db"]) < 1e-6,
        "fr_identity": max(abs(x) for x in n["multitone_db"]) < 1e-6,
        "phase_identity": max(abs(x) for x in n["multitone_phase_deg"]) < 1e-5,
        "latency_identity": n["latency_samples"] == 0,
        "no_clipping": n["clip_samples"] == 0,
    }

    bad = [k for k, v in checks.items() if not v]
    if bad:
        print(json.dumps({"checks": checks, "neutral": n}, indent=2))
        raise SystemExit("identity self-test failed: " + ", ".join(bad))


# Delay test: analyzer must report real path delay, not capture pre-roll.
with tempfile.TemporaryDirectory(
    prefix="yurika-quality-selftest-delay-"
) as td:
    out = Path(td)
    delay = 240  # 5 ms at 48 kHz
    delayed = np.vstack(
        [np.zeros((delay, 2), np.float32), ref]
    )

    for p in ["neutral", "clean", "music", "selfdap"]:
        sf.write(out / f"{p}.reference.wav", ref, sr, subtype="FLOAT")
        sf.write(out / f"{p}.wav", delayed, sr, subtype="FLOAT")
        write_status(out, p)

    cp = run_metrics(out)
    if cp.returncode != 0:
        print(cp.stdout)
        print(cp.stderr, file=sys.stderr)
        raise SystemExit("metrics delay self-test failed")

    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    n = report["profiles"]["neutral"]

    if abs(n["latency_samples"] - delay) > 1:
        raise SystemExit(
            f"delay self-test failed: expected {delay}, got {n['latency_samples']}"
        )

    if abs(n["latency_ms"] - 5.0) > 0.05:
        raise SystemExit(
            f"delay ms self-test failed: expected 5.0, got {n['latency_ms']}"
        )

print(
    "PASS analyzer_selftest: matched-reference identity + true-delay measurement"
)
