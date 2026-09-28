# YURIKA Audio Fine-Grained Evaluator 指標定義

この評価器は **参照音源(reference)とDSP処理後(processed)の差を、原因別に分解するための内部回帰試験ツール**です。聴感試験や第三者測定機関の代替ではありません。単一の「総合音質点」は出しません。

## 1. Alignment / Core Fidelity

### Latency
FFT相互相関で参照と処理後の時間ずれを推定します。正値はprocessed側が遅れていることを表します。

### SI-SDR
全帯域の波形類似度をスケール不変で評価します。ただしBWEで意図的に24 kHz超を追加すると、正しい処理でもSI-SDRが下がる場合があります。

### In-band SI-SDR (<20 kHz)
帯域拡張で追加した超高域を評価から外し、既存帯域を壊していないかを確認します。BWE版の比較では通常のSI-SDRよりこちらを重視します。

### Multi-resolution spectral convergence
FFT 1024 / 4096 / 16384 の3解像度でスペクトル差を測ります。短時間transientと長時間tonalの両方を一つのFFTサイズだけに依存せず確認します。

### Band Log Spectral Distance / Band Energy Delta
20-200 / 200-2k / 2-8k / 8-20k / 20-24k / >24k に分けて誤差を表示します。

## 2. Perceptual Super-Resolution proxies

### Transient derivative correlation
5 ms RMS envelopeの正方向微分だけを比較し、立ち上がり位置・形状の保存を確認します。

### Attack quantile ratio
正方向微分の99パーセンタイル比です。1.0近傍なら強いアタック量が近いことを示します。

### Microdynamics envelope correlation
5 / 20 / 100 ms の3時間尺度でRMS envelope相関を確認します。微細、局所、やや長いダイナミクスを分離します。

### Local crest-factor MAE
20 ms窓でpeak/RMS比を比較します。transientを潰した、あるいは過度に尖らせた場合を検出しやすくします。

### 5.5-18 kHz high-detail correlation
可聴帯域内の高域ディテールをband-passして波形相関を測ります。

### Low-energy ambience envelope correlation
参照音の低エネルギー30%区間だけを使い、残響尾や静かな背景成分の包絡変化を比較します。

### SR Fidelity Index
上記の複数指標をまとめた**内部回帰proxy**です。high-detail、spectral flux、microdynamics、transient、波形相関を支持項として、LSDとspectral convergenceをペナルティに使います。聴感品質の絶対点ではありません。

## 3. Bandwidth Extension proxies

Nyquistが25 kHzを超える場合のみ有効です。

### HF/source energy ratio
>24 kHz のエネルギーを5-20 kHzのsource-bandエネルギーで正規化します。参照と処理後の両方を表示します。

### Native HF retention
参照側に十分な>24 kHz成分がある場合、その高域をDSPがどれだけ保持したかをdBで表示します。

### Added HF RMS
processed-reference差分を24 kHz high-passし、追加された超高域のRMSをdBFSで表示します。

### Cutoff continuity jump
20-23.5 kHz付近と24.5-29 kHz付近の平均スペクトル密度差です。44.1 kHzソースを96 kHzへ上げて28 kHzだけ足すような処理では、22.05-24 kHz付近の空洞を強く検出します。

### Harmonic continuation coherence
1-20 kHz内の主要ピークから整数倍の予測位置を作り、24 kHz超のエネルギーがその近傍へどれだけ集中しているかを測ります。倍音型BWE向けのproxyです。noise/ambience型BWEでは低くても必ずしも不良とは限りません。

### HF spectral flatness
24 kHz超のスペクトル平坦度です。0に近いほどtonal、1に近いほどnoise-likeです。良し悪しではなく生成特性の分類用です。

### HF transient coupling
5-20 kHzのsource-band envelopeと>24 kHz envelopeの相関です。両包絡に十分な時間変動がある場合だけvalid=trueになります。定常音では誤相関を避けるため無効化します。

### BWE overgeneration flag
参照にnative HFがほぼ無いのに、処理後HF/source比が過剰な場合の警告です。品質判定ではなく安全側のregression flagです。

### BWE Structure Index
harmonic continuation、validなtransient coupling、cutoff continuityをまとめた構造proxyです。**原音復元精度ではありません。**

## 4. Stereo / Spatial Integrity

- interchannel correlation delta
- mid/side ratio delta
- broadband ILD delta
- low-band ILD delta
- high-band ILD delta
- interchannel phase-coherence proxy delta
- channel imbalance delta
- Stereo Integrity Index

HRTF専用のITD/ILD cue評価は既存のSpatial Evaluatorを引き続き使用します。このCLIのstereo指標は、実音源処理で左右関係を不必要に崩していないかを見る補助評価です。

## 5. Safety

- sample peak dBFS
- 4x oversampled true-peak proxy
- clipping ratio
- non-finite sample count
- DC offset
- safety flags

`--fail-on-safety`を付けると安全フラグ発生時に終了コード3を返せるため、CMD/CIで自動停止できます。

## 6. 長い音源

既定では音源全体から5秒窓を層化抽出し、合計30秒を評価します。19分などの長時間音源を丸ごとRAMへ展開しません。

より細かくする例:

```cmd
tools\yurika-audio-eval.cmd --reference original.flac --processed output.wav --max-seconds 180 --window-seconds 5 --json report.json --csv report.csv
```

## 7. 解釈上の注意

- BWEは「元に無かった高域」を追加するため、全帯域SI-SDRだけで評価しないこと。
- 48 kHz以下の参照音源では、>24 kHzは未知情報です。BWE指標は生成構造と既存帯域破壊の有無を検査します。
- harmonic coherenceが高ければ常に良いわけではありません。texture/ambienceではnoise-likeな高域が自然な場合があります。
- proxy indexは同じ評価器・同じ条件でのバージョン間回帰比較に使うことを想定しています。
