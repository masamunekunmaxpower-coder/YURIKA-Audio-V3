"use strict";

function getYurikaQualityProfiles() {
  const C = globalThis.YurikaAudioCore;
  const profiles = ["neutral", "clean", "music", "selfdap"];
  if (C?.DEFAULTS && Object.prototype.hasOwnProperty.call(C.DEFAULTS, "spatialEnabled") && globalThis.YurikaSpatialEngine) {
    profiles.push("spatial-natural");
    if (Object.prototype.hasOwnProperty.call(C.DEFAULTS, "spatialOutputTarget")) profiles.push("sonobus-mobile");
  }
  return profiles;
}

globalThis.getYurikaQualityProfiles = getYurikaQualityProfiles;

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
      preset: "flat",
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
      lowCutHz: 5,
      bassDb: 0,
      warmthDb: 0,
      clarityDb: 0,
      airDb: 0
    };
  } else if (profile === "clean") {
    s = { ...s, ...C.PRESETS.clean, preset: "clean" };
  } else if (profile === "music") {
    s = { ...s, ...C.PRESETS.music, preset: "music" };
  } else if (profile === "selfdap") {
    s = { ...s, ...C.PRESETS.selfdap, preset: "selfdap" };
  } else if (profile === "spatial-natural") {
    s = {
      ...s, ...C.PRESETS.music, preset:"music",
      spatialEnabled:true, spatialMode:"natural", spatialDeviceProfile:"generic-headphone",
      spatialOutputTarget:"local", deviceProfile:"headphone",
      hrtfEnabled:true, hrtfProfile:"natural", hrtfAmount:42
    };
  } else if (profile === "sonobus-mobile") {
    s = {
      ...s, ...C.PRESETS.music, preset:"music",
      spatialEnabled:true, spatialMode:"natural", spatialDeviceProfile:"auto",
      spatialOutputTarget:"sonobus-mobile-headphones",
      deviceProfile:"stereo", hrtfEnabled:false, hrtfAmount:0,
      headphoneCorrectionEnabled:false
    };
  } else {
    throw new Error(`unknown profile: ${profile}`);
  }

  return C.sanitizeSettings(s);
}

function capturePromise(node, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} capture timeout`)),
      timeoutMs
    );

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

async function runYurikaQualityTest(inputUrl, profile = "neutral") {
  // Dummy stream only satisfies the extension's normal input contract.
  // The zero-gain oscillator contributes no measurable program audio.
  const boot = new AudioContext({ sampleRate: 48000 });
  let osc;
  try {
  await boot.resume();

  const dummyDest = boot.createMediaStreamDestination();
  const zero = boot.createGain();
  zero.gain.value = 0;
  osc = boot.createOscillator();
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

  if (!st0?.ok) throw new Error(st0?.error || "DSP start failed");

  // Apply once as a normal runtime update so long initial ramps do not
  // contaminate the measurement.
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

  // Two synchronized passive taps:
  //   referenceCapture = exact signal entering the DSP at the DSP sample rate
  //   outputCapture    = signal leaving the measured DSP graph
  //
  // This eliminates the old 48k -> DSP-rate -> 48k comparison error and
  // removes the synthetic 300 ms pre-roll from the latency measurement.
  const referenceCapture = new AudioWorkletNode(ctx, "yurika-quality-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });
  const outputCapture = new AudioWorkletNode(ctx, "yurika-quality-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  const refSink = ctx.createGain();
  const outSink = ctx.createGain();
  refSink.gain.value = 0;
  outSink.gain.value = 0;

  state.nodes.inputBus.connect(referenceCapture);
  referenceCapture.connect(refSink);
  refSink.connect(ctx.destination);

  state.nodes.avSync.sum.connect(outputCapture);
  outputCapture.connect(outSink);
  outSink.connect(ctx.destination);

  const ab = await (await fetch(inputUrl)).arrayBuffer();
  const buf = await ctx.decodeAudioData(ab.slice(0));

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(state.nodes.inputBus);

  // Both worklets and the source start on the same future AudioContext time.
  // The stimulus itself already contains a 250 ms silence segment, so no
  // artificial pre-roll is necessary.
  const captureStart = ctx.currentTime + 0.25;
  const tail = 0.75;
  const frames = Math.ceil((buf.duration + tail) * ctx.sampleRate);
  const timeoutMs = Math.ceil((buf.duration + tail + 8) * 1000);

  const referenceDone = capturePromise(
    referenceCapture,
    timeoutMs,
    "reference"
  );
  const outputDone = capturePromise(outputCapture, timeoutMs, "output");

  referenceCapture.port.postMessage({
    type: "start",
    frames,
    startAt: captureStart
  });
  outputCapture.port.postMessage({
    type: "start",
    frames,
    startAt: captureStart
  });

  src.start(captureStart);

  const [referencePcm, outputPcm] = await Promise.all([
    referenceDone,
    outputDone
  ]);

  const status = globalThis.__YURIKA_TEST_API__.status();

  const result = {
    sampleRate: ctx.sampleRate,
    profile,
    status,
    referenceLeft: f32ToBase64(referencePcm.left),
    referenceRight: f32ToBase64(referencePcm.right),
    left: f32ToBase64(outputPcm.left),
    right: f32ToBase64(outputPcm.right)
  };

  try {
    state.nodes.inputBus.disconnect(referenceCapture);
    state.nodes.avSync.sum.disconnect(outputCapture);
    referenceCapture.disconnect();
    outputCapture.disconnect();
    refSink.disconnect();
    outSink.disconnect();
  } catch {}

  globalThis.__QUALITY_RESULT__ = result;

  return {
    sampleRate: result.sampleRate,
    profile,
    frames: outputPcm.left.length,
    status,
    referenceCaptured: true
  };
  } finally {
    try { await globalThis.__YURIKA_TEST_API__.stop(); }
    finally {
      try { osc?.stop(); } catch {}
      try { await boot.close(); } catch {}
    }
  }
}

globalThis.runYurikaQualityTest = runYurikaQualityTest;
