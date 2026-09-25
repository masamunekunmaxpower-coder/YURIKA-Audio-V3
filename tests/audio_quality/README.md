# YURIKA Audio comprehensive quality + spatial/amp test

This harness measures the **actual YURIKA Web Audio graph in Chromium**. It keeps the existing whole-product quality test and adds two isolated benches:

1. **3D localization cue bench**: taps the graph before HRTF, before Spatial, and after Spatial.
2. **Virtual Class-A Amp bench**: taps directly before and after the C++/WebAssembly amplifier, plus final output after limiter/safety.

## Whole-product quality

The normal suite renders `neutral`, `clean`, `music`, `selfdap`, and feature-dependent Spatial/SonoBus profiles. It measures:

- runtime sample rate and synchronized input/output latency
- peak, RMS, clipping, non-finite samples, DC and silent-section noise
- SI-SDR and in-band SI-SDR
- log-spectral distance
- 1 kHz THD+N
- 19/20 kHz IMD difference product
- 9-point magnitude and phase response
- stereo crosstalk, L/R balance and correlation
- LUFS delta
- music/transient crest-factor behavior

`neutral` remains the hard transparency gate. Active profiles intentionally alter the signal, so source-distance metrics are descriptive rather than preference scores.

## 3D localization cue bench

The benchmark uses deterministic synthetic broadband targets at -60, -30, 0, +30 and +60 degrees. Those targets encode known ITD/ILD cues. It also includes synthetic front/back and elevation spectral classes plus a centered impulse.

Reported metrics include:

- cue-based azimuth proxy mean absolute error
- center-drift proxy
- left/right direction-sign accuracy
- azimuth monotonicity (Spearman correlation)
- lateralization-gain slope
- ITD cue deviation (microseconds)
- ILD cue deviation (dB)
- front/back spectral-template separability proxy
- elevation spectral-template separability proxy
- center IACC change
- Side/Mid expansion
- early-reflection energy ratio
- pre-HRTF to post-Spatial alignment latency

These metrics are **objective localization-cue proxies**, not human-listener localization scores. Generic/non-individual HRTFs cannot be certified for a person's front/back or elevation perception by CI alone.

## Virtual Class-A Amp bench

The amp benchmark measures the C++/WASM stage itself, not the entire upstream DSP. It reports:

- actual backend/effective/fault state
- added alignment latency
- rated-level and low-level gain error
- dynamic-linearity error
- THD and THD+N separately, per channel
- individual harmonic levels
- unweighted and A-weighted S/N
- low/mid/high noise-band floors
- CCIF 19/20 kHz IMD
- SMPTE-style 60 Hz / 7 kHz IMD
- 20 Hz–20 kHz multitone gain and phase response
- frequency-response offset and flatness
- L→R / R→L crosstalk
- DC offset
- transient peak deviation
- near-full-scale sample peak and oversampled true-peak estimate
- post-amp to final limiter/safety latency

The 8 W/ch rated, 12 W/ch maximum, 6 ohm load, 0.020 ohm output-impedance, damping-factor and slew-rate figures are **software reference electrical-model metadata**. They are not claims that the PC physically delivers those watts into a load.

## Hard gates

The main suite still gates catastrophic faults and Neutral transparency. The specialized suite additionally fails on clearly broken behavior such as non-finite/clipped amp output, missing `cpp-wasm` backend, severe amp FR/gain/THD+N/SNR/crosstalk regressions, reversed azimuth polarity, collapsed spatial ordering, or extreme center drift.

Front/back and elevation template results are reported as diagnostics rather than treated as individualized human-perception guarantees.

## Run on GitHub

Open **Actions → Audio Quality → Run workflow**, or push a candidate with the YURIKA Test Swapper. The run summary contains both the comprehensive report and the specialized Spatial/Amp report. Full WAV taps, JSON and Markdown are uploaded in the `yurika-audio-quality` artifact.
