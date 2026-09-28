"use strict";

class YurikaConcertHallProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cfg = {
      enabled:false, rt60:2.05, predelayMs:17, earlyMix:0.42, lateMix:0.58,
      dampingHz:7200, diffusion:0.86, width:1.0, wetTrim:0.92, geometry:"reference-shoebox"
    };
    this.preLen = Math.max(1024, Math.ceil(sampleRate * 0.14));
    this.preL = new Float32Array(this.preLen);
    this.preR = new Float32Array(this.preLen);
    this.prePos = 0;
    this.lineMs = [29.7,34.9,41.3,47.9,54.7,61.9,69.1,77.3];
    this.lineLen = this.lineMs.map(ms => Math.max(64, Math.ceil(sampleRate * ms / 1000) + 32));
    this.lines = this.lineLen.map(n => new Float32Array(n));
    this.linePos = new Int32Array(8);
    this.damp = new Float32Array(8);
    this.phase = new Float64Array([0,0.7,1.4,2.1,2.8,3.5,4.2,4.9]);
    this.dcL = 0; this.dcR = 0; this.prevOutL = 0; this.prevOutR = 0;
    this.feedback = new Float32Array(8);
    this.reads = new Float32Array(8);
    this.modRates = [0.071,0.083,0.097,0.109,0.121,0.137,0.149,0.163];
    // Static mix signs: never allocate arrays inside the realtime sample loop.
    this.signL = new Int8Array([1,-1,1,1,-1,1,-1,-1]);
    this.signR = new Int8Array([1,1,-1,1,1,-1,-1,1]);
    this.modDepthSamples = this.lineMs.map((_,i)=>sampleRate * ((0.055 + i*0.006)/1000));
    this._recalc();
    this.port.onmessage = (event) => {
      const m = event.data || {};
      if (m.type === "config") {
        const wasEnabled = this.cfg.enabled !== false;
        this.cfg = { ...this.cfg, ...m };
        this.cfg.rt60 = Math.max(0.8, Math.min(4.5, Number(this.cfg.rt60)||2.05));
        this.cfg.predelayMs = Math.max(0, Math.min(45, Number(this.cfg.predelayMs)||17));
        this.cfg.earlyMix = Math.max(0, Math.min(1, Number(this.cfg.earlyMix)||0));
        this.cfg.lateMix = Math.max(0, Math.min(1, Number(this.cfg.lateMix)||0));
        this.cfg.dampingHz = Math.max(1800, Math.min(sampleRate*0.42, Number(this.cfg.dampingHz)||7200));
        this.cfg.diffusion = Math.max(0.25, Math.min(0.98, Number(this.cfg.diffusion)||0.86));
        this.cfg.width = Math.max(0.5, Math.min(1.4, Number(this.cfg.width)||1));
        this.cfg.wetTrim = Math.max(0.25, Math.min(1.25, Number(this.cfg.wetTrim)||0.92));
        // Once disabled, discard the tail so re-enabling cannot revive stale FDN state.
        if (wasEnabled && this.cfg.enabled === false) this._reset();
        this._recalc();
      } else if (m.type === "reset") this._reset();
    };
  }

  _reset() {
    this.preL.fill(0); this.preR.fill(0); this.prePos = 0;
    for (const b of this.lines) b.fill(0);
    this.linePos.fill(0); this.damp.fill(0); this.feedback.fill(0);
    this.dcL = this.dcR = this.prevOutL = this.prevOutR = 0;
  }

  _recalc() {
    const rt = Math.max(0.8, this.cfg.rt60);
    // Calibrated against the deterministic broadband Schroeder-decay bench.
    // The 1.25 factor offsets frequency-dependent damping so the measured
    // mid-tail RT60 tracks the requested acoustic RT60 instead of the raw line decay.
    this.fbGain = this.lineMs.map(ms => Math.pow(0.001, (ms/1000)/(rt*1.25)));
    const x = Math.exp(-2*Math.PI*this.cfg.dampingHz/sampleRate);
    this.dampA = Math.max(0, Math.min(0.99995, x));
    const geom = String(this.cfg.geometry || "reference-shoebox");
    const sets = {
      "reference-shoebox": [11.4,17.8,23.9,31.6,42.7,55.1],
      "vineyard": [8.7,13.1,18.6,26.4,37.2,49.5],
      "chamber": [7.1,11.8,16.9,24.2,34.8,45.7],
      "opera": [9.8,15.6,22.4,30.9,41.8,53.0]
    };
    this.earlyMs = sets[geom] || sets["reference-shoebox"];
    this.earlyG = geom === "vineyard" ? [0.31,0.27,0.23,0.19,0.15,0.12]
      : geom === "chamber" ? [0.29,0.24,0.20,0.16,0.13,0.10]
      : geom === "opera" ? [0.30,0.25,0.21,0.17,0.14,0.11]
      : [0.34,0.29,0.24,0.20,0.16,0.13];
  }

  _readPre(buf, delaySamples) {
    const n = buf.length;
    let p = this.prePos - delaySamples;
    while (p < 0) p += n;
    const i0 = Math.floor(p) % n;
    const i1 = (i0 + 1) % n;
    const f = p - Math.floor(p);
    return buf[i0] + (buf[i1] - buf[i0]) * f;
  }

  _readLine(i, offset) {
    const buf = this.lines[i], n = buf.length;
    let p = this.linePos[i] - offset;
    while (p < 0) p += n;
    const i0 = Math.floor(p) % n, i1=(i0+1)%n, f=p-Math.floor(p);
    return buf[i0] + (buf[i1]-buf[i0])*f;
  }

  process(inputs, outputs) {
    const input = inputs[0] || [], output = outputs[0] || [];
    const outL = output[0], outR = output[1] || output[0];
    if (!outL) return true;
    const inL = input[0], inR = input[1] || input[0];
    const enabled = this.cfg.enabled !== false;
    // This node is wet-only. When Hall is disabled, do not run the FDN at all.
    if (!enabled) {
      outL.fill(0);
      if (outR && outR !== outL) outR.fill(0);
      return true;
    }
    const pred = this.cfg.predelayMs * sampleRate / 1000;
    const diff = this.cfg.diffusion;
    const width = this.cfg.width;
    const wetTrim = this.cfg.wetTrim;
    for (let s=0; s<outL.length; s++) {
      const L = inL ? (inL[s] || 0) : 0;
      const R = inR ? (inR[s] || 0) : L;
      this.preL[this.prePos] = L; this.preR[this.prePos] = R;

      let eL=0, eR=0;
      for (let t=0;t<this.earlyMs.length;t++) {
        const d = pred + this.earlyMs[t]*sampleRate/1000;
        const g = this.earlyG[t];
        const aL = this._readPre(this.preL,d), aR=this._readPre(this.preR,d);
        if ((t&1)===0) { eL += aR*g*(0.92+0.08*width); eR += aL*g; }
        else { eL += aL*g*0.86; eR += aR*g*(0.90+0.10*width); }
      }

      const pL=this._readPre(this.preL,pred), pR=this._readPre(this.preR,pred);
      let sum=0;
      const d = this.reads;
      for (let i=0;i<8;i++) {
        this.phase[i] += 2*Math.PI*this.modRates[i]/sampleRate;
        if (this.phase[i] > Math.PI*2) this.phase[i]-=Math.PI*2;
        const mod = Math.sin(this.phase[i]) * this.modDepthSamples[i] * diff;
        d[i] = this._readLine(i, this.lineMs[i]*sampleRate/1000 + mod);
        sum += d[i];
      }
      const mean=sum/8;
      let lateL=0, lateR=0;
      const signL=this.signL, signR=this.signR;
      for (let i=0;i<8;i++) {
        // Energy-preserving Householder feedback.  Diffusion controls
        // modulation/early-field density elsewhere; it must not shorten RT60.
        const h = (2*mean - d[i]);
        this.damp[i] = this.dampA*this.damp[i] + (1-this.dampA)*h;
        const injBase = ((i&1)?pR:pL) * 0.19 + (((i%3)===0)?eL:eR)*0.035;
        const decor = ((i===2||i===5)?-1:1);
        const w = injBase*decor + this.damp[i]*this.fbGain[i];
        const pos=this.linePos[i], buf=this.lines[i];
        buf[pos]=Math.max(-2.5,Math.min(2.5,w));
        this.linePos[i]=(pos+1)%buf.length;
        lateL += signL[i]*d[i]; lateR += signR[i]*d[i];
      }
      lateL *= 0.235; lateR *= 0.235;
      const mid=(lateL+lateR)*0.5, side=(lateL-lateR)*0.5*width;
      lateL=mid+side; lateR=mid-side;
      let yL=(eL*this.cfg.earlyMix + lateL*this.cfg.lateMix)*wetTrim;
      let yR=(eR*this.cfg.earlyMix + lateR*this.cfg.lateMix)*wetTrim;
      // Gentle DC blocker on the wet-only path.
      const dcL=yL-this.prevOutL+0.995*this.dcL, dcR=yR-this.prevOutR+0.995*this.dcR;
      this.prevOutL=yL; this.prevOutR=yR; this.dcL=dcL; this.dcR=dcR;
      outL[s]=Number.isFinite(dcL)?dcL:0; outR[s]=Number.isFinite(dcR)?dcR:0;
      this.prePos=(this.prePos+1)%this.preLen;
    }
    return true;
  }
}

registerProcessor("yurika-concert-hall", YurikaConcertHallProcessor);
