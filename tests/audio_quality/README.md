# YURIKA Audio comprehensive quality test

This harness measures the **actual YURIKA Web Audio graph in Chromium**, rather than only checking parameter math.
It renders one deterministic 48 kHz stimulus through four profiles: `neutral`, `clean`, `music`, and `selfdap`.

## What is measured

- runtime sample rate and end-to-end alignment latency
- non-finite samples, clipping, peak, RMS, DC offset and silent-section noise floor
- SI-SDR and log-spectral distance (source-distance metrics)
- 1 kHz THD+N
- 19/20 kHz intermodulation product at 1 kHz
- 9-point multitone magnitude **and phase** response
- stereo crosstalk, L/R balance and correlation
- LUFS delta when `pyloudnorm` is available
- pseudo-music gain / crest-factor change
- transient peak / RMS / crest-factor change

`neutral` is the hard transparency reference. Active profiles are intentionally voiced, so a larger source-distance is **not automatically worse sound**.
The `technical_score`/`Diagnostic` field is only a fault-finding heuristic. It is not MOS and is not a listening preference score.

The GitHub workflow also runs the project's existing deterministic JS/Python safety tests and an analyzer identity self-test.
Artifacts contain all rendered WAVs plus `report.md`, `report.json`, and runtime status snapshots.

## Run on GitHub

Open **Actions → Audio Quality → Run workflow**. The summary appears in the run page and the full files are uploaded as the `yurika-audio-quality` artifact.

## Why ViSQOL/PEAQ are not hard CI gates here

They are useful secondary perceptual metrics, but ViSQOL audio mode downmixes multichannel audio and PEAQ open-source implementations have conformance caveats. This harness therefore keeps the fast CI gate based on directly inspectable signal measurements and neutral-path transparency. Add perceptual metrics as a secondary review step when comparing two *intentionally similar* renders.
