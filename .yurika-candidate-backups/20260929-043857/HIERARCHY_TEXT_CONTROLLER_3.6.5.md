# YURIKA Audio 3.6.5 Hierarchy + Dedicated TXT Controller

## Runtime

1. Chrome AudioWorklet runs the local C++/WebAssembly hierarchical residual core.
2. The Dart-authored v2.1 detector receives causal probe metrics and computes three rate-aware temporal scales:
   - L1 `micro`: rapid novelty / edge / transient evidence.
   - L2 `local`: short local structure, agreement, and local-vs-context change.
   - L3 `context`: slower continuity / stability evidence.
3. L1/L2/L3 are converted to smoothed soft hierarchy weights. `dominantIndex` is telemetry only and has hysteresis.
4. The detector also emits overlapping `tonal`, `transient`, `texture`, and `ambience` Soft Sound Objects.
5. C++ receives both raw hierarchy evidence and the soft hierarchy weights.
6. C++ applies three distinct generation profiles and continuously blends them by hierarchy weight:
   - L1: derivative/transient/texture emphasis.
   - L2: harmonic/local-curvature balance.
   - L3: smoother harmonic/ambience emphasis.
7. The learned 40-parameter object controller remains a second, bounded strategy layer. It is trained from a dedicated text corpus and is blended with the hierarchy profile rather than replacing it.
8. Existing injection clamps, non-finite sanitization, high-rate gating, and repeated-overrun bypass remain.

## Training source

`controller-training/controller_training_data.txt` is the sole controller training source. It is intentionally plain text with one `key=value` record per line.

The corpus contains:
- 384 legacy structured synthetic rows from 3.6.4, retained as supervised mechanism examples.
- 800 real-audio calibration rows generated from 200 locations in the user-supplied 96 kHz FLAC, four Soft Sound Objects per location.
- Real-audio rows use weight `0.35` because their targets are pseudo-labels from offline signal descriptors rather than human listening-quality judgments.

The matching 48 kHz WAV is not added as a second training source because it is effectively the same content. Raw user audio is not bundled.

## Important interpretation

Soft Sound Objects are semantic control objects, not separated stems. The real-audio calibration improves exposure to realistic descriptor distributions, but it does not prove restoration accuracy, subjective quality, or reconstruction of ultrasonic information.
