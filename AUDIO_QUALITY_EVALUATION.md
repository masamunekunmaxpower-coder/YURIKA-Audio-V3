# YURIKA Audio V3 — Comprehensive Audio Quality Evaluation

A GitHub Actions audio-quality harness is included **without modifying the production DSP path**.

## Fast comprehensive pass

The workflow performs three layers of checking:

1. The existing static, deterministic, fuzz, safety, rollback and runtime tests.
2. An identity self-test for the new analyzer itself.
3. A real Chromium Web Audio render of the YURIKA DSP graph for `neutral`, `clean`, `music`, and `selfdap`.

The audio report covers latency, clipping/non-finite data, level, DC/noise floor, SI-SDR, spectral distance, THD+N, high-frequency IMD, multitone magnitude/phase, stereo separation/balance/correlation, LUFS, music dynamics and transient behavior.

## Pass/fail philosophy

The hard CI gate deliberately checks catastrophic faults and **neutral-path transparency**. Active DSP profiles are allowed to change tone, dynamics, width and harmonic structure, because that is their purpose. Their measurements are reported for comparison instead of being treated as defects merely for differing from the source.

`Diagnostic` is a convenience score for fault triage only. It is **not MOS** and must not be presented as a scientific listening-preference score.

## Run

Open GitHub Actions → **Audio Quality** → **Run workflow**. The job summary gives the compact report; the `yurika-audio-quality` artifact contains the rendered WAVs, JSON and full Markdown report.
