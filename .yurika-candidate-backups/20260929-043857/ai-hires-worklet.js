"use strict";
const AUDIO_QUANTUM_FRAMES=128,DEADLINE_MS=AUDIO_QUANTUM_FRAMES/sampleRate*1000;
const SR_MIN=88200,SR_MAX=100000;
const SOFT_BUDGET_MS=Math.min(0.45,DEADLINE_MS*0.55),HARD_BUDGET_MS=Math.min(0.75,DEADLINE_MS*0.82);
class YurikaAiHiResProcessor extends AudioWorkletProcessor{
  constructor(options){
    super();
    this.enabled=false;this.amount=0.4;this.runtimeBypass=false;this.faultBypass=false;this.warmupRemaining=128;this.slowBlocks=0;
    this.blocks=0;this.reportEvery=Math.max(24,Math.round(sampleRate/128/8));this.probeBlock=0;this.probeEvery=4;
    this.lastMs=null;this.emaMs=null;this.maxMs=0;this.detectorAgeBlocks=0;
    this.detector={l1:0.5,l2:0.5,l3:0.5,confidence:0,sequence:0,objects:[{index:1,score:0.5},{index:2,score:0.5},{index:3,score:0.5}],hierarchyWeights:{l1:1/3,l2:1/3,l3:1/3},dominantIndex:2,dominantMargin:0};
    this.wasm=null;this.exp=null;this.memory=null;this.inPtr=0;this.outPtr=0;this.inView=null;this.outView=null;
    try{
      const mod=options?.processorOptions?.wasmModule;
      if(mod){this.wasm=new WebAssembly.Instance(mod,{});this.exp=this.wasm.exports;this.memory=this.exp.memory;this.inPtr=this.exp.yurika_input();this.outPtr=this.exp.yurika_output();this._refreshViews();this.exp.yurika_reset(sampleRate);this.wasmReady=true;}else this.wasmReady=false;
    }catch(_e){this.wasmReady=false;this.faultBypass=true;}
    this.port.onmessage=(event)=>{const d=event?.data||{};
      if(d.type==="detector-state"){
        const clip=v=>Math.max(0,Math.min(1,Number(v)||0));
        let l1=clip(d.l1),l2=clip(d.l2),l3=clip(d.l3);
        if(Array.isArray(d.objects))for(const o of d.objects){const idx=Number(o?.index),score=clip(o?.score);if(idx===1)l1=score;else if(idx===2)l2=score;else if(idx===3)l3=score;}
        const c=clip(d.confidence),hw=d.hierarchyWeights||{};let w1=clip(hw.l1),w2=clip(hw.l2),w3=clip(hw.l3),ws=w1+w2+w3;if(ws<1e-6){w1=w2=w3=1/3}else{w1/=ws;w2/=ws;w3/=ws;}const softObjects=Array.isArray(d.softObjects)?d.softObjects.slice(0,4):[];this.detector={l1,l2,l3,confidence:c,sequence:Number(d.sequence)||0,objects:d.objects||[{index:1,score:l1},{index:2,score:l2},{index:3,score:l3}],hierarchyWeights:{l1:w1,l2:w2,l3:w3},dominantIndex:Number(d.dominantIndex)||2,dominantMargin:clip(d.dominantMargin),softObjects};
        this.detectorAgeBlocks=0;if(this.exp){this.exp.yurika_set_detector(l1,l2,l3,c);if(this.exp.yurika_set_hierarchy_weights)this.exp.yurika_set_hierarchy_weights(w1,w2,w3,c);this.exp.yurika_clear_objects();const typeMap={tonal:0,transient:1,texture:2,ambience:3};for(let i=0;i<softObjects.length;i++){const o=softObjects[i]||{},h=o.hierarchy||{};this.exp.yurika_set_object(i,typeMap[o.type]??2,clip(o.energy),clip(o.confidence),clip(h.l1),clip(h.l2),clip(h.l3));}this.exp.yurika_commit_objects(softObjects.length);}return;
      }
      if(d.type!=="config")return;const was=this.enabled;this.enabled=d.enabled===true;this.amount=Math.max(0,Math.min(1,Number(d.amount??this.amount)||0));
      if(this.exp)this.exp.yurika_set_amount(this.amount);
      if(Number.isFinite(Number(d.reportEveryBlocks)))this.reportEvery=Math.max(16,Math.min(512,Number(d.reportEveryBlocks)|0));
      if(Number.isFinite(Number(d.probeEveryBlocks)))this.probeEvery=Math.max(2,Math.min(64,Number(d.probeEveryBlocks)|0));
      if((!was&&this.enabled)||d.reset===true)this._resetRuntime();
    };
  }
  _refreshViews(){if(!this.memory)return;this.inView=new Float32Array(this.memory.buffer,this.inPtr,512);this.outView=new Float32Array(this.memory.buffer,this.outPtr,512);}
  _resetRuntime(){this.runtimeBypass=false;this.faultBypass=!this.wasmReady;this.warmupRemaining=128;this.slowBlocks=0;this.lastMs=null;this.emaMs=null;this.maxMs=0;this.detectorAgeBlocks=0;this.detector.l1=this.detector.l2=this.detector.l3=0.5;this.detector.confidence=0;if(this.exp){this.exp.yurika_reset(sampleRate);this.exp.yurika_set_amount(this.amount);}}
  _copyBypass(inL,inR,outL,outR,frames){for(let i=0;i<frames;i++){const l=Number.isFinite(inL?.[i])?inL[i]:0,r=Number.isFinite(inR?.[i])?inR[i]:l;if(outL)outL[i]=l;if(outR)outR[i]=r;}}
  _emitProbe(frames){this.probeBlock=(this.probeBlock+1)%this.probeEvery;if(this.probeBlock!==0||!this.exp)return;this.port.postMessage({type:"ai-hires-probe",rms:this.exp.yurika_probe_rms(),peak:this.exp.yurika_probe_peak(),diffRms:this.exp.yurika_probe_diff_rms(),zeroCrossRate:this.exp.yurika_probe_zcr(),sideRatio:this.exp.yurika_probe_side_ratio(),frames,sampleRate});}
  process(inputs,outputs){const input=inputs[0]||[],output=outputs[0]||[];const inL=input[0],inR=input[1]||input[0],outL=output[0],outR=output[1]||output[0];const frames=outL?.length||outR?.length||128;if(!outL&&!outR)return true;
    const rateSupported=sampleRate>=SR_MIN&&sampleRate<=SR_MAX;
    const active=this.enabled&&rateSupported&&this.wasmReady&&!this.runtimeBypass&&!this.faultBypass&&this.amount>0;
    this.detectorAgeBlocks++;if(this.detectorAgeBlocks>1500){this.detector.l1+=(0.5-this.detector.l1)*0.01;this.detector.l2+=(0.5-this.detector.l2)*0.01;this.detector.l3+=(0.5-this.detector.l3)*0.01;this.detector.confidence*=0.99;const hw=this.detector.hierarchyWeights||(this.detector.hierarchyWeights={l1:1/3,l2:1/3,l3:1/3});hw.l1+=(1/3-hw.l1)*0.01;hw.l2+=(1/3-hw.l2)*0.01;hw.l3+=(1/3-hw.l3)*0.01;if(this.exp){this.exp.yurika_set_detector(this.detector.l1,this.detector.l2,this.detector.l3,this.detector.confidence);if(this.exp.yurika_set_hierarchy_weights)this.exp.yurika_set_hierarchy_weights(hw.l1,hw.l2,hw.l3,this.detector.confidence);this.exp.yurika_clear_objects();this.exp.yurika_commit_objects(0);}}
    if(!active){this._copyBypass(inL,inR,outL,outR,frames);}else{
      const perf=globalThis.performance,t0=perf&&typeof perf.now==="function"?perf.now():NaN;
      try{if(this.inView.buffer!==this.memory.buffer)this._refreshViews();const channels=input[1]?2:1;for(let i=0;i<frames;i++){const l=Number.isFinite(inL?.[i])?inL[i]:0,r=Number.isFinite(inR?.[i])?inR[i]:l;this.inView[i*2]=l;this.inView[i*2+1]=r;}this.exp.yurika_process(frames,channels);for(let i=0;i<frames;i++){if(outL)outL[i]=this.outView[i*2];if(outR)outR[i]=this.outView[i*2+1];}if(this.exp.yurika_nonfinite_count()>0)this.faultBypass=true;}catch(_e){this.faultBypass=true;this._copyBypass(inL,inR,outL,outR,frames);}
      this._emitProbe(frames);
      if(Number.isFinite(t0)){const ms=perf.now()-t0;this.lastMs=ms;this.emaMs=this.emaMs==null?ms:this.emaMs*0.92+ms*0.08;if(ms>this.maxMs)this.maxMs=ms;if(this.warmupRemaining>0){this.warmupRemaining--;this.slowBlocks=0;}else{if(ms>HARD_BUDGET_MS)this.slowBlocks++;else this.slowBlocks=Math.max(0,this.slowBlocks-1);if(this.slowBlocks>=3)this.runtimeBypass=true;}}
    }
    this.blocks++;if(this.blocks>=this.reportEvery){this.blocks=0;this.port.postMessage({type:"ai-hires-runtime",enabled:this.enabled,active:active&&!this.runtimeBypass&&!this.faultBypass,sampleRate,rateSupported,certifiedSampleRate:"88.2-100 kHz (96 kHz target)",model:"cpp-wasm-bandwidth-perceptual-sr-v3.7.0",controller:"paired-audio-bwe-sr-controller-v3",numericDesign:"causal sample-rate-aware BWE + perceptual SR -> C++/Wasm",params:697,controllerParams:60,modelBytes:2788,algorithmicLatencyFrames:0,deadlineMs:DEADLINE_MS,softBudgetMs:SOFT_BUDGET_MS,hardBudgetMs:HARD_BUDGET_MS,lastProcessMs:this.lastMs,emaProcessMs:this.emaMs,maxProcessMs:this.maxMs,loadBypass:this.runtimeBypass,faultBypass:this.faultBypass,detector:{kind:"dart-soft-object-detector-v2",...this.detector,ageBlocks:this.detectorAgeBlocks},strategy:this.exp?{harmonic:this.exp.yurika_strategy(0),transient:this.exp.yurika_strategy(1),texture:this.exp.yurika_strategy(2),ambience:this.exp.yurika_strategy(3),confidence:this.exp.yurika_strategy_confidence(),bweDrive:this.exp.yurika_bwe_drive?this.exp.yurika_bwe_drive():0,srDrive:this.exp.yurika_sr_drive?this.exp.yurika_sr_drive():0,nativeHfRatio:this.exp.yurika_native_hf_ratio?this.exp.yurika_native_hf_ratio():0,objectCount:this.exp.yurika_object_count(),hierarchy:this.exp.yurika_hierarchy_weight?{l1:this.exp.yurika_hierarchy_weight(0),l2:this.exp.yurika_hierarchy_weight(1),l3:this.exp.yurika_hierarchy_weight(2),confidence:this.exp.yurika_hierarchy_confidence()}:null}:null,sourceBandwidthRecoveredGuaranteed:false,generatedBandwidthExtension:true});this.maxMs=0;}return true;
  }
}
registerProcessor("yurika-ai-hires",YurikaAiHiResProcessor);
