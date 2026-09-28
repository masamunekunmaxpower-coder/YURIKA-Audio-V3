# R5 Reality Resolution — Research Basis and GitHub Metrics

Version target: **YURIKA Audio 3.5.0**

## 1. Goal and claim boundary

R5 Reality Resolution is an experimental, low-latency microstructure enhancer. It is intended to test whether weak temporal/relational cues that survive recording, quantization, resampling, compression, or mild temporal smearing can be used to add a small, bounded residual that moves a degraded signal closer to a clean reference.

It does **not** claim to recover source information that is no longer present, reconstruct an original performance exactly, or create extra physical bandwidth. The fifth-order expression is a **feature-interaction/confidence gate**, not a raw fifth-power audio transfer function.

## 2. Why use non-frequency features

A magnitude spectrum is only one view of an audio signal. The R5 feature set deliberately includes time-domain and relational information:

- **v — temporal velocity:** normalized first difference. Sensitive to local waveform motion and onset detail.
- **w — temporal curvature:** normalized second difference. Sensitive to changes in slope and micro-transient shape.
- **x — short-predictor residual:** deviation from a fixed short linear predictor. Acts as a lightweight innovation/detail cue.
- **y — fast/slow envelope contrast:** difference between fast and slow amplitude followers. Represents short-scale envelope/modulation change without an FFT in the real-time path.
- **z — stereo micro-coherence / center dominance:** relation between mid and side instantaneous energy. Provides a cross-channel structural cue.

Each feature is bounded before interaction. The core interaction is based on a normalized form of:

`((v + w + x + y + z) / scale)^5`

The absolute interaction strength helps open a confidence gate. Generated detail remains a separately bounded predictor-residual term and is mixed at a small coefficient. This avoids treating `(v+w+x+y+z)^5` as a waveshaper.

## 3. Research ingredients used for evaluation

### Temporal fine structure (TFS) and temporal envelope (ENV)

Speech and other complex sounds can be described using slower envelope modulation and faster temporal fine structure. TFS carries phase-locked rapid temporal information, while ENV carries slower amplitude modulation. These cue families motivate evaluating R5 with separate TFS and envelope similarities rather than only frequency-response error.

Source: Hong & Rubinstein, *What Is Temporal Fine Structure and Why Is It Important?* (2014), PMC4003734.  
https://pmc.ncbi.nlm.nih.gov/articles/PMC4003734/

### Cepstral Peak Prominence (CPP)

CPP is a useful periodicity/voice-quality measure and has been reported as more reliable than traditional jitter, shimmer, and noise-ratio measures in some voice-assessment settings. R5 therefore reports CPP-like relative error alongside the traditional measures rather than replacing one with the other.

Sources:  
Heman-Ackah et al., *Cepstral peak prominence: a more reliable measure of dysphonia* (2003).  
https://pubmed.ncbi.nlm.nih.gov/12731627/  
Medeiros et al., systematic review/meta-analysis (2026).  
https://pubmed.ncbi.nlm.nih.gov/42392902/

### Jitter, shimmer and HNR

These remain useful descriptive perturbation measures, but their limitations mean they are not used as a single pass/fail truth signal. R5 measures their **distance to the pristine reference**, not a universal target value.

### Phase and group delay

Group delay is derived from spectral phase and is used in speech processing for high-resolution structure such as pitch/formant/onset-related analysis. R5 therefore measures instantaneous-phase error and group-delay error separately from magnitude/envelope similarity.

Source: *Spike Estimation from Fluorescence Signals Using High-Resolution Property of Group Delay* (discussion/review of group-delay high-resolution properties and speech applications), PMC8112804.  
https://pmc.ncbi.nlm.nih.gov/articles/PMC8112804/

### Higher-order statistics / bicoherence

Bispectrum and bicoherence can represent nonlinear interactions and quadratic phase coupling that are absent from a conventional power spectrum. The GitHub evaluator uses a bounded bicoherence proxy and standardized third/fourth/fifth moments as diagnostics. They are comparison axes, not direct perceptual-quality scores.

Sources:  
*Higher-order spectral analysis of spontaneous speech signals in Alzheimer’s disease*, PMC6233329.  
https://pmc.ncbi.nlm.nih.gov/articles/PMC6233329/  
*A novel method for early diagnosis of Alzheimer’s disease based on higher-order spectral estimation of spontaneous speech signals*, PMC5106459.  
https://pmc.ncbi.nlm.nih.gov/articles/PMC5106459/

### Sample Entropy

Sample Entropy is used as a bounded supplemental measure of time-series regularity/complexity. It is not interpreted as "higher is always better"; the evaluator measures distance to the pristine reference.

Source: *On the complexity matching and multiscale nonlinear perspective of voice restoration...* (2025), PMC12394686.  
https://pmc.ncbi.nlm.nih.gov/articles/PMC12394686/

### ViSQOL as an optional external perceptual reference

Google ViSQOL is a full-reference objective speech/audio quality estimator based on spectro-temporal similarity. The R5 evaluator does not make ViSQOL a hard dependency, because R5 is specifically intended to inspect temporal/phase/higher-order behavior that should not be collapsed into a single perceptual number. ViSQOL can be added as a complementary score in environments where it is installed.

Source: Google ViSQOL.  
https://github.com/google/visqol

## 4. GitHub benchmark design

The benchmark uses three signals:

1. **Pristine reference** — deterministic synthetic voice-like material with harmonic, breath, modulation, transient and stereo-microstructure content.
2. **Degraded input** — the pristine signal is temporally smeared, microdynamics are flattened, and bounded quantization/dither is applied while preserving broad spectral bandwidth.
3. **R5 output** — actual Chromium/Web Audio output captured immediately after R5.

The pristine signal exists only in the evaluator. The real-time R5 processor never receives it.

This arrangement asks a falsifiable question: **does R5 move the degraded signal toward the known pristine reference?** It does not reward arbitrary extra detail merely because the output sounds brighter or measures as more complex.

## 5. Detailed R5 evaluation indices

The GitHub report presents the metrics independently. Positive directional change means movement toward the pristine reference for that metric.

1. Waveform correlation — higher is closer.
2. SI-SDR — higher is closer.
3. Multi-band TFS correlation — higher is closer.
4. Multi-band envelope correlation — higher is closer.
5. 0.5–40 Hz envelope-modulation-spectrum correlation — higher is closer.
6. Instantaneous phase mean absolute error — lower is closer.
7. Group-delay RMSE — lower is closer.
8. CPP-like absolute reference delta — lower is closer.
9. Jitter absolute reference delta — lower is closer.
10. Shimmer absolute reference delta — lower is closer.
11. HNR absolute reference delta — lower is closer.
12. Sample Entropy absolute reference delta — lower is closer.
13. Bicoherence-proxy absolute reference delta — lower is closer.
14. Standardized third-moment absolute reference delta — lower is closer.
15. Standardized fourth-moment absolute reference delta — lower is closer.
16. Standardized fifth-moment absolute reference delta — lower is closer.
17. Transient-crest absolute reference delta — lower is closer.
18. R5 five-feature-space Euclidean distance — lower is closer.
19. R5 fifth-order interaction RMS absolute reference delta — lower is closer.

Additional diagnostics include alignment lag, derivative RMS ratio, peak dBFS, runtime feature RMS, runtime fifth-order interaction RMS, confidence, injected-detail RMS, injection/input ratio, maximum injection, and reported algorithmic latency frames.

## 6. Hard gates and warnings

Hard failures:

- R5 adds more than 0.35 ms of relative timing shift in the controlled benchmark.
- R5 output before downstream safety exceeds +0.1 dBFS.
- Runtime reports non-zero R5 algorithmic-lookahead frames.

Warnings:

- SI-SDR regresses by more than 1 dB.
- TFS correlation regresses by more than 0.015.
- Envelope correlation regresses by more than 0.01.
- Group-delay error materially increases.
- Fifth standardized moment materially diverges.

The report also counts how many directional metrics improve and regress. **There is intentionally no single "Reality Score" that can hide a large failure behind unrelated improvements.**

## 7. CI workload bounds

Several nonlinear metrics can become expensive on long signals. For reproducible GitHub Actions runtime, representative windows and bounded sample counts are used. The same limits are applied to degraded and R5 signals, so comparisons remain symmetric. The CI benchmark is a regression test, not a substitute for listening panels or laboratory source-reconstruction experiments.
