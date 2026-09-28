"use strict";

class YurikaVirtualClassAProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.instance = null; this.exports = null; this.buffer = null; this.bufferPtr = 0;
    this.targetMix = 0; this.mix = 0; this.reportCounter = 0; this.runtimeError = null;
    this.model = { cubic:0.0000600, noise:0.00000080, crosstalk:0.00000100 };
    this.preGain = 1; this.postGain = 1; this.headroomExtensionDb = 0;
    this.opAmpEnabled = true; this.opAmpFeedback = 0.42; this.opAmpDcServoHz = 1.5;
    this.dcL = 0; this.dcR = 0;
    this.ratedPowerW = 8; this.maxPowerW = 12; this.p1dBReferenceDbfs = -0.75;
    this.inputPeak = 0; this.outputPeak = 0; this.inputSq = 0; this.outputSq = 0; this.framesAccum = 0;
    try {
      const module = options?.processorOptions?.wasmModule;
      if (!module) throw new Error("WASM module missing");
      this.instance = new WebAssembly.Instance(module, {});
      this.exports = this.instance.exports;
      this.bufferPtr = Number(this.exports.amp_buffer());
      this.buffer = new Float32Array(this.exports.memory.buffer, this.bufferPtr, 512);
      this.exports.amp_reset(0x6D2B79F5);
      this.exports.amp_set_model(this.model.cubic, this.model.noise, this.model.crosstalk);
      this.port.postMessage({ type:"ready", backend:"cpp-wasm+opamp" });
    } catch (error) {
      this.runtimeError = String(error?.message || error);
      this.port.postMessage({ type:"error", error:this.runtimeError, backend:"bypass" });
    }
    this.port.onmessage = (event) => {
      const msg = event?.data || {};
      if (msg.type !== "config") return;
      this.targetMix = msg.enabled ? 1 : 0;
      this.preGain = Number.isFinite(Number(msg.preGain)) ? Math.max(0.1, Math.min(1, Number(msg.preGain))) : 1;
      this.postGain = Number.isFinite(Number(msg.postGain)) ? Math.max(1, Math.min(8, Number(msg.postGain))) : 1;
      this.headroomExtensionDb = Number.isFinite(Number(msg.headroomExtensionDb)) ? Math.max(0, Math.min(18, Number(msg.headroomExtensionDb))) : 0;
      this.opAmpEnabled = msg.opAmpEnabled !== false;
      this.opAmpFeedback = Number.isFinite(Number(msg.opAmpFeedback)) ? Math.max(0, Math.min(0.95, Number(msg.opAmpFeedback))) : 0.42;
      this.opAmpDcServoHz = Number.isFinite(Number(msg.opAmpDcServoHz)) ? Math.max(0.1, Math.min(20, Number(msg.opAmpDcServoHz))) : 1.5;
      this.ratedPowerW = Number(msg.ratedPowerWPerChannel || 8);
      this.maxPowerW = Number(msg.maxPowerWPerChannel || 12);
      this.p1dBReferenceDbfs = Number(msg.p1dBReferenceDbfs ?? -0.75);
      if (this.exports) {
        const cubic = Number.isFinite(Number(msg.cubic)) ? Number(msg.cubic) : this.model.cubic;
        const noise = Number.isFinite(Number(msg.noise)) ? Number(msg.noise) : this.model.noise;
        const crosstalk = Number.isFinite(Number(msg.crosstalk)) ? Number(msg.crosstalk) : this.model.crosstalk;
        this.model = { cubic, noise, crosstalk };
        this.exports.amp_set_model(cubic, noise, crosstalk);
        this.exports.amp_set_enabled(msg.enabled ? 1 : 0);
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [], output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const channels = Math.max(1, Math.min(2, output.length || input.length || 1));
    const inL = input[0], inR = input[1] || input[0], outL = output[0], outR = output[1];
    if (!outL) return true;

    if (!this.exports || !this.buffer || (this.targetMix === 0 && this.mix === 0)) {
      for (let i=0;i<frames;i++) { const l=inL?.[i]||0,r=inR?.[i]??l; outL[i]=l; if(outR)outR[i]=r; }
      return true;
    }

    try {
      for (let i=0;i<frames;i++) {
        const l=inL?.[i]||0, r=inR?.[i]??l;
        this.buffer[i*2] = l * this.preGain;
        this.buffer[i*2+1] = r * this.preGain;
        const ap=Math.max(Math.abs(l),Math.abs(r)); if(ap>this.inputPeak)this.inputPeak=ap;
        this.inputSq += l*l + r*r;
      }
      this.exports.amp_process(frames, channels);
      const rampStep = 1 / Math.max(1, sampleRate * 0.004);
      const dcAlpha = 1 - Math.exp(-2 * Math.PI * this.opAmpDcServoHz / sampleRate);
      for (let i=0;i<frames;i++) {
        if (this.mix < this.targetMix) this.mix = Math.min(this.targetMix, this.mix + rampStep);
        else if (this.mix > this.targetMix) this.mix = Math.max(this.targetMix, this.mix - rampStep);
        const dryL=inL?.[i]||0, dryR=inR?.[i]??dryL;
        let wetL=this.buffer[i*2] * this.postGain;
        let wetR=this.buffer[i*2+1] * this.postGain;
        if (this.opAmpEnabled) {
          // Linked op-amp servo: bounded error feedback + sub-audible DC correction.
          // It is a software control model, not a claim about a physical op-amp part number.
          wetL += (dryL - wetL) * this.opAmpFeedback;
          wetR += (dryR - wetR) * this.opAmpFeedback;
          this.dcL += (wetL - this.dcL) * dcAlpha;
          this.dcR += (wetR - this.dcR) * dcAlpha;
          wetL -= this.dcL * 0.08;
          wetR -= this.dcR * 0.08;
        }
        const l=dryL+(wetL-dryL)*this.mix, r=dryR+(wetR-dryR)*this.mix;
        outL[i]=Number.isFinite(l)?l:dryL; if(outR)outR[i]=Number.isFinite(r)?r:dryR;
        const op=Math.max(Math.abs(outL[i]),Math.abs(outR?.[i]??outL[i])); if(op>this.outputPeak)this.outputPeak=op;
        this.outputSq += outL[i]*outL[i] + (outR?.[i]??outL[i])*(outR?.[i]??outL[i]);
      }
      this.framesAccum += frames;
      this.reportCounter++;
      if (this.reportCounter >= 24) {
        this.reportCounter = 0;
        const denom=Math.max(1,this.framesAccum*2);
        const inputRms=Math.sqrt(this.inputSq/denom), outputRms=Math.sqrt(this.outputSq/denom);
        const signalValid=inputRms>1e-7 && this.inputPeak>1e-7;
        const inputPeakDb=signalValid?20*Math.log10(this.inputPeak):null;
        const p1dBEquivalentInputDbfs=this.p1dBReferenceDbfs+this.headroomExtensionDb;
        const p1dBMarginDb=signalValid?p1dBEquivalentInputDbfs-inputPeakDb:null;
        const refRms=Math.SQRT1_2;
        const estimatedPowerWPerChannel=this.maxPowerW*Math.pow(Math.min(4,outputRms/refRms),2);
        const estimatedPeakPowerWPerChannel=this.maxPowerW*Math.pow(Math.min(4,this.outputPeak),2);
        const effectiveNoise=Math.max(1e-12,this.model.noise*this.postGain*(1-this.opAmpFeedback));
        const runtimeSnrDb=signalValid?20*Math.log10(Math.max(outputRms,1e-12)/effectiveNoise):null;
        const cubicResidual=Math.max(1e-12,Math.abs(this.model.cubic)*this.preGain*this.preGain*Math.max(this.inputPeak*this.inputPeak,1e-12)*(1-this.opAmpFeedback));
        const runtimeThdnEstimateDb=signalValid?20*Math.log10(cubicResidual+effectiveNoise/Math.max(inputRms,1e-9)):null;
        this.port.postMessage({type:"runtime",mix:this.mix,backend:"cpp-wasm+opamp",opAmpFeedback:this.opAmpFeedback,
          inputPeak:this.inputPeak,outputPeak:this.outputPeak,inputRms,outputRms,estimatedPowerWPerChannel,estimatedPeakPowerWPerChannel,
          p1dBEquivalentInputDbfs,p1dBMarginDb,runtimeSnrDb,runtimeThdnEstimateDb,headroomExtensionDb:this.headroomExtensionDb});
        this.inputPeak=0;this.outputPeak=0;this.inputSq=0;this.outputSq=0;this.framesAccum=0;
      }
    } catch (error) {
      if (!this.runtimeError) { this.runtimeError=String(error?.message||error); this.port.postMessage({type:"error",error:this.runtimeError,backend:"bypass"}); }
      this.targetMix=0;this.mix=0;
      for(let i=0;i<frames;i++){const l=inL?.[i]||0,r=inR?.[i]??l;outL[i]=l;if(outR)outR[i]=r;}
    }
    return true;
  }
}

registerProcessor("yurika-virtual-class-a", YurikaVirtualClassAProcessor);
