"use strict";
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function f32ToBase64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let text = ""; const chunk = 0x8000;
  for (let i=0;i<u8.length;i+=chunk) text += String.fromCharCode(...u8.subarray(i,i+chunk));
  return btoa(text);
}
function buildQualitySettings(profile) {
  const C = globalThis.YurikaAudioCore;
  let s = { ...C.DEFAULTS, ...C.PRESETS.flat, enabled:true,
    hiResMode:true, aiHiResEnabled:false, aiHiResAmount:0,
    impactEnabled:false, seamNaturalizerEnabled:false, transientValleyEnabled:false, transientEdgeEnabled:false,
    orbitKeeperEnabled:false, sceneEnabled:false, sparkEnabled:false, voiceMaterialEnabled:false,
    headphoneCorrectionEnabled:false, headphoneCalibrationEnabled:false, hrtfEnabled:false,
    reflectionCharacterEnabled:false, perspectiveEnabled:false, multiSpeakerEnabled:false,
    concertHallEnabled:false, r5RealityEnabled:false, stemSeparationEnabled:false,
    virtualAmpEnabled:false, virtualAmpOpAmpEnabled:false,
    dacMatrixMode:"off", roomEnabled:false, integrityEnabled:false, autoLevelEnabled:false,
    dapMode:"off", dapStrength:0, selfDapEnabled:false, adaptiveSafetyEnabled:false, avSyncEnabled:false,
    cartridgeEnabled:false, djEnabled:false, noiseReduction:0, spectralFill:0, detail:0, width:0, reality:0,
    outputDb:0, compressor:false, lowCutHz:5, bassDb:0, warmthDb:0, clarityDb:0, airDb:0
  };
  if (profile === "neutral96") {}
  else if (profile === "ai40") { s.aiHiResEnabled=true; s.aiHiResAmount=40; }
  else if (profile === "ai80") { s.aiHiResEnabled=true; s.aiHiResAmount=80; }
  else throw new Error(`unknown profile: ${profile}`);
  return C.sanitizeSettings(s);
}
async function runYurikaQualityTest(inputUrl, profile="neutral96") {
  const boot = new AudioContext({ sampleRate:96000 }); await boot.resume();
  const dummyDest=boot.createMediaStreamDestination();
  const zero=boot.createGain(); zero.gain.value=0;
  const osc=boot.createOscillator(); osc.frequency.value=440; osc.connect(zero); zero.connect(dummyDest); osc.start();
  const settings=buildQualitySettings(profile);
  const st0=await globalThis.__YURIKA_TEST_API__.start({tabId:999,streamId:"quality",settings,revision:1,mediaStream:dummyDest.stream,inputMode:"tab"});
  if(!st0?.ok) throw new Error(st0?.error||"DSP start failed");
  globalThis.__YURIKA_TEST_API__.applySettings(settings,{initial:false,revision:2,replace:true});
  await sleep(1700);
  const state=globalThis.__YURIKA_TEST_API__.getState(); const ctx=state.context;
  if (ctx.sampleRate < 88200) throw new Error(`AI-SR bench requires hi-res context; got ${ctx.sampleRate}`);
  await ctx.audioWorklet.addModule(chrome.runtime.getURL("tests/audio_quality/capture-worklet.js"));
  const cap=new AudioWorkletNode(ctx,"yurika-quality-capture",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  const silentSink=ctx.createGain(); silentSink.gain.value=0; cap.connect(silentSink); silentSink.connect(ctx.destination);
  state.nodes.avSync.sum.connect(cap);
  const ab=await (await fetch(inputUrl)).arrayBuffer(); const buf=await ctx.decodeAudioData(ab.slice(0));
  const src=ctx.createBufferSource(); src.buffer=buf; src.connect(state.nodes.inputBus);
  const pre=.30, tail=.80; const frames=Math.ceil((pre+buf.duration+tail)*ctx.sampleRate);
  const done=new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error("capture timeout")),Math.ceil((pre+buf.duration+tail+6)*1000)); cap.port.onmessage=(event)=>{if(event.data?.type==="done"){clearTimeout(timer);resolve(event.data);}};});
  cap.port.postMessage({type:"start",frames}); src.start(ctx.currentTime+pre); const pcm=await done;
  const status=globalThis.__YURIKA_TEST_API__.status();
  const result={sampleRate:ctx.sampleRate,profile,status,left:f32ToBase64(pcm.left),right:f32ToBase64(pcm.right)};
  await globalThis.__YURIKA_TEST_API__.stop(); try{osc.stop();}catch{} try{await boot.close();}catch{}
  globalThis.__QUALITY_RESULT__=result;
  return {sampleRate:result.sampleRate,profile,frames:pcm.left.length,status};
}
globalThis.runYurikaQualityTest=runYurikaQualityTest;
