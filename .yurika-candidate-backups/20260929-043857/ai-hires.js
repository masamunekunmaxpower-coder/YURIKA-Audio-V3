"use strict";
(() => {
  const contexts=new WeakMap();
  async function prepare(ctx){
    if(!ctx?.audioWorklet)throw new Error("AudioWorklet unavailable");
    if(contexts.has(ctx))return contexts.get(ctx);
    const task=(async()=>{await ctx.audioWorklet.addModule(chrome.runtime.getURL("ai-hires-worklet.js"));const res=await fetch(chrome.runtime.getURL("hires-hybrid-core.wasm"));if(!res.ok)throw new Error("AI WASM fetch failed");const wasmModule=await WebAssembly.compile(await res.arrayBuffer());return wasmModule;})();
    contexts.set(ctx,task);try{return await task;}catch(e){contexts.delete(ctx);throw e;}
  }
  async function createStage(ctx,input,channels=2,settings={}){
    const bypass=ctx.createGain();const stage={available:false,backend:"bypass",error:null,input,output:bypass,node:null,enabled:false,amount:0,runtime:{},algorithmicLatencyFrames:0};
    try{const wasmModule=await prepare(ctx);const count=Math.max(1,Math.min(2,Number(channels)||2));const node=new AudioWorkletNode(ctx,"yurika-ai-hires",{numberOfInputs:1,numberOfOutputs:1,channelCount:count,outputChannelCount:[count],channelCountMode:"explicit",channelInterpretation:"speakers",processorOptions:{wasmModule}});
      input.connect(node);stage.node=node;stage.output=node;stage.available=true;stage.backend="matlab-design+cpp-wasm-ai+dart-hierarchy-v2.1+txt-controller-v2";stage.detector=globalThis.YurikaDartDetectorRuntime?.create?.()||null;stage.detectorState={l1:0.5,l2:0.5,l3:0.5,objects:[{index:1,score:0.5,weight:1/3,role:"micro"},{index:2,score:0.5,weight:1/3,role:"local"},{index:3,score:0.5,weight:1/3,role:"context"}],hierarchyWeights:{l1:1/3,l2:1/3,l3:1/3},dominantIndex:2,dominantMargin:0,confidence:0,sequence:0,source:"fallback"};
      node.port.onmessage=(event)=>{const d=event?.data||{};if(d.type==="ai-hires-runtime"){stage.runtime={...d};return;}if(d.type==="ai-hires-probe"&&stage.detector){try{const packet=stage.detector.process(d)||null;if(packet){stage.detectorState={...packet};node.port.postMessage({type:"detector-state",...packet});}}catch(_e){}}};
      apply(stage,settings,true);return {output:node,stage};
    }catch(error){stage.error=String(error?.message||error);input.connect(bypass);return {output:bypass,stage};}
  }
  function apply(stage,settings={},reset=false){if(!stage)return;stage.enabled=Boolean(settings.aiHiResEnabled)&&stage.available;stage.amount=Math.max(0,Math.min(100,Number(settings.aiHiResAmount??40)||0))/100;if(reset)stage.detector?.reset?.();stage.node?.port?.postMessage({type:"config",enabled:stage.enabled,amount:stage.amount,reset:Boolean(reset),probeEveryBlocks:4});}
  function ctxRate(stage){return Number(stage?.node?.context?.sampleRate||96000)||96000;}
  function snapshot(stage){if(!stage)return null;const rt=stage.runtime||{};return {available:Boolean(stage.available),enabled:Boolean(stage.enabled),backend:stage.backend,error:stage.error||null,amount:Number(stage.amount||0),algorithmicLatencyFrames:0,algorithmicLatencyMs:0,model:"cpp-wasm-hierarchical-pyramid-v1.5",numericDesign:"MATLAB->C++/Wasm",hierarchy:"Dart rate-aware L1/L2/L3 soft classification -> dedicated-TXT controller -> hierarchy-specific C++ strategy blend",params:697,controllerParams:40,modelBytes:2788,receptiveFieldFrames:11,receptiveFieldMs:1000*11/Math.max(1,ctxRate(stage)),detectorSource:"Dart v2.1 rate-aware rule detector (no AI); controller learned from dedicated TXT corpus",detector:stage.detectorState||null,sourceBandwidthRecoveredGuaranteed:false,generatedBandwidthExtension:true,...rt};}
  globalThis.YurikaAiHiRes=Object.freeze({createStage,apply,snapshot});
})();
