# R5 Reality Resolution 3.5.0 — Local Precheck

This is a deterministic local precheck, not the GitHub Chromium result.

- R5 OFF bypass max error: **0** in Worklet simulation.
- R5 ON simulation: finite/bounded, max sample delta about **0.00327** on the deterministic test signal.
- Runtime-reported algorithmic lookahead: **0 frames**.
- Runtime claim guard: `lostInformationRecoveredGuaranteed=false`.
- Full-reference evaluator self-test: **PASS**.
- Directional metrics in local Python replica: **12/19 improved, 5/19 regressed, 2 unchanged; 0 warnings**.
- Existing Remote Mobile, Virtual Amp, Stem recombination, Concert Hall, Spatial cue, Adaptive Safety and Integrity hard-gates: **PASS**.
- All JS/MJS syntax: **PASS**.
- All JSON parse: **PASS**.
- Jiero/YURIKA deterministic review: explicit-constraint audit `pass_with_limits`; Z3 model **SAT**; no generative model used.

The authoritative audio result is the GitHub Actions run that renders the actual Chromium/Web Audio graph and executes `tests/audio_quality/reality_metrics.py` on the captured R5 pre/post/final taps.
