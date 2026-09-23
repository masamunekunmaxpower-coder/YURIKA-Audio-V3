# YURIKA Audio V3 — Jiero Interactive Workstation

V3は **YURIKA Audio v2.9.0 Auto Headphone Calibration** を音響コアとして維持し、ジーロ本人がシステムを案内するインタラクティブHTMLガイドを統合した配布版です。DSP設定スキーマは13のままで、音響アルゴリズムの互換性を保っています。

- Popupの **「V3 ジーロガイドを開く」** から `v3-guide.html` を開けます。
- ガイドはChrome Extension CSPに合わせてJavaScriptを `v3-guide.js` へ分離しています。
- `YURIKA_V3_JIERO_INTERACTIVE_GUIDE_STANDALONE.html` は単独閲覧用の自己完結版です。
- ガイドは解説UIであり、ガイドページ自身がDSP処理を行うものではありません。
- v2.9のAuto Headphone Detect / Test Signal / Measurement Calibration、v2.8以前の空間診断・Multi-Tab・Orbit等はそのまま収録しています。

---

# YURIKA Audio v2.8.0 Spatial / Reflection / Multi-Tab Workstation

# YURIKA Audio Workstation v2.6.0 — Seam / Valley / Orbit Engine

Chrome / Edge 116+ 向けのローカル音声DSP拡張です。v2.5のImpact Liberation / Gain Arbiter / Scene Dynamics / Fast Sparkを維持しつつ、**Seam Naturalizer / Transient Valley / Orbit Keeper**を追加しました。外部通信・host permissionsはありません。


## v2.6.0の追加機構

- **Seam Naturalizer / 継ぎ目自然化**: Sparkの0-gain side-chain解析を拡張し、短時間レベル不連続・微分スパイク・speech-band比率・Spark/crest整合性から `seamConfidence` を推定します。高確信時だけ2.6kHz付近のClarityを最大約1.35dBだけ短時間緩め、疑わしい継ぎ目でSpark強調も縮小します。**欠損音素や声を生成する機能ではありません**。
- **Transient Valley / 谷型アタック**: ピークを追加ブーストせず、検出済みアタック直後を最大0.60〜1.25dB（Device Profile依存）だけ短時間下げて局所コントラストを増やします。rising-edge時だけ発火し、Adaptive Safety圧力1.0では深さ0dBへ縮退します。
- **Orbit Keeper / 長期安定制御**: Safety Meter / Fast Monitor / Sceneのfreshness、Non-finite、Peak/Limiter、Gain invariant、AudioContext状態、監視タイマーdriftを1秒周期の独立supervisorで監視します。異常時は **L1再同期 → L2 v2.6差分reset → L3 adaptive state reset → L4 safe-degraded baseline** の順で段階復旧し、安定状態を20秒確認してから一段ずつ復帰します。
- **OFF互換**: Seam / Valley / OrbitをOFFにすると、Seam差分は0、Valley Gainはunity、Orbit supervisorは制御介入しません。v2.5の既存処理を意図的に変える差分は残しません。
- **固定レイテンシ非追加**: 新しいlook-ahead / DelayNodeは追加していません。Transient Valleyはunity GainNodeを制御する方式で、アルゴリズム上の固定遅延を追加しません。

### 設計上の限界

Seam Naturalizerはリアルタイムの後追い検出なので、編集点そのものを事前にcrossfadeするlook-ahead修復ではありません。音MAD等の切り貼りを「自然に寄せる」補助であり、元に存在しない音素・発音・話者情報を復元しません。Transient Valleyも主観的なアタック感を狙う機構であり、Dryのトランジェント波形を数学的に復元するものではありません。

## v2.5.0の追加機構


- **Unified Gain Arbiter**: Auto Level基準、Spark makeup、実効ゲインを分離し、`commitEffectiveLevelGain()` だけがAUTO LEVEL GainNodeを書き換えます。
- **Spark測定経路の分離**: Shared AnalyserはOutput直後、Spark makeupはその後段のAUTO LEVEL Gainへ適用します。Auto LevelがSpark自身を測定して打ち消す循環を避けます。
- **診断表示**: Auto Level、Spark Gain、Effective Gain、Safety Trim、Limiter GRを個別表示します。
- **Scene Dynamics Engine**: 出力側の共有Analyserを制御面として利用し、音声グラフを組み替えず既存DSP係数だけを動かします。
- **Scene DNA 7軸**: Cool/Warm、Open、Energy、Spark、Presence、Distance、Nightを0..1の連続値で保持。5段階換算だけでも `5^7 = 78,125` のScene Cellを識別できます。
- **Dynamic Exponent**: Scene特徴の確信度と強度を非線形変換し、曖昧な素材では原音寄り、特徴が明確な素材では演出を強めます。
- **Scene Inertia**: Sceneの切替を連続補間し、短時間の判定揺れによる音色のフラつきを抑えます。
- **Spark / 弾け**: 8 ms級の高速制御を50 msのScene基準から分離。Scene/Multi基準へ正の差分だけを加え、強い打音では標準設定で概ね+0.3〜0.6 dBの瞬間makeupを狙います。
- **Device Adaptation**: Headphone / Stereo / Smartphone / TV / Portable / Multi-Speakerの出力プロファイルを追加。
- **Smartphone保護**: 70 Hz級のLow Cut、低域ブースト上限、Width / Depth上限を持たせ、物理的に出にくい超低域を無理に持ち上げません。
- **Virtual Multi-Speaker**: Front / Wide / Ambient / Rear / Heightの内部係数を作り、既存の2ch空間DSPへ写像します。実5.1ハードウェア出力を偽装する機能ではありません。
- **Global Budget**: Spatial量とLimiter圧力を見て、全部ON時の過剰な広がり・倍音を抑えます。

## 短縮したAudio Path

Input / Deck / External
→ Cartridge Lab
→ Noise / EQ / Spectral Fill / Detail / Reality
→ Self DAP
→ Width / Perspective
→ Virtual DAC Matrix
→ Virtual DAP
→ Room Engine
→ Integrity Engine
→ Compressor
→ User Output + Auto Headroom
→ Transient Valley (unity at rest)
→ AUTO LEVEL
→ Adaptive Safety Trim
→ Final Limiter
→ Safety Meter Worklet
→ Master Safety Fade
→ Destination

旧v2.0.0ではAUTO LEVEL測定用Analyserが `Output → Analyser → Auto Level` と直列でした。v2.5.0では `Output → Auto Level` を直結し、Shared Analyserを横枝へ分離しました。v2.6.0では `Output → Transient Valley(unity) → Auto Level` とし、Shared Analyser / Fast MonitorもValley後段から横枝で観測します。Transient Valleyのため主信号経路にはunity GainNodeが1個増えますが、look-aheadやDelayNodeはなく、設計上の固定遅延は追加しません。Scene DynamicsとAUTO LEVELは引き続き同じShared Analyserを利用します。

## Scene / Sparkの考え方

Scene判定は音を止めません。Shared AnalyserからRMS、帯域エネルギー、Transient、Brightness、Density等を制御レートで取得し、Scene DNAへ変換します。Sceneは音声ノードの再接続ではなく、既存ノードのパラメータへ平滑化された係数を送ります。

例: 明るく疎な素材ではOpen / Cool / Sparkが上がり、Width / Air / Perspectiveが穏やかに増加します。エネルギーとTransientが高い素材ではSparkが上がり、アタック時だけDetail / Reality / Widthが短時間増加します。

## Device Profiles

- Headphone: 空間量を比較的広く許容。
- Stereo Speaker: 標準。
- Smartphone: Low Cut / Bass / Width / Depthを強く制限。
- TV: 中程度の低域保護と空間制限。
- Portable: 小型筐体向けに低域・空間量を抑制。
- Multi-Speaker: Virtual Multi-Speaker係数を広く利用。

## 安全性と状態管理

Service Workerがcanonical settings authorityです。Popupは変更キーだけを送り、action queueとmonotonic revisionで順序を固定します。Deck / External開始失敗時は開始前のcanonical settingsへロールバックします。

Scene / Spark / Device処理はcanonical設定を書き換えず、Offscreen runtime内の一時的な有効値として適用されます。Limiter圧力が高い場合はSpark追加分だけを0へ戻し、Auto Level基準は維持します。

## v2.5時点の検証（履歴）

- JavaScript syntax: package 11本 + tests 25本 PASS
- Static checks: **94 / 94 PASS**
- Scene Engine: 78,125 Scene Cell範囲 / Device caps / Spark / Virtual Multi controls PASS
- Dependency audit: PASS
- Modular core fuzz: 20,000 randomized cases PASS
- DSP fuzz: 10,000 randomized settings PASS
- State engine stress: 50,000 actions PASS
- Service Worker concurrent patches: 1,000 PASS
- START/STOP endurance: 200 cycles PASS
- Revision guard: 5,000 revisions + stale rejection PASS
- Safety Meter stress: 512,000 stereo frames PASS
- Auto Level: +6 / -12 dB bounds + OFF unity PASS
- 48 / 96 kHz Perspective simulation: PASS

## 未検証 / 非対応

- Windows実機Chrome/Edgeでの長時間CPU / thermal測定
- 実USB / line / microphone入力のpermission UX
- 実スピーカーごとの周波数応答自動測定
- ブラウザからの確実な物理5.1 / 7.1 speaker routing
- 主観音質の最終チューニング
- 真のDSD/native 1-bit
- 実DAC / ケーブル / 電源等の物理・電気的完全再現

## 導入

1. ZIPを展開。
2. `chrome://extensions/` を開く。
3. デベロッパーモードをON。
4. 「パッケージ化されていない拡張機能を読み込む」で `manifest.json` のあるフォルダを指定。
5. 旧版は同時ONにせず無効化。

## v2.4 Unified Gain Arbiter + Additive Fast Spark

- `spark-monitor-worklet.js` は出力側の **0-gain side-chain** でのみ動作し、可聴直列経路には入りません。Spark OFF時はWorklet内部の解析を休止します。
- 2 ms fast RMS envelope と35 ms slow RMS envelopeの差を約8 ms間隔で制御面へ送ります。
- 50 ms側はScene / Device / Virtual Multi-Speakerの**基準値だけ**を計算し、8 ms側はその基準へ正の差分だけを加えます。安全制御が働いても基準値へ戻るだけで、基準以下には下げません。
- 標準Spark 45では強い打音に概ね+0.3〜0.6 dB、最大設定ではHeadphone / Stereo / Multi-Speakerを+0.8 dBに制限します。Smartphone / Portableは+0.20 dB、TVは+0.45 dBです。
- 高速側が動かすのはDetail / Reality harmonic / Width / Output makeupです。PerspectiveのDelay / Filter topologyは50 ms側に残し、無駄な高速再設定を避けます。
- Workletが利用不能、または報告が180 ms以上途絶えた場合は、50 ms RMS transient検出へ自動フォールバックします。
- `ADDITIVE_SPARK_VALIDATION.json` は検出器と加算カーブ、`GAIN_ARBITER_VALIDATION.json` はAuto Levelとの合成制御を検証した結果です。どちらもレンダリング済みv2.4出力の代替ではありません。


## v2.5 Impact Liberation Engine

全機能ON時に広帯域Compressorや空間系がFast Sparkのアタックを丸める問題へ対処。
主直列経路は変更せず、Integrity出力から1.4–9 kHzだけを取り出す並列Impactレーンを追加した。通常時Gain=0で無音。Fast Sparkの強いパルス時だけ最大デバイス上限まで短時間開く。
同時にCompressorのthreshold/ratio/attackを数十msだけ緩める Compressor Escape を実装。Adaptive Safety/Limiter圧力が上がるとImpact GainとEscapeは0へ縮退し、従来の基準音へ戻る。
標準値は Impact Liberation ON / Punch 65。Stereo/Multi-Speakerの並列Gain上限0.24、Headphone 0.20、TV 0.14、Portable 0.09、Smartphone 0.075。


## v2.6 検証（この配布物）

- JavaScript syntax: PASS
- JavaScript tests: 28 / 28 PASS
- Static audit: 110 / 110 PASS
- Dependency audit: PASS
- Perspective simulation 48 / 96 kHz: PASS
- Adaptive v2.6 deterministic test: PASS
- Adaptive v2.6 fuzz: 100,000 randomized cases PASS（device valley cap最大1.25dBを逸脱せず）
- Yurika Edge MCP deterministic final audit: 85.87 / pass_with_limits / must constraints 5/5 PASS

未検証なのは、実ブラウザでの数時間〜数日連続運転、CPU/thermal、実際の音MAD素材での誤検知率、主観A/B、およびTransient ValleyによるP95/P99改善量です。これらは実機測定対象です。

## v2.7 Voice / Edge / Headphone Adaptation

### Voice Material Engine
- Monitor-derived `voiceConfidence` and continuous `syntheticTendency`; no speaker identity recognition.
- `Shallow / Normal / Deep` changes bounded body/presence/early-reflection cues without pitch shifting.
- `Transparency` applies bounded de-mud/presence shaping; `Voice Air` adds bounded high-band openness.
- Natural sibilants and genuine transients are guarded by the monitor features. When OFF, all added voice filters are neutral and reflection wet=0.

### Transient Edge Accent
- Signal-derived band-limited micro-accent, not generated broadband white noise.
- A 2.5–8 kHz-ish bandpass/waveshaper parallel branch opens only on a rising Fast Spark event.
- `Soft / Focused / Sharp` changes the center/Q. Device caps are 0.04–0.09 wet gain, with sibilance/seam/safety suppression.
- Works together with Transient Valley: Edge supplies a very short leading contour while Valley increases post-attack contrast. Both return to zero under safety pressure.

### Headphone Model Correction
- Exact model selector is separate from HRTF. Model correction is active only when Output=`Headphone`.
- Starter embedded profiles: Generic/neutral, Sennheiser HD 600, Sony WH-1000XM5.
- The model profiles use offline parametric EQ/preamp data attributed to AutoEq/oratory1990 measurement-family sources. They are correction profiles, not claims that all physical units of a model measure identically.
- Unknown models fall back to Generic / No correction.

### HRTF Virtualization
- Generic lightweight binaural approximation using direct paths plus bounded delayed/low-passed crossfeed and subtle pinna/air shaping.
- `Natural / Near / Wide / Front Focus` profiles.
- Direct paths are not delayed; no new fixed look-ahead is introduced.
- This is not a personalized measured HRTF. Headphone model number never substitutes for listener anatomy.

### Compatibility / safety contract
- v2.7 settings schema: 11.
- New modules are individually switchable and default OFF except legacy v2.6 modules retain their prior defaults.
- Gain Arbiter remains the only writer to effective AutoLevel gain.
- Orbit Keeper resets Voice/Edge deltas together with Seam/Valley during staged recovery.
- True dry bypass, master safety, limiter, revision/rollback and no-network extension policy remain intact.


## v2.8 additions
- Spatial Telemetry side-chain: ITD proxy, ILD, low/high ILD, IACC, IACC lag, localization-cue inconsistency proxy, HRTF-cue consistency. These are diagnostics, not listener localization measurements.
- Reflection Character: bounded 3-tap early-reflection branch. It changes playback cues, not the physical reflection coefficient of the room.
- CPU-adaptive scheduler: `navigator.hardwareConcurrency` selects conservative/balanced/parallel/extended diagnostic cadence and a bounded concurrent-tab cap. The browser still owns real AudioWorklet scheduling/core affinity.
- A/V delay compensation: optional 0-150 ms audio delay for cases where processed audio leads video. Runtime reports estimated base/output latency; it does not invent automatic sync from CPU count.
- Multi-tab sessions: open YouTube tabs can be captured independently and mixed into the shared YURIKA DSP bus, up to the CPU-tier cap.


## v2.9 Auto Headphone Detect / Calibration
- Auto Detect Output uses the browser audio-output picker when available. Browser security requires a user gesture; YURIKA does not silently enumerate private output labels.
- Exact/alias label matching selects an embedded model profile. Unknown labels fall back to Generic rather than guessing.
- Test Signal is a bounded verification sequence. Test audio alone does not measure physical headphone frequency response.
- Measure & Calibrate is only for a measurement microphone / ear-coupler setup. It measures 8 relative bands, rejects low-SNR runs, smooths the result and clamps additional EQ to +/-3 dB per band. Ordinary laptop/headset microphones are low-confidence and not a laboratory substitute.
- Headphone model correction remains separate from generic HRTF.
