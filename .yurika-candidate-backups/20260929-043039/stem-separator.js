"use strict";

(() => {
  const contexts = new WeakSet();
  const STEM_NAMES = Object.freeze(["bass","drums","voice","effects","ambient"]);

  async function prepare(ctx) {
    if (!ctx?.audioWorklet) throw new Error("AudioWorklet unavailable");
    if (!contexts.has(ctx)) {
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("stem-separator-worklet.js"));
      contexts.add(ctx);
    }
  }

  async function createStage(ctx, input, channels = 2, settings = {}) {
    const bypass = ctx.createGain();
    const stage = {
      available:false, backend:"bypass", error:null, enabled:Boolean(settings.stemSeparationEnabled),
      algorithmicLatencyFrames:0, analysisKind:"deterministic-low-latency-soft-separation",
      semanticSeparationGuaranteed:false, ratios:{bass:0,drums:0,voice:0,effects:1,ambient:0},
      rms:{bass:0,drums:0,voice:0,effects:0,ambient:0}, reconstructionError:0,
      node:null, gains:{}, sum:null
    };
    try {
      await prepare(ctx);
      const count = Math.max(1, Math.min(2, Number(channels) || 2));
      const node = new AudioWorkletNode(ctx, "yurika-five-stem-separator", {
        numberOfInputs:1, numberOfOutputs:5, channelCount:count,
        outputChannelCount:[count,count,count,count,count], channelCountMode:"explicit", channelInterpretation:"speakers"
      });
      const sum = ctx.createGain();
      STEM_NAMES.forEach((name, index) => {
        const gain = ctx.createGain(); gain.gain.value = 1;
        node.connect(gain, index, 0); gain.connect(sum); stage.gains[name] = gain;
      });
      node.port.onmessage = (event) => {
        const d = event?.data || {};
        if (d.type !== "stem-runtime") return;
        stage.enabled = d.enabled !== false;
        stage.ratios = d.ratios || stage.ratios;
        stage.rms = d.rms || stage.rms;
        stage.reconstructionError = Number(d.reconstructionError || 0);
        stage.algorithmicLatencyFrames = Number(d.algorithmicLatencyFrames || 0);
        stage.analysisKind = d.analysisKind || stage.analysisKind;
        stage.semanticSeparationGuaranteed = Boolean(d.semanticSeparationGuaranteed);
      };
      input.connect(node);
      stage.node = node; stage.sum = sum; stage.available = true; stage.backend = "audio-worklet-5stem";
      apply(stage, settings);
      return { output:sum, stage };
    } catch (error) {
      stage.error = String(error?.message || error);
      input.connect(bypass);
      return { output:bypass, stage };
    }
  }

  function apply(stage, settings = {}) {
    if (!stage) return;
    stage.enabled = settings.stemSeparationEnabled !== false;
    stage.node?.port?.postMessage({type:"config", enabled:stage.enabled});
  }

  function snapshot(stage) {
    if (!stage) return null;
    return {
      available:Boolean(stage.available), enabled:Boolean(stage.enabled), backend:stage.backend || "bypass", error:stage.error || null,
      algorithmicLatencyFrames:Number(stage.algorithmicLatencyFrames || 0), algorithmicLatencyMs:0,
      analysisKind:stage.analysisKind, semanticSeparationGuaranteed:Boolean(stage.semanticSeparationGuaranteed),
      ratios:{...stage.ratios}, rms:{...stage.rms}, reconstructionError:Number(stage.reconstructionError || 0)
    };
  }

  globalThis.YurikaStemSeparator = Object.freeze({ STEM_NAMES, createStage, apply, snapshot });
})();
