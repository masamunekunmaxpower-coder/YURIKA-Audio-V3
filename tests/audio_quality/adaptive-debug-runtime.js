"use strict";

function controlDebugSettings(kind, variant="normal") {
  const C=globalThis.YurikaAudioCore;
  let s=buildQualitySettings(kind === "selfdap" ? "selfdap" : "sonobus-mobile");
  const patch={};
  if (variant === "restoration-off") patch.selfDapRestoration="off";
  if (variant === "adaptive-safety-off") patch.adaptiveSafetyEnabled=false;
  if (variant === "seam-valley-off") { patch.seamNaturalizerEnabled=false; patch.transientValleyEnabled=false; }
  if (variant === "orbit-off") patch.orbitKeeperEnabled=false;
  if (variant === "impact-off") patch.impactEnabled=false;
  if (variant === "integrity-off") patch.integrityEnabled=false;
  if (variant === "virtual-amp-off") patch.virtualAmpEnabled=false;
  if (variant === "all-controls-off") {
    patch.adaptiveSafetyEnabled=false; patch.seamNaturalizerEnabled=false; patch.transientValleyEnabled=false;
    patch.orbitKeeperEnabled=false; patch.impactEnabled=false; patch.virtualAmpEnabled=false;
    if (kind === "selfdap") patch.selfDapRestoration="off";
  }
  return C.sanitizeSettings({...s,...patch});
}

function debugStateSnapshot() {
  const st=globalThis.__YURIKA_TEST_API__.status();
  return {
    wallMs:Date.now(),
    contextTime:Number(globalThis.__YURIKA_TEST_API__.getState()?.context?.currentTime || 0),
    adaptiveTrimDb:st.adaptiveTrimDb,
    adaptiveTrimHoldReason:st.adaptiveTrimHoldReason,
    adaptiveTrimQuietStreak:st.adaptiveTrimQuietStreak,
    adaptiveTrimReleaseCount:st.adaptiveTrimReleaseCount,
    adaptiveTrimLastPressureAtMs:st.adaptiveTrimLastPressureAtMs,
    limiterReductionDb:st.limiterReductionDb,
    safetyPeak:st.safetyPeak,
    seamConfidence:st.seamConfidence,
    seamEvents:st.seamEvents,
    transientValleyDepthDb:st.transientValleyDepthDb,
    transientValleyTriggers:st.transientValleyTriggers,
    orbitLevel:st.orbitLevel,
    orbitActions:st.orbitActions,
    selfDapRestorationActive:st.selfDapRestorationActive,
    selfDapRestorationReason:st.selfDapRestorationReason,
    selfDapRestorationScore:st.selfDapRestorationScore,
    selfDapWatchdogTrips:st.selfDapWatchdogTrips,
    virtualAmpBackend:st.virtualAmp?.backend || null,
    virtualAmpEffective:Boolean(st.virtualAmp?.effectiveEnabled)
  };
}

async function captureDebugCase(kind, variant, inputUrl, fullTaps=false, tabId=2100) {
  const settings=controlDebugSettings(kind,variant);
  let session;
  try {
    session=await startSpecialized(settings,tabId);
    const state=session.state, n=state.nodes;
    const nodes={};
    if (kind === "selfdap") {
      if (fullTaps) {
        nodes.preSelfDap=n.voiceMaterial?.sum;
        nodes.postSelfDap=n.selfDap?.outputSum;
        nodes.postWidth=n.widthMatrix?.merger || n.selfDap?.outputSum;
        nodes.postPerspective=n.perspective?.sum;
        nodes.postDacMatrix=n.dacMatrix?.out;
        nodes.postDapCrossfeed=n.dapCrossfeed?.merger || n.dapSum;
        nodes.postRoom=n.room?.out;
        nodes.postIntegrity=n.integrity?.sum;
        nodes.postHrtf=n.hrtf?.air || n.hrtf?.bypass;
        nodes.postHeadphone=(n.headphoneCorrection?.calibrationFilters && n.headphoneCorrection.calibrationFilters.length) ? n.headphoneCorrection.calibrationFilters[n.headphoneCorrection.calibrationFilters.length-1] : n.headphoneCorrection?.calPre;
        nodes.postCompressor=n.compressorSum;
        nodes.postOutput=n.output;
        nodes.postValley=n.transientValley;
        nodes.postSpatial=n.spatial3d?.output || n.transientValley;
        nodes.postAutoLevel=n.autoLevel;
        nodes.postAdaptive=n.adaptiveTrim;
      }
      nodes.final=n.avSync?.sum;
    } else {
      if (fullTaps) {
        nodes.preHrtf=n.integrity?.sum;
        nodes.postHrtf=n.hrtf?.air;
        nodes.postSpatial=n.spatial3d?.output;
        nodes.postAdaptive=n.adaptiveTrim;
      }
      nodes.final=n.avSync?.sum;
    }
    const timeline=[];
    const timer=setInterval(()=>{ try{ timeline.push(debugStateSnapshot()); }catch{} },50);
    let captured;
    try { captured=await captureNodesForStimulus(state,inputUrl,nodes); }
    finally { clearInterval(timer); }
    const taps={};
    for (const [name,cap] of Object.entries(captured.results)) taps[name]=encodeCaptureResult(cap);
    return {kind,variant,sampleRate:captured.sampleRate,status:globalThis.__YURIKA_TEST_API__.status(),timeline,taps};
  } finally { await stopSpecialized(session); }
}

globalThis.captureAdaptiveDebugCase=captureDebugCase;
globalThis.getAdaptiveDebugVariants=()=>({
  selfdap:["normal","restoration-off","adaptive-safety-off","seam-valley-off","orbit-off","impact-off","integrity-off","virtual-amp-off","all-controls-off"],
  sonobus:["normal","adaptive-safety-off","seam-valley-off","orbit-off","impact-off","integrity-off","virtual-amp-off","all-controls-off"]
});
