# CHANGELOG 3.7.0

- Reframed AI Hi-Res as **Bandwidth Extension + Perceptual Super-Resolution**.
- Expanded the learned controller from 40 to 60 coefficients: four Soft Sound Object strategy outputs plus explicit BWE and SR drives.
- Added `sr-training/audio_sr_training_data.txt`, a 1,800-row audio-oriented paired text corpus generated offline from procedural 96 kHz truth scenes and the supplied long 96 kHz recording.
- Added deterministic 96 -> 48 -> 96 degradation for paired supervision and contiguous real-audio validation splitting.
- Added asymmetric training penalty to discourage false-positive BWE on low-upper-band real examples.
- Added causal BWE synthesis with harmonic, transient, texture and ambience-conditioned nonlinear candidates.
- Added causal perceptual-SR branch for in-band high-detail refinement.
- Added multi-stage native-hires protection to reduce BWE when real >24 kHz support already exists.
- Added BWE/SR branch ablation mask and telemetry.
- Fixed training/runtime fast-exponential formula mismatch.
- Fixed public C++ scalar sanitization so NaN/Infinity cannot survive `clip01`/`clamp1` paths.
- Made sample-rate filter coefficients reset-time dependent.
- Made the Worklet CPU watchdog relative to the 128-frame audio deadline.
- Restricted the Worklet AI Hi-Res quality-certified range to 88.2-100 kHz (96 kHz target) rather than implying 176.4/192 kHz quality certification.
- Preserved zero lookahead, activity gate, output clamps and consecutive-overrun bypass.
- 45B/model inference: **0 uses** during this release build/debug/validation cycle.
