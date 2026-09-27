"use strict";

class YurikaFiveStemSeparatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.alphaBass = Math.exp(-2 * Math.PI * 180 / sampleRate);
    this.alphaVoiceLow = Math.exp(-2 * Math.PI * 160 / sampleRate);
    this.alphaVoiceHigh = Math.exp(-2 * Math.PI * 4600 / sampleRate);
    this.bassL = 0; this.bassR = 0;
    this.voiceLow = 0; this.voiceHigh = 0;
    this.fastEnv = 0; this.slowEnv = 0;
    this.reportBlocks = 0;
    this.reportEveryBlocks = Math.max(8, Math.round(sampleRate / 128 / 12));
    this.energy = new Float64Array(5);
    this.totalEnergy = 0;
    this.reconstructionError = 0;
    this.framesAccum = 0;
    this.port.onmessage = (event) => {
      const d = event?.data || {};
      if (d.type === "config") this.enabled = d.enabled !== false;
      if (Number.isFinite(Number(d.reportEveryBlocks))) this.reportEveryBlocks = Math.max(8, Math.min(256, Number(d.reportEveryBlocks)|0));
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const inL = input[0];
    const inR = input[1] || input[0];
    const frames = outputs[0]?.[0]?.length || 128;
    for (let i = 0; i < frames; i++) {
      const l = inL?.[i] || 0;
      const r = inR?.[i] ?? l;

      let bassL = 0, bassR = 0, drumsL = 0, drumsR = 0, voiceL = 0, voiceR = 0, effectsL = 0, effectsR = 0, ambientL = 0, ambientR = 0;
      if (!this.enabled) {
        effectsL = l; effectsR = r;
      } else {
        this.bassL = this.alphaBass * this.bassL + (1 - this.alphaBass) * l;
        this.bassR = this.alphaBass * this.bassR + (1 - this.alphaBass) * r;
        bassL = this.bassL; bassR = this.bassR;

        const rem1L = l - bassL;
        const rem1R = r - bassR;
        const mid = 0.5 * (rem1L + rem1R);
        const side = 0.5 * (rem1L - rem1R);

        this.voiceLow = this.alphaVoiceLow * this.voiceLow + (1 - this.alphaVoiceLow) * mid;
        this.voiceHigh = this.alphaVoiceHigh * this.voiceHigh + (1 - this.alphaVoiceHigh) * mid;
        const voiceBand = this.voiceHigh - this.voiceLow;

        const absMid = Math.abs(mid), absSide = Math.abs(side);
        const centerDominance = absMid / (absMid + absSide + 1e-9);
        const absWide = 0.5 * (Math.abs(rem1L) + Math.abs(rem1R));
        this.fastEnv += (absWide - this.fastEnv) * 0.18;
        this.slowEnv += (absWide - this.slowEnv) * 0.012;
        const transient = Math.max(0, Math.min(1, (this.fastEnv - this.slowEnv) / (this.slowEnv + 0.008) * 1.45));

        const voiceWeight = Math.max(0, Math.min(0.92, centerDominance * (1 - 0.72 * transient)));
        const voiceMono = voiceBand * voiceWeight;
        voiceL = voiceMono; voiceR = voiceMono;

        const rem2L = rem1L - voiceL;
        const rem2R = rem1R - voiceR;
        const drumWeight = Math.max(0, Math.min(0.88, transient * (0.62 + 0.38 * (1 - centerDominance))));
        drumsL = rem2L * drumWeight;
        drumsR = rem2R * drumWeight;

        const rem3L = rem2L - drumsL;
        const rem3R = rem2R - drumsR;
        const rem3Side = 0.5 * (rem3L - rem3R);
        const rem3Mid = 0.5 * (rem3L + rem3R);
        const ambienceWeight = Math.max(0, Math.min(0.82, (Math.abs(rem3Side) / (Math.abs(rem3Side) + Math.abs(rem3Mid) + 1e-9)) * (1 - 0.55 * transient)));
        const ambienceSide = rem3Side * ambienceWeight;
        ambientL = ambienceSide;
        ambientR = -ambienceSide;
        effectsL = rem3L - ambientL;
        effectsR = rem3R - ambientR;
      }

      const stems = [
        [bassL, bassR], [drumsL, drumsR], [voiceL, voiceR], [effectsL, effectsR], [ambientL, ambientR]
      ];
      for (let s = 0; s < 5; s++) {
        const outL = outputs[s]?.[0], outR = outputs[s]?.[1];
        if (outL) outL[i] = stems[s][0];
        if (outR) outR[i] = stems[s][1];
        this.energy[s] += stems[s][0] * stems[s][0] + stems[s][1] * stems[s][1];
      }
      const sumL = bassL + drumsL + voiceL + effectsL + ambientL;
      const sumR = bassR + drumsR + voiceR + effectsR + ambientR;
      this.reconstructionError = Math.max(this.reconstructionError, Math.abs(sumL - l), Math.abs(sumR - r));
      this.totalEnergy += l * l + r * r;
      this.framesAccum++;
    }

    this.reportBlocks++;
    if (this.reportBlocks >= this.reportEveryBlocks) {
      this.reportBlocks = 0;
      const totalStem = Math.max(1e-18, this.energy.reduce((a,b)=>a+b,0));
      const names = ["bass","drums","voice","effects","ambient"];
      const ratios = {};
      const rms = {};
      for (let s=0;s<5;s++) {
        ratios[names[s]] = this.energy[s] / totalStem;
        rms[names[s]] = Math.sqrt(this.energy[s] / Math.max(1, this.framesAccum * 2));
      }
      this.port.postMessage({
        type:"stem-runtime", enabled:this.enabled, ratios, rms,
        reconstructionError:this.reconstructionError,
        algorithmicLatencyFrames:0,
        analysisKind:"deterministic-low-latency-soft-separation",
        semanticSeparationGuaranteed:false
      });
      this.energy.fill(0); this.totalEnergy = 0; this.reconstructionError = 0; this.framesAccum = 0;
    }
    return true;
  }
}

registerProcessor("yurika-five-stem-separator", YurikaFiveStemSeparatorProcessor);
