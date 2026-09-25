"use strict";


function getYurikaSpecializedCapabilities() {
  const C=globalThis.YurikaAudioCore;
  return {
    spatial:Boolean(C?.DEFAULTS && Object.prototype.hasOwnProperty.call(C.DEFAULTS,"spatialEnabled") && globalThis.YurikaSpatialEngine),
    virtualAmp:Boolean(C?.DEFAULTS && Object.prototype.hasOwnProperty.call(C.DEFAULTS,"virtualAmpEnabled") && globalThis.YurikaVirtualAmp),
    sonobus:Boolean(C?.DEFAULTS && Object.prototype.hasOwnProperty.call(C.DEFAULTS,"spatialOutputTarget") && globalThis.YurikaSpatialEngine)
  };
}

function specializedF32ToBase64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) text += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(text);
}

function specializedCapturePromise(node, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} capture timeout`)), timeoutMs);
    node.port.onmessage = (event) => {
      if (event.data?.type === "error") {
        clearTimeout(timer);
        reject(new Error(`${label}: ${event.data.message}`));
      } else if (event.data?.type === "done") {
        clearTimeout(timer);
        resolve(event.data);
      }
    };
  });
}

function transparentBaseSettings() {
  const C = globalThis.YurikaAudioCore;
  const n = buildQualitySettings("neutral");
  return {
    ...n,
    enabled:true,
    sceneEnabled:false,
    sparkEnabled:false,
    impactEnabled:false,
    seamNaturalizerEnabled:false,
    transientValleyEnabled:false,
    transientEdgeEnabled:false,
    orbitKeeperEnabled:false,
    voiceMaterialEnabled:false,
    reflectionCharacterEnabled:false,
    perspectiveEnabled:false,
    multiSpeakerEnabled:false,
    dacMatrixMode:"off",
    roomEnabled:false,
    integrityEnabled:false,
    autoLevelEnabled:false,
    dapMode:"off",
    dapStrength:0,
    selfDapEnabled:false,
    adaptiveSafetyEnabled:false,
    avSyncEnabled:false,
    cartridgeEnabled:false,
    djEnabled:false,
    compressor:false,
    noiseReduction:0,
    spectralFill:0,
    detail:0,
    width:0,
    reality:0,
    outputDb:0,
    lowCutHz:5,
    bassDb:0,
    warmthDb:0,
    clarityDb:0,
    airDb:0,
    headphoneCorrectionEnabled:false,
    headphoneCalibrationEnabled:false,
    hiResMode:false
  };
}

function specializedSettings(kind) {
  const C = globalThis.YurikaAudioCore;
  const base = transparentBaseSettings();
  if (kind === "spatial") {
    return C.sanitizeSettings({
      ...base,
      preset:"music",
      spatialEnabled:true,
      spatialMode:"natural",
      spatialDeviceProfile:"generic-headphone",
      spatialOutputTarget:"local",
      deviceProfile:"headphone",
      hrtfEnabled:true,
      hrtfProfile:"natural",
      hrtfAmount:42,
      virtualAmpEnabled:false
    });
  }
  if (kind === "sonobus") {
    return C.sanitizeSettings({
      ...base,
      preset:"flat",
      spatialEnabled:true,
      spatialMode:"natural",
      spatialDeviceProfile:"auto",
      spatialOutputTarget:"sonobus-mobile-headphones",
      deviceProfile:"stereo",
      hrtfEnabled:false,
      hrtfAmount:0,
      virtualAmpEnabled:false
    });
  }
  if (kind === "amp") {
    return C.sanitizeSettings({
      ...base,
      preset:"clean",
      spatialEnabled:false,
      spatialMode:"natural",
      spatialDeviceProfile:"generic-stereo-speaker",
      spatialOutputTarget:"sonobus-mobile-speaker",
      deviceProfile:"stereo",
      hrtfEnabled:false,
      hrtfAmount:0,
      virtualAmpEnabled:true
    });
  }
  throw new Error(`unknown specialized test kind: ${kind}`);
}

async function startSpecialized(settings, tabId) {
  const boot = new AudioContext({ sampleRate:48000 });
  await boot.resume();
  const dummyDest = boot.createMediaStreamDestination();
  const zero = boot.createGain(); zero.gain.value = 0;
  const osc = boot.createOscillator(); osc.frequency.value = 440;
  osc.connect(zero); zero.connect(dummyDest); osc.start();
  const st = await globalThis.__YURIKA_TEST_API__.start({
    tabId, streamId:`specialized-${tabId}`, settings, revision:1,
    mediaStream:dummyDest.stream, inputMode:"tab"
  });
  if (!st?.ok) throw new Error(st?.error || "specialized DSP start failed");
  globalThis.__YURIKA_TEST_API__.applySettings(settings, { initial:false, revision:2, replace:true });
  await sleep(1700);
  return { boot, osc, state:globalThis.__YURIKA_TEST_API__.getState() };
}

async function stopSpecialized(session) {
  try { await globalThis.__YURIKA_TEST_API__.stop(); }
  finally {
    try { session?.osc?.stop(); } catch {}
    try { await session?.boot?.close(); } catch {}
  }
}

async function captureNodesForStimulus(state, inputUrl, nodesByName) {
  const ctx = state.context;
  await ctx.audioWorklet.addModule(chrome.runtime.getURL("tests/audio_quality/capture-worklet.js"));
  const captures = {};
  const sinks = [];
  for (const [name, sourceNode] of Object.entries(nodesByName)) {
    if (!sourceNode || typeof sourceNode.connect !== "function") throw new Error(`capture node unavailable: ${name}`);
    const cap = new AudioWorkletNode(ctx, "yurika-quality-capture", { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2] });
    const sink = ctx.createGain(); sink.gain.value = 0;
    sourceNode.connect(cap); cap.connect(sink); sink.connect(ctx.destination);
    captures[name] = { cap, sourceNode };
    sinks.push(sink);
  }

  const ab = await (await fetch(inputUrl)).arrayBuffer();
  const buf = await ctx.decodeAudioData(ab.slice(0));
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(state.nodes.inputBus);
  const captureStart = ctx.currentTime + 0.25;
  const tail = 0.75;
  const frames = Math.ceil((buf.duration + tail) * ctx.sampleRate);
  const timeoutMs = Math.ceil((buf.duration + tail + 10) * 1000);
  const done = {};
  for (const [name, entry] of Object.entries(captures)) {
    done[name] = specializedCapturePromise(entry.cap, timeoutMs, name);
    entry.cap.port.postMessage({ type:"start", frames, startAt:captureStart });
  }
  src.start(captureStart);
  const results = {};
  for (const name of Object.keys(captures)) results[name] = await done[name];
  for (const entry of Object.values(captures)) {
    try { entry.sourceNode.disconnect(entry.cap); entry.cap.disconnect(); } catch {}
  }
  for (const sink of sinks) try { sink.disconnect(); } catch {}
  return { sampleRate:ctx.sampleRate, results };
}

function encodeCaptureResult(capture) {
  return {
    left:specializedF32ToBase64(capture.left),
    right:specializedF32ToBase64(capture.right)
  };
}

async function runSpatialLocalizationTest(inputUrl) {
  const settings = specializedSettings("spatial");
  let session;
  try {
    session = await startSpecialized(settings, 1991);
    const state = session.state;
    const nodes = state.nodes;
    const captured = await captureNodesForStimulus(state, inputUrl, {
      preHrtf:nodes.integrity?.sum,
      preSpatial:nodes.transientValley,
      postSpatial:nodes.spatial3d?.output
    });
    const status = globalThis.__YURIKA_TEST_API__.status();
    const result = {
      sampleRate:captured.sampleRate,
      status,
      preHrtf:encodeCaptureResult(captured.results.preHrtf),
      preSpatial:encodeCaptureResult(captured.results.preSpatial),
      postSpatial:encodeCaptureResult(captured.results.postSpatial)
    };
    globalThis.__SPECIALIZED_SPATIAL_RESULT__ = result;
    return { sampleRate:result.sampleRate, status, taps:["preHrtf","preSpatial","postSpatial"] };
  } finally {
    await stopSpecialized(session);
  }
}

async function runVirtualAmpBench(inputUrl) {
  const settings = specializedSettings("amp");
  let session;
  try {
    session = await startSpecialized(settings, 1992);
    const state = session.state;
    const nodes = state.nodes;
    const captured = await captureNodesForStimulus(state, inputUrl, {
      preAmp:nodes.adaptiveTrim,
      postAmp:nodes.virtualAmp?.output,
      final:nodes.avSync?.sum
    });
    const status = globalThis.__YURIKA_TEST_API__.status();
    const result = {
      sampleRate:captured.sampleRate,
      status,
      preAmp:encodeCaptureResult(captured.results.preAmp),
      postAmp:encodeCaptureResult(captured.results.postAmp),
      final:encodeCaptureResult(captured.results.final)
    };
    globalThis.__SPECIALIZED_AMP_RESULT__ = result;
    return { sampleRate:result.sampleRate, status, taps:["preAmp","postAmp","final"] };
  } finally {
    await stopSpecialized(session);
  }
}


async function runSonoBusDiagnosticTest(inputUrl) {
  const settings = specializedSettings("sonobus");
  let session;
  try {
    session = await startSpecialized(settings, 1993);
    const state = session.state;
    const nodes = state.nodes;
    const captured = await captureNodesForStimulus(state, inputUrl, {
      preHrtf:nodes.integrity?.sum,
      postHrtf:nodes.hrtf?.air,
      postSpatial:nodes.spatial3d?.output,
      final:nodes.avSync?.sum
    });
    const status = globalThis.__YURIKA_TEST_API__.status();
    const result = {
      sampleRate:captured.sampleRate,
      status,
      preHrtf:encodeCaptureResult(captured.results.preHrtf),
      postHrtf:encodeCaptureResult(captured.results.postHrtf),
      postSpatial:encodeCaptureResult(captured.results.postSpatial),
      final:encodeCaptureResult(captured.results.final)
    };
    globalThis.__SPECIALIZED_SONOBUS_RESULT__ = result;
    return { sampleRate:result.sampleRate, status, taps:["preHrtf","postHrtf","postSpatial","final"] };
  } finally {
    await stopSpecialized(session);
  }
}

globalThis.getYurikaSpecializedCapabilities = getYurikaSpecializedCapabilities;
globalThis.runSpatialLocalizationTest = runSpatialLocalizationTest;
globalThis.runVirtualAmpBench = runVirtualAmpBench;
globalThis.runSonoBusDiagnosticTest = runSonoBusDiagnosticTest;
