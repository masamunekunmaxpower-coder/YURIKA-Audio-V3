# 3.7.0 Audio SR / BWE training corpus

`audio_sr_training_data.txt` is an **offline-only** key=value text corpus for the 60-parameter controller. It is not loaded by the Chrome AudioWorklet.

Sources:
- procedural paired 96 kHz truth scenes with controlled upper-band content;
- the supplied long 96 kHz real recording, sampled across time and degraded through 96 -> 48 -> 96 kHz for self-supervised calibration.

Targets include four Soft Sound Object strategy weights plus BWE and perceptual-SR drives. The real recording is intentionally a conservative calibration source because its measured >24 kHz support is sparse; the procedural set provides broader controlled BWE truth. Raw user audio is not included in the extension.

Run `generate_audio_sr_dataset.py` offline to regenerate the corpus, then run `controller-training/train_controller.js` and rebuild the C++/Wasm core. Dataset growth does not increase playback latency because runtime receives only the trained 60 coefficients.
