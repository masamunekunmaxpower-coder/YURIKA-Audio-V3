"use strict";

class YurikaR5RealityResolutionProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.amount = 0.35;
    this.mode = "auto";
    this.prev1 = [0,0];
    this.prev2 = [0,0];
    this.fastEnv = 0;
    this.slowEnv = 0;
    this.featureEnergy = new Float64Array(5);
    this.interactionEnergy = 0;
    this.injectEnergy = 0;
    this.inputEnergy = 0;
    this.confidenceAccum = 0;
    this.framesAccum = 0;
    this.maxInjection = 0;
    this.reportBlocks = 0;
    this.reportEveryBlocks = Math.max(12, Math.round(sampleRate / 128 / 10));
    this.port.onmessage = (event) => {
      const d = event?.data || {};
      if (d.type !== "config") return;
      const nextEnabled = d.enabled === true;
      if (this.enabled && !nextEnabled) this._resetState();
      this.enabled = nextEnabled;
      this.amount = Math.max(0, Math.min(1, Number(d.amount ?? this.amount) || 0));
      this.mode = ["auto","voice","full"].includes(d.mode) ? d.mode : "auto";
      if (Number.isFinite(Number(d.reportEveryBlocks))) this.reportEveryBlocks = Math.max(8, Math.min(256, Number(d.reportEveryBlocks)|0));
    };
  }

  _bounded(v, scale=1) { return Math.tanh(v * scale); }

  _resetState() {
    this.prev1[0]=this.prev1[1]=this.prev2[0]=this.prev2[1]=0;
    this.fastEnv=0; this.slowEnv=0;
    this.featureEnergy.fill(0); this.interactionEnergy=0; this.injectEnergy=0; this.inputEnergy=0;
    this.confidenceAccum=0; this.framesAccum=0; this.maxInjection=0; this.reportBlocks=0;
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const inL = input[0], inR = input[1] || input[0];
    const outL = output[0], outR = output[1] || output[0];
    const frames = outL?.length || outR?.length || 128;
    if (!outL && !outR) return true;

    // R5 is a serial insert. Disabled/zero amount must be a minimal transparent copy.
    if (!this.enabled || this.amount <= 0) {
      for (let i=0;i<frames;i++) {
        const l=inL?.[i]||0, r=inR?.[i]??l;
        if (outL) outL[i]=l;
        if (outR) outR[i]=r;
      }
      return true;
    }

    for (let i=0;i<frames;i++) {
      const l = inL?.[i] || 0;
      const r = inR?.[i] ?? l;
      const mid = 0.5*(l+r), side = 0.5*(l-r);
      const absMid = Math.abs(mid);
      this.fastEnv += (absMid - this.fastEnv) * 0.22;
      this.slowEnv += (absMid - this.slowEnv) * 0.012;
      const norm = this.slowEnv + 0.008;

      // v,w,x,y,z are deliberately time-domain / relational features, not EQ bands.
      // v: temporal velocity, w: curvature, x: short predictor residual,
      // y: micro-envelope deviation, z: stereo micro-coherence / center dominance.
      const p1m = 0.5*(this.prev1[0]+this.prev1[1]);
      const p2m = 0.5*(this.prev2[0]+this.prev2[1]);
      const velocity = (mid - p1m) / norm;
      const curvature = (mid - 2*p1m + p2m) / norm;
      const predictor = 1.72*p1m - 0.74*p2m;
      const predResidual = (mid - predictor) / norm;
      const envMicro = (this.fastEnv - this.slowEnv) / norm;
      const coherence = (absMid - Math.abs(side)) / (absMid + Math.abs(side) + 1e-7);

      const v = this._bounded(velocity, 0.75);
      const w = this._bounded(curvature, 0.52);
      const x = this._bounded(predResidual, 0.68);
      const y = this._bounded(envMicro, 1.25);
      const z = this._bounded(coherence, 1.0);
      const featureSum = Math.max(-1, Math.min(1, (v+w+x+y+z) / 2.75));
      const p5 = featureSum*featureSum*featureSum*featureSum*featureSum;
      const interaction = Math.sqrt(Math.abs(p5));
      const activity = Math.min(1, (Math.abs(v)+Math.abs(w)+Math.abs(x)+Math.abs(y)) * 0.28);
      const voiceBias = Math.max(0, Math.min(1, (z + 1) * 0.5));
      const modeGain = this.mode === "voice" ? (0.20 + 0.80*voiceBias) : this.mode === "full" ? 1 : (0.55 + 0.45*voiceBias);
      const confidence = Math.min(1, interaction * (0.35 + 0.65*activity) * modeGain);

      let injL = 0, injR = 0;
      for (let ch=0; ch<2; ch++) {
        const s = ch===0 ? l : r;
        const pred = 1.72*this.prev1[ch] - 0.74*this.prev2[ch];
        const residual = s - pred;
        // Injection is bounded to a small fraction of local level. The fifth-order term
        // gates the residual; it is never used as a raw audio transfer curve.
        const boundedResidual = Math.tanh(residual / (norm + 0.004)) * norm;
        const inject = boundedResidual * confidence * this.amount * 0.085;
        if (ch===0) injL = inject; else injR = inject;
      }
      const yl = l + injL, yr = r + injR;
      if (outL) outL[i] = Number.isFinite(yl) ? yl : l;
      if (outR) outR[i] = Number.isFinite(yr) ? yr : r;

      this.featureEnergy[0] += v*v;
      this.featureEnergy[1] += w*w;
      this.featureEnergy[2] += x*x;
      this.featureEnergy[3] += y*y;
      this.featureEnergy[4] += z*z;
      this.interactionEnergy += p5*p5;
      this.injectEnergy += injL*injL + injR*injR;
      this.inputEnergy += l*l + r*r;
      this.confidenceAccum += confidence;
      this.maxInjection = Math.max(this.maxInjection, Math.abs(injL), Math.abs(injR));
      this.framesAccum++;

      this.prev2[0]=this.prev1[0]; this.prev2[1]=this.prev1[1];
      this.prev1[0]=l; this.prev1[1]=r;
    }

    this.reportBlocks++;
    if (this.reportBlocks >= this.reportEveryBlocks) {
      this.reportBlocks = 0;
      const n = Math.max(1, this.framesAccum);
      const names=["vVelocity","wCurvature","xPredictionResidual","yEnvelopeMicro","zMicroCoherence"];
      const featureRms={};
      for(let k=0;k<5;k++) featureRms[names[k]]=Math.sqrt(this.featureEnergy[k]/n);
      this.port.postMessage({
        type:"r5-runtime", enabled:this.enabled, mode:this.mode, amount:this.amount,
        formula:"((v+w+x+y+z)/2.75)^5 bounded gate",
        featureRms,
        fifthOrderInteractionRms:Math.sqrt(this.interactionEnergy/n),
        confidenceMean:this.confidenceAccum/n,
        injectedDetailRms:Math.sqrt(this.injectEnergy/Math.max(1,n*2)),
        injectionToInputDb:10*Math.log10((this.injectEnergy+1e-30)/(this.inputEnergy+1e-30)),
        maxInjection:this.maxInjection,
        algorithmicLatencyFrames:0,
        frequencyBandFeaturesUsed:false,
        lostInformationRecoveredGuaranteed:false
      });
      this.featureEnergy.fill(0); this.interactionEnergy=0; this.injectEnergy=0; this.inputEnergy=0;
      this.confidenceAccum=0; this.framesAccum=0; this.maxInjection=0;
    }
    return true;
  }
}
registerProcessor("yurika-r5-reality-resolution", YurikaR5RealityResolutionProcessor);
