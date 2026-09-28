# Dart detector

`detector.dart` is the authoritative non-AI L1/L2/L3 detector. It uses only arithmetic, causal EMA state and threshold normalization. No learned weights are used.

Chrome extensions cannot execute Dart source directly. Production deployment compiles Dart to packaged JavaScript:

```bash
dart compile js --csp -O2 detector_entry.dart -o dart-detector-runtime.js
```

This build environment did not contain the Dart SDK, so the package includes `dart-detector-runtime.js`, a manually verified browser runtime mirror of the same equations. The extension remains immediately runnable, while the Dart source remains the authoritative implementation for compiler-enabled builds.
