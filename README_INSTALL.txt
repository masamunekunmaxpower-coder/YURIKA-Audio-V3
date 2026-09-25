YURIKA Audio - GIRO MONATIUM 3.2.1 3D Spatial Ecosystem

インストール
------------
1. ZIPを展開
2. Chromeで chrome://extensions を開く
3. 右上の「デベロッパー モード」をON
4. 「パッケージ化されていない拡張機能を読み込む」
5. manifest.json が見える展開先フォルダを選択
6. 「YURIKA Audio - GIRO MONATIUM」が表示されたら完了

操作
----
- popupは800x600。ブラウザ全体ではなく、大きめのゲーム風タブグループとして表示します。
- 上部をドラッグするとパネルをpopup内で少し移動できます。ダブルクリックで中央へ戻ります。
- 上部タブはドラッグで並べ替えできます。並び順は保存しません。
- タブは左右矢印 / Home / End キーでも移動できます。
- ジーロSEはユーザー操作後に有効化され、popupが表示中の時だけ鳴ります。

注意
----
- キャラクター演出は既存DSPとは別レイヤーです。
- RIM外装はRIM-116 RAM / Mk 49の21セルを視覚モチーフにした二次創作上の再設計です。
- 武器操作や発射機能はありません。


3.1.2 Hotfix
------------
- 拡張機能を更新/再読み込みした後、更新前から開いていたYouTubeタブに残った古いcontent scriptは自動停止します。
- chrome://extensions のエラー欄へ Extension context invalidated が連続追加される問題を抑止します。
- 音質/DSP処理は3.1.1から変更していません。


3.1.4 Voice / HRTF Diagnostic Stability
--------------------------------------
- Voice/HRTFの可聴DSP処理式は変更していません。
- Voiceは短時間の瞬時ディップを診断表示だけ平滑化し、raw値も保持します。
- HRTF cueは直近9レポート中央値を主表示にし、raw値も保持します。
- 診断タブではジーロの60Hz演出、歩行SE、音符、重複STATUS取得を停止します。
- 短い外れ値は抑えますが、持続的な低下は主表示にも追従します。


3.2.1 3D Spatial Ecosystem
--------------------------
- ホーム画面の「3D SPATIAL」で独立Spatial LayerをON/OFFできます。
- 出力機器を選べる環境では「出力を選択」から変更できます。API非対応時は既定出力へ安全にFallbackします。
- Device ProfileはAutoまたは手動選択できます。出力APIから機器の正確な音響特性を取得できる、とは扱いません。
- Spatial OFF時は従来DSPのDry経路を維持します。
- 実機確認項目は SPATIAL_IMPLEMENTATION_REPORT.txt を参照してください。
