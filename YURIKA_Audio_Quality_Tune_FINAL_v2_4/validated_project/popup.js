"use strict";

const { DEFAULTS, sanitizeSettings } = globalThis.YurikaAudioCore;
const AdaptiveV29 = globalThis.YurikaAdaptiveV29;
const HeadphoneProfiles = globalThis.YurikaHeadphoneProfiles;

const ids = [
  "enabled","preset","lowCutHz","bassDb","warmthDb","clarityDb","airDb","outputDb","compressor",
  "detail","width","reality","noiseReduction","spectralFill","hiResMode","dapMode","dapStrength",
  "selfDapEnabled","selfDapStrength","selfDapRestoration","selfDapRestorationCutoffKhz",
  "perspectiveEnabled","perspectiveDepth","adaptiveSafetyEnabled",
  "sceneEnabled","sceneStrength","sceneExponent","sceneInertia","sparkEnabled","sparkAmount","impactEnabled","impactAmount","seamNaturalizerEnabled","seamNaturalizerAmount","transientValleyEnabled","transientValleyAmount","transientEdgeEnabled","transientEdgeAmount","transientEdgeTone","orbitKeeperEnabled","deviceProfile","multiSpeakerEnabled","multiSpeakerAmount",
  "voiceMaterialEnabled","voiceMaterialAmount","voiceDepthMode","voiceTransparency","voiceAir","headphoneCorrectionEnabled","headphoneModel","headphoneCorrectionStrength","headphoneCalibrationEnabled","headphoneCalibrationStrength","hrtfEnabled","hrtfProfile","hrtfAmount","spatialTelemetryEnabled","reflectionCharacterEnabled","reflectionCharacterAmount","reflectionCharacterMode","avSyncEnabled","avSyncDelayMs",
  "dacMatrixMode","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight",
  "roomEnabled","roomMode","roomAmount","integrityEnabled","integrityMode","integrityStrength",
  "autoLevelEnabled","autoLevelProfile","autoLevelTargetDbfs",
  "djEnabled","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb",
  "cartridgeEnabled","cartridgeMode","cartridgeAResistance","cartridgeACapacitance","cartridgeAGainDb",
  "cartridgeBResistance","cartridgeBCapacitance","cartridgeBGainDb","cartridgeCResistance","cartridgeCCapacitance","cartridgeCGainDb",
  "cartridgeMixA","cartridgeMixB","cartridgeMixC"
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const statusEl = document.getElementById("status");
const diagEl = {
  peak: document.getElementById("diagPeak"), rms: document.getElementById("diagRms"), corr: document.getElementById("diagCorr"),
  stereo: document.getElementById("diagStereo"), trim: document.getElementById("diagTrim"), limiter: document.getElementById("diagLimiter"),
  autoLevel: document.getElementById("diagAutoLevel"), sparkGain: document.getElementById("diagSparkGain"), impact: document.getElementById("diagImpact"), compEscape: document.getElementById("diagCompEscape"), seam: document.getElementById("diagSeam"), valley: document.getElementById("diagValley"), edge: document.getElementById("diagEdge"), voice: document.getElementById("diagVoice"), headphone: document.getElementById("diagHeadphone"), orbit: document.getElementById("diagOrbit"), effectiveGain: document.getElementById("diagEffectiveGain"),
  supervisor: document.getElementById("diagSupervisor"), scene: document.getElementById("diagScene"), device: document.getElementById("diagDevice"), itd:document.getElementById("diagItd"),ild:document.getElementById("diagIld"),iacc:document.getElementById("diagIacc"),localization:document.getElementById("diagLocalization"),hrtfCue:document.getElementById("diagHrtfCue"),avSync:document.getElementById("diagAvSync"),sessions:document.getElementById("diagSessions")
};
const RANGE_KEYS = new Set(["bassDb","warmthDb","clarityDb","airDb","outputDb","detail","width","reality","noiseReduction","spectralFill","dapStrength","selfDapStrength","perspectiveDepth",
  "sceneStrength","sceneExponent","sceneInertia","sparkAmount","impactAmount","seamNaturalizerAmount","transientValleyAmount","transientEdgeAmount","reflectionCharacterAmount","avSyncDelayMs","voiceMaterialAmount","voiceTransparency","voiceAir","headphoneCorrectionStrength","headphoneCalibrationStrength","hrtfAmount","multiSpeakerAmount","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight","roomAmount","integrityStrength","autoLevelTargetDbfs","djCrossfader","djAutoMixSeconds","deckAGainDb","deckBGainDb","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb","cartridgeMixA","cartridgeMixB","cartridgeMixC"]);
const pendingTimers = new Map();
const fieldGeneration = new Map();
let uiState = { ...DEFAULTS };
let actionQueue = Promise.resolve();
let initialized = false;
let statusTimer = null;

const dbText = (v) => `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)} dB`;
const send = (type, extra = {}) => chrome.runtime.sendMessage({ target: "service-worker", type, ...extra });

function enqueueUiAction(task) {
  const run = actionQueue.then(task, task);
  actionQueue = run.catch(() => {});
  return run;
}

function readControlValue(key) {
  const node = el[key];
  if (!node) return undefined;
  if (node.type === "checkbox") return Boolean(node.checked);
  if (node.type === "range" || node.tagName === "SELECT" && ["lowCutHz","selfDapRestorationCutoffKhz"].includes(key)) return Number(node.value);
  return node.value;
}

function render(settings) {
  uiState = sanitizeSettings({ ...DEFAULTS, ...(settings || {}) });
  for (const [key, value] of Object.entries(uiState)) {
    if (!el[key]) continue;
    if (el[key].type === "checkbox") el[key].checked = Boolean(value);
    else el[key].value = String(value);
  }
  updateOutputs();
}

function updateOutputs() {
  for (const key of ["bassDb","warmthDb","clarityDb","airDb","outputDb","deckAGainDb","deckBGainDb"]) { const o=document.getElementById(`${key}Out`); if(o)o.textContent=dbText(el[key].value); }
  for (const key of ["detail","width","reality","noiseReduction","spectralFill","dapStrength","selfDapStrength","perspectiveDepth","sceneStrength","sceneExponent","sceneInertia","sparkAmount","impactAmount","seamNaturalizerAmount","transientValleyAmount","transientEdgeAmount","reflectionCharacterAmount","avSyncDelayMs","voiceMaterialAmount","voiceTransparency","voiceAir","headphoneCorrectionStrength","headphoneCalibrationStrength","hrtfAmount","multiSpeakerAmount","dacMatrixStrength","dacAkmWeight","dacEssWeight","dacTiWeight","roomAmount","integrityStrength","djCrossfader","deckALowDb","deckAMidDb","deckAHighDb","deckBLowDb","deckBMidDb","deckBHighDb","cartridgeMixA","cartridgeMixB","cartridgeMixC"]) { const o=document.getElementById(`${key}Out`); if(o)o.textContent=Number(el[key].value).toFixed(1); }
  const expOut=document.getElementById("sceneExponentOut"); if(expOut) expOut.textContent=Number(el.sceneExponent.value).toFixed(2);
  const target=document.getElementById("autoLevelTargetDbfsOut"); if(target)target.textContent=`${Number(el.autoLevelTargetDbfs.value).toFixed(1)} dBFS`;
  const mixSeconds=document.getElementById("djAutoMixSecondsOut"); if(mixSeconds)mixSeconds.textContent=`${Number(el.djAutoMixSeconds.value).toFixed(1)} s`;
}

function updateLocalField(key) {
  fieldGeneration.set(key, (fieldGeneration.get(key) || 0) + 1);
  const rawValue = readControlValue(key);
  const next = sanitizeSettings({ ...uiState, [key]: rawValue, enabled: uiState.enabled, preset: uiState.preset });
  uiState = next;
  if (el[key]) {
    if (el[key].type === "checkbox") el[key].checked = Boolean(next[key]);
    else el[key].value = String(next[key]);
  }
  updateOutputs();
  return next[key];
}

async function flushField(key) {
  const timer = pendingTimers.get(key);
  if (timer) clearTimeout(timer);
  pendingTimers.delete(key);
  const value = uiState[key];
  const generation = fieldGeneration.get(key) || 0;
  return enqueueUiAction(async () => {
    const result = await send("APPLY_PATCH", { patch: { [key]: value } });
    if (!result?.ok) {
      statusEl.textContent = result?.error || "設定更新に失敗";
      const canonical = await send("GET_SETTINGS");
      if (canonical?.ok) render(canonical.settings);
      return result;
    }
    // Only accept the acknowledged field. Never repaint unrelated layers from a slider response.
    if (result.settings && Object.prototype.hasOwnProperty.call(result.settings, key) && (fieldGeneration.get(key) || 0) === generation) {
      uiState = sanitizeSettings({ ...uiState, [key]: result.settings[key], enabled: uiState.enabled, preset: uiState.preset });
      if (el[key]?.type === "checkbox") el[key].checked = Boolean(uiState[key]);
      else if (el[key]) el[key].value = String(uiState[key]);
      updateOutputs();
    }
    if (key === "hiResMode" || key === "selfDapEnabled" || key === "perspectiveEnabled" || key === "dapMode" || key === "sceneEnabled" || key === "sparkEnabled" || key === "impactEnabled" || key === "seamNaturalizerEnabled" || key === "transientValleyEnabled" || key === "transientEdgeEnabled" || key === "transientEdgeTone" || key === "voiceMaterialEnabled" || key === "voiceDepthMode" || key === "headphoneCorrectionEnabled" || key === "headphoneModel" || key === "hrtfEnabled" || key === "hrtfProfile" || key === "spatialTelemetryEnabled" || key === "reflectionCharacterEnabled" || key === "reflectionCharacterMode" || key === "avSyncEnabled" || key === "orbitKeeperEnabled" || key === "deviceProfile" || key === "multiSpeakerEnabled") await refreshStatus();
    return result;
  });
}

function scheduleFieldPatch(key) {
  const old = pendingTimers.get(key);
  if (old) clearTimeout(old);
  pendingTimers.set(key, setTimeout(() => { void flushField(key); }, 40));
}

function flushAllPendingBestEffort() {
  for (const key of [...pendingTimers.keys()]) void flushField(key);
}

async function setEnabled(enabled) {
  el.enabled.disabled = true;
  try {
    await enqueueUiAction(async () => {
      statusEl.textContent = enabled ? "DSPを開始しています…" : "DSPを停止しています…";
      const response = await send("SET_ENABLED", { enabled });
      if (!response?.ok) {
        uiState = sanitizeSettings({ ...uiState, enabled:false });
        el.enabled.checked = false;
        statusEl.textContent = response?.error || "開始できませんでした";
        return;
      }
      uiState = sanitizeSettings({ ...uiState, enabled:Boolean(response.settings?.enabled) });
      el.enabled.checked = uiState.enabled;
      await refreshStatus();
    });
  } catch (error) {
    uiState = sanitizeSettings({ ...uiState, enabled:false });
    el.enabled.checked = false;
    statusEl.textContent = error?.message || String(error);
  } finally {
    el.enabled.disabled = false;
  }
}

function dbfs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-∞ dBFS";
  return `${(20 * Math.log10(n)).toFixed(1)} dBFS`;
}

function renderDiagnostics(s) {
  if (!diagEl.peak) return;
  diagEl.peak.textContent = Number.isFinite(Number(s?.safetyPeak)) ? dbfs(s.safetyPeak) : "--";
  diagEl.rms.textContent = Number.isFinite(Number(s?.safetyRms)) ? dbfs(s.safetyRms) : "--";
  diagEl.corr.textContent = Number.isFinite(Number(s?.stereoCorrelation)) ? Number(s.stereoCorrelation).toFixed(5) : "--";
  diagEl.stereo.textContent = s?.stereoClass || "--";
  diagEl.trim.textContent = Number.isFinite(Number(s?.adaptiveTrimDb)) ? `${Number(s.adaptiveTrimDb).toFixed(2)} dB` : "0.00 dB";
  if (diagEl.limiter) diagEl.limiter.textContent = Number.isFinite(Number(s?.limiterReductionDb)) ? `${Number(s.limiterReductionDb).toFixed(2)} dB` : "--";
  if (diagEl.autoLevel) diagEl.autoLevel.textContent = Number.isFinite(Number(s?.autoLevelDb)) ? `${Number(s.autoLevelDb).toFixed(2)} dB` : "0.00 dB";
  if (diagEl.sparkGain) diagEl.sparkGain.textContent = Number.isFinite(Number(s?.sparkMakeupDb)) ? `+${Math.max(0, Number(s.sparkMakeupDb)).toFixed(3)} dB` : "+0.000 dB";
  if (diagEl.impact) diagEl.impact.textContent = Number.isFinite(Number(s?.impactGain)) ? Number(s.impactGain).toFixed(4) : "0.0000";
  if (diagEl.compEscape) diagEl.compEscape.textContent = Number.isFinite(Number(s?.compressorEscape)) ? `${(Math.max(0,Number(s.compressorEscape))*100).toFixed(0)}%` : "0%";
  if (diagEl.seam) diagEl.seam.textContent = Number.isFinite(Number(s?.seamConfidence)) ? `${Number(s.seamConfidence).toFixed(3)} / ${Number(s.seamEvents||0)}` : "0.000";
  if (diagEl.valley) diagEl.valley.textContent = Number.isFinite(Number(s?.transientValleyDepthDb)) ? `-${Number(s.transientValleyDepthDb).toFixed(3)} dB / ${Number(s.transientValleyTriggers||0)}` : "0.000 dB";
  if (diagEl.edge) diagEl.edge.textContent = Number.isFinite(Number(s?.transientEdgeWet)) ? `${Number(s.transientEdgeWet).toFixed(4)} / ${Number(s.transientEdgeTriggers||0)}` : "0.0000";
  if (diagEl.voice) diagEl.voice.textContent = Number.isFinite(Number(s?.voiceConfidence)) ? `${Number(s.voiceConfidence).toFixed(3)} / syn ${Number(s.voiceSyntheticTendency||0).toFixed(3)}` : "0.000";
  if (diagEl.headphone) diagEl.headphone.textContent = s?.deviceProfile === "headphone" ? `${s.headphoneModel || "generic"}${s.headphoneCalibrationEnabled ? " / CAL" : ""}${s.hrtfEnabled ? ` / HRTF ${s.hrtfProfile}` : ""}` : "inactive"; const hpState=document.getElementById("headphoneAutoState"); if(hpState)hpState.textContent=`Output: ${s?.headphoneOutputLabel||"not selected"} / sink:${s?.headphoneOutputSinkApplied?"active":(s?.headphoneOutputDeviceSelected?"selected":"default")} / calibration:${s?.headphoneCalibrationEnabled?"measurement":"profile only"}`;
  if (diagEl.orbit) diagEl.orbit.textContent = Number.isFinite(Number(s?.orbitHealthScore)) ? `${Number(s.orbitHealthScore).toFixed(0)} / L${Number(s.orbitLevel||0)}${s?.orbitDegraded ? " SAFE" : ""}` : "--";
  const sm=s?.spatialMetrics||{};
  if(diagEl.itd)diagEl.itd.textContent=Number.isFinite(Number(sm.itdMs))?`${Number(sm.itdMs).toFixed(3)} ms`:"--";
  if(diagEl.ild)diagEl.ild.textContent=Number.isFinite(Number(sm.ildDb))?`${Number(sm.ildDb).toFixed(2)} dB`:"--";
  if(diagEl.iacc)diagEl.iacc.textContent=Number.isFinite(Number(sm.iacc))?`${Number(sm.iacc).toFixed(4)}${Number.isFinite(Number(sm.iaccSigned))&&Number(sm.iaccSigned)<0?" (inv)":""}`:"--";
  if(diagEl.localization)diagEl.localization.textContent=Number.isFinite(Number(sm.localizationErrorProxyDeg))?`${Number(sm.localizationErrorProxyDeg).toFixed(1)}° proxy`:"--";
  if(diagEl.hrtfCue)diagEl.hrtfCue.textContent=Number.isFinite(Number(sm.hrtfCueConsistency))?`${Number(sm.hrtfCueConsistency).toFixed(0)}/100`:"--";
  if(diagEl.avSync)diagEl.avSync.textContent=Number.isFinite(Number(s?.avSyncEstimatedAudioLatencyMs))?`${Number(s.avSyncEstimatedAudioLatencyMs).toFixed(1)} ms`:"--";
  if(diagEl.sessions)diagEl.sessions.textContent=`${Number(s?.sessionCount||0)} / ${Number(s?.maxSessions||1)}`;
  if (diagEl.effectiveGain) diagEl.effectiveGain.textContent = Number.isFinite(Number(s?.effectiveLevelDb)) ? `${Number(s.effectiveLevelDb).toFixed(3)} dB` : "0.000 dB";
  const sup = s?.safetyMeterAvailable ? (s?.safetyFaultLatched ? "MUTED / recovery" : "ACTIVE") : "fallback";
  diagEl.supervisor.textContent = `${sup}${Number(s?.runtimeRecoveries || 0) ? ` / rec ${s.runtimeRecoveries}` : ""}`;
  if (diagEl.scene) diagEl.scene.textContent = s?.scenePatternId === null || s?.scenePatternId === undefined ? "--" : `#${s.scenePatternId} / A${String(s.sceneAccent ?? 0).padStart(2,"0")}`;
  if (diagEl.device) diagEl.device.textContent = s?.deviceProfile || "stereo";
}

async function refreshStatus() {
  try {
    const s = await send("STATUS");
    const active = Boolean(s?.ok && s.active);
    const activeTabEnabled = Boolean(s?.activeTabEnabled);
    renderDiagnostics(s);
    uiState = sanitizeSettings({ ...uiState, enabled:active });
    el.enabled.checked = activeTabEnabled;
    if (!s?.ok) statusEl.textContent = s?.error || "状態を取得できません";
    else if (!active) statusEl.textContent = "BYPASS / YouTube本来の音声";
    else {
      const rate = s.sampleRate ? `${(s.sampleRate/1000).toFixed(1)} kHz` : "? kHz";
      const hi = s.requestedHiRes ? (s.hiResActive ? " / Hi-Res active" : " / Hi-Res fallback") : "";
      const nr = s.noiseWorkletAvailable ? " / NR" : " / NR fallback";
      const lim = Number.isFinite(s.limiterReductionDb) && s.limiterReductionDb < -0.05 ? ` / LIM ${s.limiterReductionDb.toFixed(1)} dB` : "";
      const dap = s.dapMode && s.dapMode !== "off" ? ` / DAP ${s.dapMode} ${s.dapStrength ?? 0}` : "";
      const selfDap = s.selfDapEnabled ? ` / SELF-DAP ${s.selfDapStrength ?? 0} R:${s.selfDapRestorationActive ? "ON" : (s.selfDapRestoration || "auto")} @${s.selfDapRestorationCutoffKhz ?? 14}k` : "";
      const perspective = s.perspectiveEnabled ? ` / DEPTH ${s.perspectiveDepth ?? 0}` : "";
      const trim = Number(s.adaptiveTrimDb || 0) < -0.05 ? ` / SAFE ${Number(s.adaptiveTrimDb).toFixed(1)}dB` : "";
      const al = s.autoLevelEnabled ? ` / AL ${Number(s.autoLevelDb || 0).toFixed(1)}dB` : "";
      const dm = s.dacMatrixMode && s.dacMatrixMode !== "off" ? ` / DAC ${s.dacMatrixMode}` : "";
      const room = s.roomEnabled ? ` / ROOM ${s.roomMode}` : "";
      const input = s.inputMode ? ` / ${String(s.inputMode).toUpperCase()}` : "";
      const autoMix = s.djAutoMixActive ? ` / AUTO-MIX ${Number(s.djAutoMixProgress || 0).toFixed(0)}%` : "";
      const scene = s.sceneEnabled ? ` / SCENE #${s.scenePatternId ?? "--"}` : "";
      const spark = s.sparkEnabled ? ` / SPARK ${Number(s.sparkAmount || 0).toFixed(0)}` : "";
      const impact = s.impactEnabled ? ` / IMPACT ${Number(s.impactAmount || 0).toFixed(0)}` : "";
      const seam = s.seamNaturalizerEnabled ? ` / SEAM ${Number(s.seamNaturalizerAmount || 0).toFixed(0)}` : "";
      const valley = s.transientValleyEnabled ? ` / VALLEY ${Number(s.transientValleyAmount || 0).toFixed(0)}` : "";
      const edge = s.transientEdgeEnabled ? ` / EDGE ${Number(s.transientEdgeAmount || 0).toFixed(0)}` : "";
      const voice = s.voiceMaterialEnabled ? ` / VOICE ${s.voiceDepthMode || "normal"}` : "";
      const hp = s.deviceProfile === "headphone" && s.headphoneCorrectionEnabled ? ` / HP ${s.headphoneModel || "generic"}${s.headphoneCalibrationEnabled?"+CAL":""}` : "";
      const hrtf = s.deviceProfile === "headphone" && s.hrtfEnabled ? ` / HRTF ${s.hrtfProfile || "natural"}` : "";
      const orbit = s.orbitKeeperEnabled ? ` / ORBIT L${Number(s.orbitLevel || 0)}` : "";
      const spatial=s.spatialMetricsAvailable?` / SPAT ${s.schedulerTier||"?"}`:""; const refl=s.reflectionCharacterEnabled?` / REFL ${Number(s.reflectionCharacterAmount||0).toFixed(0)}`:""; const sessions=Number(s.sessionCount||0)>1?` / TABS ${s.sessionCount}`:"";
      const device = s.deviceProfile && s.deviceProfile !== "stereo" ? ` / OUT ${s.deviceProfile}` : "";
      const multi = s.multiSpeakerEnabled ? ` / VMS ${Number(s.multiSpeakerAmount || 0).toFixed(0)}` : "";
      statusEl.textContent = `DSP ON / ${rate}${hi}${nr}${dap}${selfDap}${perspective}${dm}${room}${scene}${spark}${impact}${seam}${valley}${edge}${voice}${hp}${hrtf}${orbit}${spatial}${refl}${sessions}${device}${multi}${al}${lim}${trim}${input}${autoMix}`;
      const deckState=document.getElementById("deckState"); if(deckState) deckState.textContent=`A: ${s.deckAActive?"ON":"--"} / B: ${s.deckBActive?"ON":"--"}`;
    }
  } catch {
    statusEl.textContent = "状態を取得できません";
  }
}

el.enabled.addEventListener("change", () => { if (initialized) void setEnabled(el.enabled.checked); });

el.preset.addEventListener("change", () => {
  if (!initialized) return;
  const name = el.preset.value;
  void enqueueUiAction(async () => {
    // Any pending manual action happened before this explicit preset selection and must be committed first.
    // Range `change` normally flushes it already; this branch handles keyboard/edge cases.
    for (const key of [...pendingTimers.keys()]) {
      const timer = pendingTimers.get(key); if (timer) clearTimeout(timer); pendingTimers.delete(key);
      const value = uiState[key];
      const r = await send("APPLY_PATCH", { patch:{ [key]:value } });
      if (!r?.ok) throw new Error(r?.error || `failed to flush ${key}`);
    }
    const result = await send("APPLY_PRESET", { name });
    if (!result?.ok) {
      statusEl.textContent = result?.error || "プリセット適用に失敗";
      const canonical = await send("GET_SETTINGS");
      if (canonical?.ok) render(canonical.settings);
      return;
    }
    render(result.settings);
    await refreshStatus();
  }).catch((error) => { statusEl.textContent = error?.message || String(error); });
});

for (const key of ids) {
  if (key === "enabled" || key === "preset") continue;
  if (RANGE_KEYS.has(key)) {
    el[key].addEventListener("input", () => {
      if (!initialized) return;
      updateLocalField(key);
      scheduleFieldPatch(key);
    });
    el[key].addEventListener("change", () => {
      if (!initialized) return;
      updateLocalField(key);
      void flushField(key);
    });
  } else {
    el[key].addEventListener("change", () => {
      if (!initialized) return;
      updateLocalField(key);
      void flushField(key);
    });
  }
}

for (const [id,profile] of [["autoQuiet","quiet"],["autoReference","reference"],["autoDj","dj"]]) {
  const b=document.getElementById(id); if(!b) continue; b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ b.disabled=true; try { const r=await send("APPLY_PATCH",{patch:{autoLevelEnabled:true,autoLevelProfile:profile}}); if(r?.ok&&r.settings)render(r.settings); else statusEl.textContent=r?.error||"Auto Level failed"; await refreshStatus(); } finally { b.disabled=false; } }); });
}
const autoOff=document.getElementById("autoOff"); if(autoOff) autoOff.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ const r=await send("APPLY_PATCH",{patch:{autoLevelEnabled:false}}); if(r?.ok&&r.settings)render(r.settings); await refreshStatus(); }); });

for (const [id,type,extra] of [["armDeckA","ARM_DECK",{deck:"A"}],["armDeckB","ARM_DECK",{deck:"B"}],["stopDeckA","STOP_DECK",{deck:"A"}],["stopDeckB","STOP_DECK",{deck:"B"}],["startExternal","START_EXTERNAL",{}]]) {
  const b=document.getElementById(id); if(!b) continue;
  b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ flushAllPendingBestEffort(); b.disabled=true; try { const r=await send(type,extra); if(!r?.ok) statusEl.textContent=r?.error||`${type} failed`; if(r?.settings) render(r.settings); await refreshStatus(); } finally { b.disabled=false; } }); });
}

for (const [id,direction] of [["autoMixAB","A_TO_B"],["autoMixBA","B_TO_A"]]) {
  const b=document.getElementById(id); if(!b) continue;
  b.addEventListener("click",()=>{ void enqueueUiAction(async()=>{ await flushField("djAutoMixSeconds"); b.disabled=true; try { const r=await send("AUTO_MIX",{direction}); if(!r?.ok) statusEl.textContent=r?.error||"AUTO MIX failed"; if(r?.settings) render(r.settings); await refreshStatus(); } finally { b.disabled=false; } }); });
}


async function chooseHeadphoneOutput(){
  if(!navigator?.mediaDevices)throw new Error("MediaDevices API unavailable");
  let d=null;
  if(typeof navigator.mediaDevices.selectAudioOutput==="function")d=await navigator.mediaDevices.selectAudioOutput();
  else{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==="audiooutput"&&x.label);
    if(devices.length===1)d=devices[0]; else throw new Error("出力選択APIが使えません。Chromeの対応環境で実行してください。");
  }
  const match=HeadphoneProfiles?.matchOutputLabel?.(d.label)||{profileId:"generic-neutral",confidence:0,reason:"matcher-unavailable"};
  const patch={deviceProfile:"headphone",headphoneCorrectionEnabled:true,headphoneModel:match.profileId,headphoneOutputDeviceId:d.deviceId||"",headphoneOutputLabel:d.label||"",headphoneCalibrationMode:"profile-only"};
  const r=await send("APPLY_PATCH",{patch}); if(!r?.ok)throw new Error(r?.error||"output apply failed"); if(r.settings)render(r.settings);
  const st=document.getElementById("headphoneAutoState");if(st)st.textContent=`Output: ${d.label||"unnamed"} / model:${match.profileId} / confidence:${Number(match.confidence||0).toFixed(2)} / ${match.reason}`;
  await refreshStatus(); return{device:d,match};
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function createCalibrationContext(deviceId=""){
  const ctx=new AudioContext({latencyHint:"interactive"});
  if(deviceId&&typeof ctx.setSinkId==="function")await ctx.setSinkId(deviceId);
  return ctx;
}
async function playTestSignal(){
  let sink=uiState.headphoneOutputDeviceId||""; if(!sink){const x=await chooseHeadphoneOutput();sink=x.device.deviceId||"";}
  const ctx=await createCalibrationContext(sink); const master=ctx.createGain();master.gain.value=0.018;master.connect(ctx.destination);
  try{for(const f of (AdaptiveV29?.CALIBRATION_FREQUENCIES||[80,160,315,630,1250,2500,5000,10000])){const o=ctx.createOscillator();const g=ctx.createGain();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(1,ctx.currentTime+.02);g.gain.setValueAtTime(1,ctx.currentTime+.12);g.gain.linearRampToValueAtTime(0,ctx.currentTime+.18);o.connect(g);g.connect(master);o.start();o.stop(ctx.currentTime+.20);await sleep(230);}}
  finally{await ctx.close();}
}
async function measureRms(analyser,ms){
  const buf=new Float32Array(analyser.fftSize);const vals=[];const end=performance.now()+ms;
  while(performance.now()<end){analyser.getFloatTimeDomainData(buf);let e=0;for(const x of buf)e+=x*x;vals.push(Math.sqrt(e/buf.length+1e-15));await sleep(30);}
  vals.sort((a,b)=>a-b);return vals.length?vals[Math.floor(vals.length/2)]:0;
}
async function runMeasurementCalibration(){
  if(!AdaptiveV29)throw new Error("calibration engine unavailable");
  let sink=uiState.headphoneOutputDeviceId||"";if(!sink){const x=await chooseHeadphoneOutput();sink=x.device.deviceId||"";}
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
  const ctx=await createCalibrationContext(sink);const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=2048;src.connect(an);
  const master=ctx.createGain();master.gain.value=0.014;master.connect(ctx.destination);
  const stateEl=document.getElementById("headphoneAutoState");
  try{
    if(stateEl)stateEl.textContent="Calibration: measuring noise floor...";const noise=Math.max(1e-12,await measureRms(an,700));const noiseDb=20*Math.log10(noise);
    const measured=[];for(const f of AdaptiveV29.CALIBRATION_FREQUENCIES){if(stateEl)stateEl.textContent=`Calibration: ${f} Hz`;const o=ctx.createOscillator();const g=ctx.createGain();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(1,ctx.currentTime+.03);o.connect(g);g.connect(master);o.start();await sleep(260);const v=await measureRms(an,520);measured.push(20*Math.log10(Math.max(v,1e-12)));g.gain.linearRampToValueAtTime(0,ctx.currentTime+.04);await sleep(90);o.stop();}
    const cal=AdaptiveV29.deriveCalibrationGains(measured,noiseDb);if(!cal.ok)throw new Error(`測定を採用できません: ${cal.reason}. 測定マイク/カプラの位置とSNRを確認してください。`);
    const patch={deviceProfile:"headphone",headphoneCalibrationEnabled:true,headphoneCalibrationStrength:100,headphoneCalibrationGainsDb:cal.gainsDb,headphoneCalibrationMode:"measurement"};const r=await send("APPLY_PATCH",{patch});if(!r?.ok)throw new Error(r?.error||"calibration apply failed");if(r.settings)render(r.settings);
    if(stateEl)stateEl.textContent=`Calibration applied / confidence ${Number(cal.confidence).toFixed(2)} / gains ${cal.gainsDb.map(x=>Number(x).toFixed(1)).join(", ")} dB`;await refreshStatus();
  }finally{for(const t of stream.getTracks())t.stop();await ctx.close();}
}

async function refreshTabSessions(){
  const box=document.getElementById("multiTabList"),label=document.getElementById("cpuSchedulerState");if(!box)return;
  const r=await send("LIST_YOUTUBE_TABS");if(!r?.ok){box.textContent=r?.error||"tab list failed";return;}
  if(label)label.textContent=`CPU ${r.cpuProfile?.logicalProcessors||"?"} logical / ${r.cpuProfile?.name||"?"} / max ${r.cpuProfile?.maxSessions||1}`;
  box.textContent="";
  for(const t of r.tabs||[]){const row=document.createElement("label");row.className="check";const cb=document.createElement("input");cb.type="checkbox";cb.checked=Boolean(t.active);const title=document.createElement("span");title.textContent=`${t.title}`;cb.addEventListener("change",()=>{void enqueueUiAction(async()=>{cb.disabled=true;try{const x=await send("SET_TAB_SESSION",{tabId:t.id,enabled:cb.checked});if(!x?.ok){cb.checked=!cb.checked;statusEl.textContent=x?.error||"session failed";}await refreshStatus();await refreshTabSessions();}finally{cb.disabled=false;}});});row.append(cb,title);box.appendChild(row);}
  if(!(r.tabs||[]).length)box.textContent="YouTubeタブなし";
}
const refreshTabs=document.getElementById("refreshTabs");if(refreshTabs)refreshTabs.addEventListener("click",()=>void refreshTabSessions());


const autoHp=document.getElementById("autoDetectHeadphone");if(autoHp)autoHp.addEventListener("click",()=>void enqueueUiAction(async()=>{autoHp.disabled=true;try{await chooseHeadphoneOutput();}catch(e){statusEl.textContent=e?.message||String(e);}finally{autoHp.disabled=false;}}));
const hpTest=document.getElementById("headphoneTestTone");if(hpTest)hpTest.addEventListener("click",()=>void enqueueUiAction(async()=>{hpTest.disabled=true;try{await playTestSignal();}catch(e){statusEl.textContent=e?.message||String(e);}finally{hpTest.disabled=false;}}));
const hpCal=document.getElementById("headphoneCalibrate");if(hpCal)hpCal.addEventListener("click",()=>void enqueueUiAction(async()=>{hpCal.disabled=true;try{await runMeasurementCalibration();}catch(e){statusEl.textContent=e?.message||String(e);}finally{hpCal.disabled=false;}}));
const hpReset=document.getElementById("headphoneCalibrationReset");if(hpReset)hpReset.addEventListener("click",()=>void enqueueUiAction(async()=>{const r=await send("APPLY_PATCH",{patch:{headphoneCalibrationEnabled:false,headphoneCalibrationGainsDb:[0,0,0,0,0,0,0,0],headphoneCalibrationMode:"profile-only"}});if(r?.settings)render(r.settings);await refreshStatus();}));

window.addEventListener("pagehide", () => { flushAllPendingBestEffort(); if (statusTimer) clearInterval(statusTimer); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAllPendingBestEffort(); });

(async () => {
  const result = await send("GET_SETTINGS");
  render(result?.ok ? result.settings : DEFAULTS);
  initialized = true;
  await refreshStatus();
  await refreshTabSessions();
  statusTimer = setInterval(() => { if (document.visibilityState !== "hidden") void refreshStatus(); }, 500);
})().catch((error) => {
  render(DEFAULTS);
  initialized = true;
  statusEl.textContent = error?.message || "初期化に失敗";
});

const openV3Guide=document.getElementById("openV3Guide");
if(openV3Guide)openV3Guide.addEventListener("click",()=>{
  chrome.tabs.create({url:chrome.runtime.getURL("v3-guide.html")});
});
