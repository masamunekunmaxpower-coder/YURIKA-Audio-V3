"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function f32ToBase64(arr) {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    text += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(text);
}

function buildQualitySettings(profile) {
  const C = globalThis.YurikaAudioCore;
  let s = { ...C.DEFAULTS, enabled: true };

  if (profile === "neutral") {
    s = {
      ...s,
      ...C.PRESETS.flat,
      impactEnabled: false,
      seamNaturalizerEnabled: false,
      transientValleyEnabled: false,
      transientEdgeEnabled: false,
      orbitKeeperEnabled: false,
      sceneEnabled: false,
      sparkEnabled: false,
      voiceMaterialEnabled: false,
      headphoneCorrectionEnabled: false,
      headphoneCalibrationEnabled: false,
      hrtfEnabled: false,
      reflectionCharacterEnabled: false,
      perspectiveEnabled: false,
      multiSpeakerEnabled: false,
      dacMatrixMode: "off",
      roomEnabled: false,
      integrityEnabled: false,
      autoLevelEnabled: false,
      dapMode: "off",
      dapStrength: 0,
      selfDapEnabled: false,
      adaptiveSafetyEnabled: false,
      avSyncEnabled: false,
      cartridgeEnabled: false,
      djEnabled: false,
      noiseReduction: 0,
      spectralFill: 0,
      detail: 0,
      width: 0,
      reality: 0,
      outputDb: 0,
      compressor: false,
      lowCutHz: 20,
      bassDb: 0,
      warmthDb: 0,
      clarityDb: 0,
      airDb: 0
    };
  } else if (profile === "clean") {
    s = { ...s, ...C.PRESETS.clean };
  } else if (profile === "music") {
    s = { ...s, ...C.PRESETS.music };
  } else if (profile === "selfdap") {
    s = { ...s, ...C.PRESETS.selfdap };
  } else {
    throw new Error(`unknown profile: ${profile}`);
  }

  return C.sanitizeSettings(s);
}

function capturePromise(cap, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("capture timeout")),
      timeoutMs
    );
    cap.port.onmessage = (event) => {
      if (event.data?.type === "done") {
        clearTimeout(timer);
        resolve(event.data);
      }
    };
  });
}

async function runYurikaQualityTest(inputUrl, profile = "neutral") {
  // Boot context only exists to provide a MediaStream to the real YURIKA graph.
  const boot = new AudioContext({ sampleRate: 48000 });
  await boot.resume();

  const dummyDest = boot.createMediaStreamDestination();
  const zero = boot.createGain();
  zero.gain.value = 0;
  const osc = boot.createOscillator();
  osc.frequency.value = 440;
  osc.connect(zero);
  zero.connect(dummyDest);
  osc.start();

  const settings = buildQualitySettings(profile);

  const st0 = await globalThis.__YURIKA_TEST_API__.start({
    tabId: 999,
    streamId: "quality",
    settings,
    revision: 1,
    mediaStream: dummyDest.stream,
    inputMode: "tab"
  });

  if (!st0?.ok) {
    throw new Error(st0?.error || "DSP start failed");
  }

  // Normal runtime replacement so long startup ramps are settled before capture.
  globalThis.__YURIKA_TEST_API__.applySettings(settings, {
    initial: false,
    revision: 2,
    replace: true
  });

  await sleep(1500);

  const state = globalThis.__YURIKA_TEST_API__.getState();
  const ctx = state.context;

  await ctx.audioWorklet.addModule(
    chrome.runtime.getURL("tests/audio_quality/capture-worklet.js")
  );

  // Capture A: actual YURIKA output.
  const dspCap = new AudioWorkletNode(ctx, "yurika-quality-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  // Capture B: browser-matched bypass reference from the *same decoded source*
  // and the *same AudioContext*. This removes 48k->44.1/96k resampler mismatch
  // from the quality comparison.
  const refCap = new AudioWorkletNode(ctx, "yurika-quality-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  const silentSink = ctx.createGain();
  silentSink.gain.value = 0;
  dspCap.connect(silentSink);
  refCap.connect(silentSink);
  silentSink.connect(ctx.destination);

  state.nodes.avSync.sum.connect(dspCap);

  const ab = await (await fetch(inputUrl)).arrayBuffer();
  const buf = await ctx.decodeAudioData(ab.slice(0));

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // One source fans out into the DSP and the bypass reference capture.
  // Therefore both paths share the exact same decoded/resampled PCM and start time.
  src.connect(state.nodes.inputBus);
  src.connect(refCap);

  const pre = 0.30;
  const tail = 0.80;
  const preFrames = Math.round(pre * ctx.sampleRate);
  const tailFrames = Math.round(tail * ctx.sampleRate);
  const frames = preFrames + buf.length + tailFrames;

  const timeoutMs = Math.ceil((pre + buf.duration + tail + 5) * 1000);
  const dspDone = capturePromise(dspCap, timeoutMs);
  const refDone = capturePromise(refCap, timeoutMs);

  dspCap.port.postMessage({ type: "start", frames });
  refCap.port.postMessage({ type: "start", frames });

  src.start(ctx.currentTime + pre);

  const [dspPcm, refPcm] = await Promise.all([dspDone, refDone]);

  const status = globalThis.__YURIKA_TEST_API__.status();
  const captureMeta = {
    sampleRate: ctx.sampleRate,
    preRollSec: pre,
    preRollFrames: preFrames,
    tailSec: tail,
    tailFrames,
    stimulusFrames: buf.length,
    stimulusDurationSec: buf.duration,
    comparisonReference: "same-context direct bypass"
  };

  const result = {
    sampleRate: ctx.sampleRate,
    profile,
    status,
    captureMeta,
    left: f32ToBase64(dspPcm.left),
    right: f32ToBase64(dspPcm.right),
    refLeft: f32ToBase64(refPcm.left),
    refRight: f32ToBase64(refPcm.right)
  };

  await globalThis.__YURIKA_TEST_API__.stop();

  try {
    osc.stop();
  } catch {}
  try {
    await boot.close();
  } catch {}

  globalThis.__QUALITY_RESULT__ = result;

  return {
    sampleRate: result.sampleRate,
    profile,
    frames: dspPcm.left.length,
    status,
    captureMeta
  };
}

globalThis.runYurikaQualityTest = runYurikaQualityTest;
