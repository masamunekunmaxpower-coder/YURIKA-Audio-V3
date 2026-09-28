# YURIKA Audio 3.6.5 changes

- Replaced detector v2.0 with rate-aware detector v2.1.
- Added normalized, smoothed L1/L2/L3 hierarchy weights and dominant-class hysteresis.
- Added C++ ABI exports for hierarchy weights/confidence.
- Added distinct micro/local/context generation profiles in C++ with continuous blending.
- Changed controller training source from JSONL to `controller_training_data.txt`.
- Added 800 weighted real-audio calibration rows from the supplied FLAC; matching WAV remains validation-only.
- Retrained the 40-parameter controller and rebuilt `hires-hybrid-core.wasm`.
- Added deterministic Node/Wasm boundary tests and real-audio validation utility.
- No 45B/model inference was used for this rebuild.
