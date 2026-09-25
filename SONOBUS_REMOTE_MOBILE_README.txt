YURIKA Audio 3.2.1 / SonoBus Remote Mobile
==========================================

目的
----
PC上のYURIKA AudioでDSP/3D Spatial処理を行い、その音をPC側のオーディオ経路からSonoBusへ送り、外出先スマートフォンで受信するための最終出力モードです。

推奨設定
--------
1. 3D SPATIAL = ON
2. Final Output = SonoBus → Smartphone Headphones/IEM
3. PC側の「出力デバイス選択」で、SonoBusへ入力される仮想オーディオ経路を選択します。
4. SonoBus側でその入力を送信し、スマートフォン側で受信します。

HRTF
----
このモードでは、YURIKA既存のパラメトリックHRTF（クロスフィード、サブms遅延、周波数依存フィルタ、pinna/air EQ）を自動で有効化します。外部HRTFデータセットや耳形状データは不要です。
ただし個人の耳形状を測った「個人HRTF」ではありません。Generic/dataset-free binaural renderingです。

遅延
----
Remote MobileではAudioContextへ interactive / 48 kHzを要求します。ブラウザーはこの要求を必ず採用するとは限らないため、DiagnosticsのbaseLatency/outputLatencyを確認してください。
YURIKAのSpatial direct pathには固定の直列ディレイを追加せず、ITD/反射はside/parallel branchへ限定しています。
SonoBusのネットワーク遅延・jitter bufferはブラウザーから測れないため、YURIKAのDiagnosticsでは外部未測定として扱います。

重要
----
Chrome/Web Audioから、SonoBusの「遠隔相手がスマートフォンか」「スマホでイヤホンか本体スピーカーか」は取得できません。そのためFinal Outputを一度選択して保存する設計です。GenericなVB-CABLE/VoiceMeeterという名前だけを見て、勝手にSonoBusスマホだとは判定しません。
スマホ本体スピーカーで聴く場合は Final Output = SonoBus → Smartphone Speaker を選んでください。このモードではHRTFを適用しません。
