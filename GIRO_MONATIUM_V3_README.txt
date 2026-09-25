YURIKA Audio / GIRO MONATIUM 3.2.1 3D Spatial Ecosystem

3D Spatial Ecosystem 3.2.1
- 既存DSPを置換せず、最終Safety/Limiterより前へ独立レイヤーとして追加。
- 1ボタンON/OFF、AUTO/NATURAL/WIDE/DEEP、出力Device Profile、詳細Diagnostics。
- Headphone/IEMとSpeakerで処理方針を分離。既存HRTF有効時は二重HRTFを避ける。
- OFF時はDry本線を保ち、Wet処理枝を停止。プリセットを変えてもSpatial設定は独立保持。
- 詳細な設計・検証結果・実機Chrome確認手順は SPATIAL_IMPLEMENTATION_REPORT.txt を参照。

製品版仕上げ
- 800x600 popup / 740x544前後のゲーム風タブグループ
- モナティアム背景画像とSVG UIを分離
- ジーロ6ポーズを常駐レイヤー化し、sit切替時のsrc差し替えを廃止
- 音符は音楽中のみ間欠バースト。常時ループなし
- RIM手動状態セレクタなし。ジーロ状態へ自動追従
- RIM-116 RAM / Mk 49の21セルを3x7記号へ整理した外装意匠
- requestAnimationFrame + deltaTime。非表示時は描画ループ停止
- SE AudioContextは初回ユーザー操作時にだけ生成し、hiddenでsuspend、pagehideでclose
- タブはドラッグ並べ替え + キーボード左右/Home/End操作
- パネルドラッグはpopup内へ厳密にクランプ。ダブルクリックで中央復帰
- 背景/RIM/ポーズ素材をWebP最適化し、起動時デコード負荷とZIP容量を削減
- prefers-reduced-motion時は移動/常時モーション/歩行SEを抑制

既存オーディオ保護
- popup.js
- popup.css
- service-worker.js
- offscreen.js
- dsp-core.js
- modular-core.js
- adaptive-v29.js
- headphone-profiles.js
- youtube-av-sync.js
上記の音響中核はV3.1 RCから変更していません。manifest.jsonは製品名/バージョン/説明のみ更新。

キャラクター側はSTATUS / VIDEO_TELEMETRYを読み取るだけで、APPLY_PATCH / UPDATE_SETTINGS / SET_ENABLED / SET_PRESETを送信しません。

3.1.1 polish
- ジーロを拡大し、RIMを右下へ分離。キャラクター中心の視線誘導を強化。
- 自作DAP説明の常時表示を簡潔化。
- 選択タブとスクロールバーを手描きゲームUI寄りに調整。
