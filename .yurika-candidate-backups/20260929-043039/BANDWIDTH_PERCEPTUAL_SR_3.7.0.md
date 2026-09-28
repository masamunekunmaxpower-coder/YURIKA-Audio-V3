# YURIKA Audio GIRO MONATIUM 3.7.0
## Bandwidth Extension + Perceptual Super-Resolution

### Objective
3.7.0 makes the AI Hi-Res stage explicitly responsible for two related but different jobs:

1. **Perceptual super-resolution inside the represented band**: refine transient detail, texture, harmonic structure and ambience without adding lookahead.
2. **Bandwidth extension (BWE)**: synthesize a conservative upper-band continuation when the input does not contain comparable native high-frequency support.

The generated upper band is **plausible synthesis, not exact restoration**. A 44.1/48 kHz source does not contain the original >22.05/24 kHz information, so the engine can infer a compatible continuation but cannot recover unknowable source samples exactly.

### Runtime architecture
`Dart L1/L2/L3 -> Soft Sound Objects -> 60-parameter controller -> C++/Wasm SR + BWE -> safety gates`

- **L1 / micro**: short-time attack and fine-detail evidence.
- **L2 / local**: local timbre and harmonic behavior.
- **L3 / context**: slower texture/ambience context.
- **Soft Sound Objects**: tonal, transient, texture, ambience.
- **Controller**: 9 normalized inputs, 4 softmax strategy outputs, 2 sigmoid drives (`bweDrive`, `srDrive`).
- **Perceptual SR branch**: causal high-pass/low-pass shaping of the learned residual in the audible high-detail region.
- **BWE branch**: causal source-band isolation, object-conditioned nonlinear candidates, then cascaded high-pass isolation into the >24 kHz target region at 96 kHz output.
- **Native-hires protection**: a steep causal >24 kHz detector reduces generated BWE when genuine upper-band support is already present.

No future samples are read. Algorithmic lookahead is 0 frames.

### Audio-oriented training data
Training is offline. The extension never loads the training corpus at playback time, so increasing training data does not increase render-path model size beyond the fixed 60 controller coefficients.

`sr-training/audio_sr_training_data.txt` contains 1,800 paired text records:

- 1,200 procedural 96 kHz truth scenes spanning tonal, transient, texture and ambience cases.
- 600 self-supervised records sampled across the supplied 19m08s 96 kHz FLAC.
- Each pair is degraded through a 96 -> 48 -> 96 kHz path before features/targets are derived.
- The last 20% of the real recording is reserved as a contiguous validation block to reduce adjacent-window leakage.
- Raw supplied audio is not redistributed in the extension.

The procedural component is important because the supplied real track has very little energy above 24 kHz. It therefore cannot, by itself, teach a broad mapping for upper-band synthesis. The real component instead exposes the controller to a long real-world distribution and acts as a strong conservative calibration signal.

### Runtime safety
- Public scalar inputs sanitize NaN/Infinity.
- Invalid reset rates fall back to 96 kHz.
- Injection is bounded to +/-0.025 per sample before the final output stage.
- BWE is zero until a committed Soft Sound Object provides nonzero confidence.
- Native high-frequency support continuously suppresses BWE.
- The Worklet uses a sample-rate-relative CPU watchdog and retains consecutive-overrun fail-open behavior.
- AI Hi-Res is quality-certified in the Worklet only for 88.2-100 kHz, with 96 kHz as the primary target.

### What the measurements establish
The validation suite establishes that the implemented branch can create measurable >24 kHz content from a lower-band source, that existing native high-band content reduces this generation, that numerical safety guards work, and that the local 96 kHz render cost is normally below one 128-frame quantum.

It does **not** establish that the synthesized band is the historical original, that every genre benefits perceptually, or that the local Node timing distribution is a browser real-time guarantee. Those require broader paired source material and controlled listening tests.
