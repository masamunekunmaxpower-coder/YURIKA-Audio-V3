# YURIKA Audio Final Debug & Tune v2.4

## Source
This final pass starts from the user-provided `YURIKA_Audio_Quality_Tune_v2_3(1).zip`, specifically its `validated_project` snapshot.

The v2.3 package already contained prior Jiero/MCP review artifacts. A fresh live Jiero MCP invocation was not exposed to this conversation at final-pass time, so this report does **not** claim a new 45B/Jiero approval. Final changes were derived from source inspection, deterministic models, official Web Audio parameter semantics, and the project's full local regression suite.

## Final high-confidence findings and fixes

### 1. Web Audio low/high-pass Q semantics were still wrong outside Self-DAP
`BiquadFilterNode.Q` is interpreted as resonance in **dB** for `lowpass` and `highpass`. The project tuning tables and call sites were clearly written using conventional linear-Q style values such as 0.7, 0.707, 0.65, 0.68 and 0.55.

In v2.3, only the Self-DAP side HPF had been corrected. Other low/high-pass nodes still received the conventional values directly.

Final fix:
- Added `webAudioResonanceDb(linearQ)` in `dsp-core.js`.
- `offscreen.js` converts low/high-pass Q values at node creation.
- `audio-modules.js` does the same, including dynamic DAC low-pass Q updates.
- Peaking/band-pass Q remains linear and is not converted.
- Headphone profiles are future-proofed if a profile later introduces low/high-pass filters.

Concrete 44.1 kHz model for Clean 35 Hz low-cut:
- v2.3 at 35 Hz: +0.70 dB
- final at 35 Hz: -3.10 dB
- v2.3 at 63 Hz: +1.30 dB
- final at 63 Hz: -0.44 dB

This removes unintended cutoff resonance rather than merely changing a score threshold.

### 2. Neutral / Flat now has a true low-cut bypass
The 5 Hz Flat sentinel previously still passed through a high-pass filter and therefore retained phase rotation.

Final fix:
- Added complementary `lowCutBypass` / `lowCutProcessed` lanes.
- `lowCutHz <= 5 Hz` selects the true bypass lane.
- Normal presets and scene-derived low-cut values still use the actual filter.

Expected effect:
- Neutral low-frequency magnitude and phase should become much closer to the synchronized input reference.
- Neutral SI-SDR/LSD should improve for a real reason, not because the CI gate was weakened.

### 3. Self-DAP audible-bass stereo preservation
v2.3 used `sideHpfHz = 5 + 25*t`. At strength 70 this is 22.5 Hz. Even with zero side delay, that HPF still rotates/attenuates the Side component enough to create audible low-frequency inter-channel leakage.

Final fix:
- Self-DAP side HPF is fixed at 5 Hz.
- The main YURIKA low-cut already provides sub-bass protection.
- Side-only delay remains zero.
- Side presence remains bounded at max +1 dB.

96 kHz / strength 70 linear M/S model, cross/direct ratio:
- 40 Hz:  -6.74 dB -> -20.96 dB
- 63 Hz: -11.39 dB -> -24.87 dB
- 125 Hz: -17.66 dB -> -30.51 dB
- 250 Hz: -23.49 dB -> -35.32 dB

High-frequency behavior remains approximately the v2.3 design; the final change primarily fixes low-frequency stereo contamination.

### 4. Redundant Self-DAP internal compressor removed from the audible path
Self-DAP had an internal `DynamicsCompressorNode` threshold of -0.5 dB, followed later by the global final limiter at -1.0 dB.

The downstream final limiter is stricter and is retained. The internal compressor therefore added fixed look-ahead latency without providing earlier peak protection.

Final fix:
- The legacy node is retained as an object for compatibility but disconnected from the audible path.
- Self-DAP `abSum` connects directly to `processedGain`.
- Final limiter -> Safety Meter -> Master Safety remains unchanged.

Expected topology change:
- Neutral/Music: one final limiter remains.
- Self-DAP: one final limiter remains instead of Self-DAP limiter + final limiter.
- Clean: intentional broad compressor + final limiter remain.

Based on the earlier measured ~6 ms per Chromium `DynamicsCompressorNode` path, Self-DAP should lose roughly one compressor's fixed latency. This is an expectation to verify in the next GitHub Audio Quality run, not a fresh browser measurement from this container.

## Validation performed
Final local validation completed with:
- 68 JavaScript/MJS syntax checks: PASS
- 45 Node regression tests: PASS
- 6 Python validation/model runs: PASS
- Total orchestration checks: 119 PASS
- Existing static suite: 145/145 PASS
- Self-DAP response model: 120 configurations PASS
- Analyzer identity/self-test: PASS
- Dependency audit: PASS
- 48/96 kHz perspective simulation: PASS

New final contracts explicitly verify:
- Correct Web Audio Q conversion.
- Neutral true low-cut bypass.
- Self-DAP internal limiter absent from audible path.
- Final limiter and safety chain still present.
- Self-DAP low-bass stereo leakage improves materially vs v2.3 model.

## What was deliberately not changed
- Final output limiter.
- Safety meter and Master Safety.
- Adaptive safety logic.
- Self-DAP restoration amount/harmonic tuning.
- Clean compressor behavior.
- Output headroom budget.

Those should only be changed after the next real-browser report gives post-v2.4 THD+N, SI-SDR, frequency response, crosstalk, and latency.

## Fresh browser measurement limitation
The current container has Chromium and Python Playwright, but its Chromium build did not expose the MV3 extension service worker in the attempted headless launch, so a trustworthy new full-browser render was not fabricated here. The included GitHub Audio Quality harness remains the authoritative next measurement step.
