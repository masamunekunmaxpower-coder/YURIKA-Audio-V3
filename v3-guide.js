"use strict";
const SCENES = [{"id": "intro", "title": "YURIKA Audio V3", "kicker": "INTERACTIVE AUDIO SYSTEM GUIDE", "gesture": "wave", "line": "お、来たな。ワイがV3を案内する。見た目がちょっと騒がしい？ せやな、否定材料が少ない。", "body": "YURIKAは、元音源そのものを書き換えるのではなく、再生中の信号を観測して、空間・瞬発力・声・機器特性・安全状態までまとめて制御するリアルタイムDSPです。"}, {"id": "architecture", "title": "再生の仕方を組み替える", "kicker": "ADAPTIVE DSP ARCHITECTURE", "gesture": "point", "line": "音源を別物に作り直すんやなくて、どう鳴らすかをリアルタイムで組み替える。そこが本体やな。", "body": "Scene Dynamics、Fast Spark、Impact、Seam、Voice、Valley、Edge、HRTF、Headphone Correctionを個別に制御し、最後はGain Arbiter・Limiter・Safetyが全体をまとめます。"}, {"id": "spatial", "title": "音場を数字で見る", "kicker": "ITD / ILD / IACC / HRTF CUES", "gesture": "point", "line": "ITDは時間差、ILDは音量差、IACCは左右がどれくらい似てるか。数字は難しそうやけど、見てるものは割と素直なんよ。", "body": "Spatial Telemetryはゼロ出力の監視系です。ITD、ILD、IACC、Interaural Coherence、Lateralization、HRTF Cue Consistencyを観測します。Localizationは人間の実測誤差ではなく、ITD/ILDの整合性から作るproxyです。"}, {"id": "transient", "title": "ピークを盛らずに鋭くする", "kicker": "TRANSIENT VALLEY + EDGE ACCENT", "gesture": "excited", "line": "ピークだけ盛るとヘッドルームが死ぬ。なら直後を少し下げて、相対的に立たせればええやろ、って発想や。", "body": "Transient Valleyはアタック直後へ浅い谷を作り、Edge Accentは元信号由来のごく短い高域アクセントを加えます。Safety圧力が上がると両方とも自動的に縮退します。"}, {"id": "seamvoice", "title": "つぎはぎ音と声を扱う", "kicker": "SEAM NATURALIZER + VOICE MATERIAL", "gesture": "talk", "line": "無理やり発音させた音や切り貼りはSeamが見張る。Voiceは声の素材感を見るだけで、誰が喋ってるかなんて知らん。", "body": "Seam Naturalizerは不連続を検出して短時間だけ馴染ませます。Voice MaterialはvoiceConfidenceとsynthetic tendencyを連続推定し、Shallow / Normal / Deep、Transparency、Airへ反映します。"}, {"id": "headphone", "title": "ヘッドホンまで適応する", "kicker": "MODEL EQ + OPTIONAL CALIBRATION", "gesture": "serious", "line": "型番補正とHRTFは別物や。ヘッドホンの型番から君の耳の形まで当てたら、それはDSPじゃなくて超能力やろ。", "body": "対応環境では出力デバイスのラベルをユーザー選択後に照合し、既知の型番プロファイルへ自動適用します。テスト信号だけでは物理補正を断定せず、測定マイクやカプラを使う場合のみ追加の8帯域補正を生成します。"}, {"id": "reflection", "title": "反射を“感じやすく”する", "kicker": "REFLECTION CHARACTER", "gesture": "point", "line": "壁を石に変える機能はないぞ。出せる音のほうに、跳ね返りを感じやすい手掛かりを足してるだけや。", "body": "Reflection Characterは短い早期反射タップと帯域整形を使い、空間の跳ね返り感を補助します。物理的な壁面反射率を変える処理ではありません。"}, {"id": "runtime", "title": "CPUと複数YouTubeを管理する", "kicker": "CPU-ADAPTIVE RUNTIME / MULTI-TAB", "gesture": "talk", "line": "CPU数は目安にして解析量と同時セッション数を変える。コアをどこに置くかはChromeの仕事や。そこまでワイに投げるな。", "body": "hardwareConcurrencyを容量の目安として、診断頻度と同時セッション上限を調整します。複数のYouTubeタブはtabIdごとに独立ON/OFFでき、停止したタブだけを個別に切り離せます。"}, {"id": "orbit", "title": "長時間でも崩れにくくする", "kicker": "ORBIT KEEPER / SAFETY SUPERVISOR", "gesture": "serious", "line": "壊れてから祈るんじゃなくて、ズレたら少し戻す。まだダメなら段階的に安全側へ落とす。努力じゃなくて仕組みにしよう。", "body": "Orbit Keeperはreport freshness、non-finite、limiter圧力、control staleness、gain invariantなどを監視し、再同期 → 新機構リセット → 適応状態リセット → safe-degraded baselineの順で段階復旧します。"}, {"id": "results", "title": "改良は数字でも確認する", "kicker": "OBJECTIVE CHECK", "gesture": "excited", "line": "聴いて良かった、だけで終わらせん。v2.8ではTransientがDry近くまで戻った。ここは数字でも確認できたんよ。", "body": "同条件比較ではTransient P95がDry 2.99 dBに対してv2.8 2.93 dB、P99がDry 4.53 dBに対してv2.8 4.51 dB。v2.5 all-ONより局所瞬発力が大きく回復しています。"}, {"id": "end", "title": "音響エフェクト集ではなく、音響ランタイムへ", "kicker": "V3 SUMMARY", "gesture": "wave", "line": "こんな感じや。ワイが説明すると多少胡散臭く見えるが、数字は数字や。最後は実機で確かめる。そこだけは誤魔化さん。", "body": "V3は、DSP・空間診断・安全監視・ヘッドホン適応・CPU負荷分散・複数セッション管理を一つの再生系として扱うことを狙ったインタラクティブ音響システムです。"}];
let index = 0;
let timer = null;
let debugVisible = false;

const $ = (id) => document.getElementById(id);
const title = $("title");
const kicker = $("kicker");
const bodycopy = $("bodycopy");
const dialogue = $("dialogue");
const mood = $("mood");
const jiero = $("jiero");
const progress = $("progress");
const ring = $("gestureRing");
const debugPanel = $("debugPanel");

const nodeMap = {
  intro:["Scene","Safety","Orbit"],
  architecture:["Scene","Spark","Seam","Voice","Valley","Edge","HRTF","Headphone","Safety","Orbit"],
  spatial:["HRTF","Headphone"],
  transient:["Spark","Valley","Edge","Safety"],
  seamvoice:["Seam","Voice","Spark"],
  headphone:["Headphone","HRTF","Safety"],
  reflection:["HRTF","Safety"],
  runtime:["Scene","Safety","Orbit"],
  orbit:["Safety","Orbit"],
  results:["Spark","Valley","Edge"],
  end:["Scene","Safety","Orbit"]
};

function escapeText(s) {
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function renderProgress() {
  progress.innerHTML = "";
  SCENES.forEach((s,i) => {
    const b = document.createElement("button");
    b.className = "dot" + (i===index ? " active" : "");
    b.type = "button";
    b.title = `${i+1}. ${s.title}`;
    b.setAttribute("aria-label", `${i+1}. ${s.title}`);
    b.addEventListener("click", () => { index=i; render(); restartAuto(); });
    progress.appendChild(b);
  });
}

function setGesture(kind) {
  const allowed = new Set(["idle","wave","point","talk","excited","serious"]);
  const k = allowed.has(kind) ? kind : "idle";
  jiero.className = `character ${k}`;
  mood.textContent = k;
  ring.classList.remove("on");
  void ring.offsetWidth;
  if (k === "point" || k === "excited") ring.classList.add("on");
}

function renderNodes(sceneId) {
  const hot = new Set(nodeMap[sceneId] || []);
  document.querySelectorAll(".node").forEach(n => n.classList.toggle("hot", hot.has(n.dataset.node)));
}

function render() {
  const s = SCENES[index];
  kicker.textContent = s.kicker;
  title.textContent = s.title;
  bodycopy.textContent = s.body;
  dialogue.textContent = s.line;
  setGesture(s.gesture);
  renderNodes(s.id);
  renderProgress();
  $("prev").disabled = index === 0;
  $("next").textContent = index === SCENES.length-1 ? "最初へ ↺" : "次へ →";
  updateDebug();
}

function next() {
  index = (index + 1) % SCENES.length;
  render();
}
function prev() {
  index = Math.max(0,index-1);
  render();
}
function restartAuto() {
  if (!timer) return;
  clearInterval(timer);
  timer = setInterval(next, 8500);
}

$("next").addEventListener("click", () => { next(); restartAuto(); });
$("prev").addEventListener("click", () => { prev(); restartAuto(); });
$("auto").addEventListener("click", () => {
  if (timer) {
    clearInterval(timer); timer=null;
    $("auto").textContent="自動説明 OFF";
    $("auto").setAttribute("aria-pressed","false");
  } else {
    timer=setInterval(next,8500);
    $("auto").textContent="自動説明 ON";
    $("auto").setAttribute("aria-pressed","true");
  }
  updateDebug();
});
$("debugBtn").addEventListener("click", () => {
  debugVisible = !debugVisible;
  debugPanel.classList.toggle("show",debugVisible);
  $("debugBtn").setAttribute("aria-pressed",String(debugVisible));
  updateDebug();
});

document.addEventListener("keydown",(e)=>{
  if(e.key==="ArrowRight"){ next(); restartAuto(); }
  if(e.key==="ArrowLeft"){ prev(); restartAuto(); }
});

function selfTests() {
  const tests = [];
  const need = ["title","kicker","bodycopy","dialogue","jiero","prev","next","auto","progress"];
  tests.push({name:"required DOM", ok:need.every(id=>!!$(id))});
  tests.push({name:"scene count", ok:Array.isArray(SCENES) && SCENES.length>=8});
  tests.push({name:"unique scene ids", ok:new Set(SCENES.map(s=>s.id)).size===SCENES.length});
  tests.push({name:"dialogue complete", ok:SCENES.every(s=>s.line && s.title && s.body)});
  tests.push({name:"embedded image", ok:jiero.src.startsWith("data:image/png;base64,")});
  tests.push({name:"gesture contract", ok:SCENES.every(s=>["idle","wave","point","talk","excited","serious"].includes(s.gesture))});
  return tests;
}
const TESTS = selfTests();

function updateDebug() {
  if(!debugVisible) return;
  const s = SCENES[index];
  debugPanel.innerHTML = [
    `<b>V3 runtime debug</b>`,
    `scene: ${index+1}/${SCENES.length} // ${escapeText(s.id)}`,
    `gesture: ${escapeText(s.gesture)}`,
    `auto: ${timer ? "ON" : "OFF"}`,
    `image.complete: ${jiero.complete}`,
    ...TESTS.map(t=>`<span class="${t.ok?"test-ok":"test-bad"}">${t.ok?"PASS":"FAIL"} ${escapeText(t.name)}</span>`)
  ].join("<br>");
}

jiero.addEventListener("load",updateDebug);
jiero.addEventListener("error",()=>{
  if(debugVisible) debugPanel.innerHTML += '<br><span class="test-bad">FAIL character image load</span>';
});
render();
