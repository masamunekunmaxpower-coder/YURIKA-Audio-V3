# YURIKA Audio 3.6.4 Soft Sound Object AI

## Runtime architecture

1. Chrome AudioWorklet runs the packaged C++/WebAssembly audio core.
2. The Dart-authored non-AI detector (browser build currently mirrored in JS) receives causal probe metrics every 4 render blocks.
3. It emits overlapping Soft Sound Objects: `tonal`, `transient`, `texture`, and `ambience`. These are semantic soft channels, not separated stems.
4. Every object carries `energy`, `confidence`, and its own `L1/L2/L3` hierarchy.
5. A 40-parameter controller trained from `controller-training/controller_dataset.jsonl` maps each object descriptor to bounded strategy weights: harmonic, transient, texture, ambience.
6. C++ aggregates the per-object controller outputs and blends them into the existing 3.6.3 base synthesis with controller influence capped at `0.42 * strategyConfidence`.
7. MATLAB remains the numerical source for frequency/resolution coefficients. The packaged header is still a manual mirror because MATLAB Coder is not installed on this build host.

## Text training data

The controller dataset is plain JSONL. Each line contains object type, energy, confidence, L1/L2/L3, and target strategy proportions. Training is build-time only; Chrome ships the learned 40 parameters, not a training runtime.

The current 384-row dataset is synthetic/structured and is intended to establish the controller mechanism. Its holdout metrics are not evidence of real-world audio restoration quality.

## Validation clip

The user-supplied WAV was used only as validation, never as training data. It is not included in the extension package. The source is 48 kHz, 24-bit mono, about 14.236 s. For offline 3.6.4 validation only it was resampled to 96 kHz to exercise the high-rate path.

## Safety

The AI is causal with zero lookahead. Unsupported sample rates, missing/faulted Wasm, non-finite input, and repeated hard timing overruns fall back to transparent or sanitized audio paths. Soft objects do not imply literal source separation.
