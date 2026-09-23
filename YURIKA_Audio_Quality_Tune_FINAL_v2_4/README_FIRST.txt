YURIKA Audio FINAL Debug & Tune v2.4
====================================

これは YURIKA_Audio_Quality_Tune_v2_3 を基準にした最終デバッグ／最終チューニング候補です。

【今回の本命修正】
1. Web Audio Low-pass / High-pass の Q 値解釈を全体修正
   - 0.7 等の「通常Q」をそのままWeb Audioへ入れていた箇所を修正
   - Low/High-passだけWeb AudioのdB共振値へ変換
   - Peaking / Band-passのQは従来通り

2. Neutral / Flat のLow Cutを完全バイパス
   - 5 Hz設定を「透明/off sentinel」として真のバイパス経路へ
   - Neutralの位相回転とLSD/SI-SDR悪化要因を除去

3. Self-DAP低音ステレオをさらに保護
   - Side HPF: 5～30 Hz可変 -> 5 Hz固定
   - Side Delay: 0のまま
   - 高域Side Gain: 最大+1 dBのまま

4. Self-DAP内部コンプレッサーを音声経路から除外
   - 下流のFinal Limiter(-1 dB)の方が厳しいため重複していた
   - Final Limiter / Safety Meter / Master Safetyは維持
   - Self-DAPの固定遅延が約1コンプレッサー分減る見込み

【検証】
- 119 orchestration checks PASS
- 45 Node tests PASS
- Static 145/145 PASS
- Python 6系統 PASS
- Self-DAPモデル120条件 PASS

【適用方法】
1. ZIPを展開
2. YURIKA-Audio-V3 フォルダそのものを APPLY_FINAL_V2_4.cmd へドラッグ＆ドロップ
3. [OK] FINAL v2.4 applied. が出ることを確認
4. GitHub Desktopで差分確認
5. Summary: Final audio debug and tuning v2.4
6. Commit to main -> Push origin
7. Audio Quality Actionsの新しい結果を確認

【最重要の次回確認値】
Neutral:
- SI-SDR / SI-SDR 40-18k
- LSD
- 63/125Hz magnitude/phase
- latency

Self-DAP:
- Crosstalk L/R
- 63/125/250Hzのステレオ保持
- latency
- THD+N
- restoration monitor bands

Clean:
- 35/63/125Hzの周波数応答
- THD+N
- latency（Broad compressor + Final limiterなのでNeutralより長くて正常）

【戻す】
REVERT_FINAL_V2_4.cmd で適用直前へ戻せます。

注意:
このコンテナではMV3拡張の新規ブラウザ実測を最後まで成立させられなかったため、
最終的な音質判定は次のGitHub Audio Quality実測で行ってください。
閾値を緩めてPASSを作る変更はしていません。
