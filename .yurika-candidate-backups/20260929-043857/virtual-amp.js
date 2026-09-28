"use strict";

(() => {
  const SPEC = Object.freeze({
    id:"yurika-class-a-reference-v2",
    topology:"Ultra-Clean Class-A + linked op-amp servo / crossover-free software reference electrical model",
    loadOhm:6,
    ratedPowerWPerChannel:8,
    maxPowerWPerChannel:12,
    zeroDbfsReferencePowerWPerChannel:12,
    ratedLevelDbfs:-1.7609125906,
    p1dBReferenceDbfs:-0.75,
    p1dBHeadroomMaxDb:18,
    outputImpedanceOhm:0.020,
    dampingFactor:300,
    snrDbA:122,
    ampOnlyThdnDb:-100,
    crosstalkDbAt1k:-120,
    slewRateVPerUs:25,
    dcOffsetMvMax:0.2,
    responseDeviationDb20Hz20kHz:0.02,
    algorithmicLatencyFrames:0,
    transitionMs:4,
    cubic:0.0000600,
    noise:0.00000080,
    crosstalk:0.00000100,
    opAmpFeedback:0.42,
    opAmpDcServoHz:1.5
  });

  let modulePromise = null;
  const workletContexts = new WeakSet();
  const dbToGain = (db) => Math.pow(10, Number(db || 0) / 20);

  function combineThdnDb(upstreamDb, ampDb = SPEC.ampOnlyThdnDb) {
    const a = Number(upstreamDb), b = Number(ampDb);
    if (!Number.isFinite(a)) return Number.isFinite(b) ? b : null;
    if (!Number.isFinite(b)) return a;
    return 10 * Math.log10(Math.pow(10, a/10) + Math.pow(10, b/10));
  }

  async function prepare(ctx) {
    if (!ctx?.audioWorklet) throw new Error("AudioWorklet unavailable");
    if (!workletContexts.has(ctx)) {
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("virtual-amp-worklet.js"));
      workletContexts.add(ctx);
    }
    if (!modulePromise) {
      modulePromise = (async () => {
        const response = await fetch(chrome.runtime.getURL("virtual-amp-core.wasm"), { cache:"no-store" });
        if (!response.ok) throw new Error(`Virtual Amp WASM HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        return await WebAssembly.compile(bytes);
      })();
    }
    return await modulePromise;
  }

  async function createStage(ctx, input, channels = 2, settings = {}) {
    const fallback = ctx.createGain(); fallback.gain.value = 1;
    const stage = {
      input, output:fallback, node:null, available:false, backend:"bypass", error:null,
      requestedEnabled:false, effectiveEnabled:false, neutralBypass:false, mix:0,
      opAmpEnabled:false, headroomExtensionDb:0, runtime:{}, spec:SPEC
    };
    try {
      const wasmModule = await prepare(ctx);
      const count = Math.max(1, Math.min(2, Number(channels) || 2));
      const node = new AudioWorkletNode(ctx, "yurika-virtual-class-a", {
        numberOfInputs:1, numberOfOutputs:1, channelCount:count,
        outputChannelCount:[count], channelCountMode:"explicit", channelInterpretation:"speakers",
        processorOptions:{ wasmModule }
      });
      stage.node = node; stage.output = node; stage.available = true; stage.backend = "cpp-wasm+opamp";
      node.port.onmessage = (event) => {
        const msg = event?.data || {};
        if (msg.type === "error") { stage.error = String(msg.error || "Virtual Amp runtime error"); stage.backend = "bypass"; stage.effectiveEnabled = false; }
        else if (msg.type === "ready") { stage.error = null; stage.backend = msg.backend || "cpp-wasm+opamp"; }
        else if (msg.type === "runtime") { stage.mix = Number(msg.mix || 0); stage.runtime = {...msg}; }
      };
      input.connect(node);
      apply(stage, settings);
    } catch (error) {
      stage.error = String(error?.message || error);
      stage.backend = "bypass";
      input.connect(fallback);
    }
    return { output:stage.output, stage };
  }

  function apply(stage, settings = {}) {
    if (!stage) return null;
    const requested = Boolean(settings.virtualAmpEnabled);
    const neutralBypass = String(settings.preset || "") === "flat";
    const effective = requested && !neutralBypass && stage.available && Boolean(stage.node);
    const headroomExtensionDb = Math.max(0, Math.min(SPEC.p1dBHeadroomMaxDb, Number(settings.virtualAmpHeadroomDb ?? 12) || 0));
    const preGain = dbToGain(-headroomExtensionDb);
    const postGain = dbToGain(headroomExtensionDb);
    const opAmpEnabled = settings.virtualAmpOpAmpEnabled !== false;
    stage.requestedEnabled = requested;
    stage.neutralBypass = requested && neutralBypass;
    stage.effectiveEnabled = effective;
    stage.opAmpEnabled = opAmpEnabled;
    stage.headroomExtensionDb = headroomExtensionDb;
    if (stage.node?.port) {
      stage.node.port.postMessage({
        type:"config", enabled:effective,
        cubic:SPEC.cubic,
        noise:SPEC.noise * preGain,
        crosstalk:SPEC.crosstalk,
        preGain, postGain, headroomExtensionDb,
        opAmpEnabled, opAmpFeedback:SPEC.opAmpFeedback, opAmpDcServoHz:SPEC.opAmpDcServoHz,
        ratedPowerWPerChannel:SPEC.ratedPowerWPerChannel,
        maxPowerWPerChannel:SPEC.maxPowerWPerChannel,
        p1dBReferenceDbfs:SPEC.p1dBReferenceDbfs
      });
    }
    return snapshot(stage);
  }

  function snapshot(stage) {
    if (!stage) return { requestedEnabled:false, effectiveEnabled:false, available:false, backend:"missing", error:"stage-missing", spec:SPEC };
    const rt = stage.runtime || {};
    return {
      requestedEnabled:Boolean(stage.requestedEnabled),
      effectiveEnabled:Boolean(stage.effectiveEnabled),
      neutralBypass:Boolean(stage.neutralBypass),
      available:Boolean(stage.available), backend:stage.backend || "bypass", error:stage.error || null,
      wetMix:Number(stage.mix || 0),
      opAmpEnabled:Boolean(stage.opAmpEnabled),
      opAmpFeedback:Number(rt.opAmpFeedback ?? SPEC.opAmpFeedback),
      headroomExtensionDb:Number(stage.headroomExtensionDb || 0),
      p1dBEquivalentInputDbfs:Number(rt.p1dBEquivalentInputDbfs ?? (SPEC.p1dBReferenceDbfs + Number(stage.headroomExtensionDb || 0))),
      p1dBMarginDb:Number.isFinite(Number(rt.p1dBMarginDb)) ? Number(rt.p1dBMarginDb) : null,
      inputPeak:Number.isFinite(Number(rt.inputPeak)) ? Number(rt.inputPeak) : null,
      outputPeak:Number.isFinite(Number(rt.outputPeak)) ? Number(rt.outputPeak) : null,
      inputRms:Number.isFinite(Number(rt.inputRms)) ? Number(rt.inputRms) : null,
      outputRms:Number.isFinite(Number(rt.outputRms)) ? Number(rt.outputRms) : null,
      estimatedPowerWPerChannel:Number.isFinite(Number(rt.estimatedPowerWPerChannel)) ? Number(rt.estimatedPowerWPerChannel) : null,
      estimatedPeakPowerWPerChannel:Number.isFinite(Number(rt.estimatedPeakPowerWPerChannel)) ? Number(rt.estimatedPeakPowerWPerChannel) : null,
      runtimeSnrDb:Number.isFinite(Number(rt.runtimeSnrDb)) ? Number(rt.runtimeSnrDb) : null,
      runtimeThdnEstimateDb:Number.isFinite(Number(rt.runtimeThdnEstimateDb)) ? Number(rt.runtimeThdnEstimateDb) : null,
      addedAlgorithmicLatencyFrames:SPEC.algorithmicLatencyFrames,
      addedAlgorithmicLatencyMs:0,
      ampOnlyThdnDb:SPEC.ampOnlyThdnDb,
      snrDbA:SPEC.snrDbA,
      ratedPowerWPerChannel:SPEC.ratedPowerWPerChannel,
      maxPowerWPerChannel:SPEC.maxPowerWPerChannel,
      loadOhm:SPEC.loadOhm,
      outputImpedanceOhm:SPEC.outputImpedanceOhm,
      dampingFactor:SPEC.dampingFactor,
      crosstalkDbAt1k:SPEC.crosstalkDbAt1k,
      slewRateVPerUs:SPEC.slewRateVPerUs,
      dcOffsetMvMax:SPEC.dcOffsetMvMax,
      frequencyResponse:"inherits-yurika-dsp",
      spec:SPEC
    };
  }

  globalThis.YurikaVirtualAmp = Object.freeze({ SPEC, createStage, apply, snapshot, combineThdnDb });
})();
