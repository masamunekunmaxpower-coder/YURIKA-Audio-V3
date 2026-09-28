"use strict";
(() => {
  const contexts = new WeakSet();
  async function prepare(ctx){
    if(!ctx?.audioWorklet) throw new Error("AudioWorklet unavailable");
    if(!contexts.has(ctx)){
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("reality-resolution-worklet.js"));
      contexts.add(ctx);
    }
  }
  async function createStage(ctx,input,channels=2,settings={}){
    const bypass=ctx.createGain();
    const stage={available:false,backend:"bypass",error:null,input,output:bypass,node:null,enabled:false,amount:0,mode:"auto",runtime:{},algorithmicLatencyFrames:0};
    try{
      await prepare(ctx);
      const count=Math.max(1,Math.min(2,Number(channels)||2));
      const node=new AudioWorkletNode(ctx,"yurika-r5-reality-resolution",{numberOfInputs:1,numberOfOutputs:1,channelCount:count,outputChannelCount:[count],channelCountMode:"explicit",channelInterpretation:"speakers"});
      input.connect(node); stage.node=node; stage.output=node; stage.available=true; stage.backend="audio-worklet-r5";
      node.port.onmessage=(event)=>{const d=event?.data||{};if(d.type==="r5-runtime")stage.runtime={...d};};
      apply(stage,settings); return {output:node,stage};
    }catch(error){stage.error=String(error?.message||error);input.connect(bypass);return {output:bypass,stage};}
  }
  function apply(stage,settings={}){
    if(!stage)return;
    stage.enabled=Boolean(settings.r5RealityEnabled)&&stage.available;
    stage.amount=Math.max(0,Math.min(100,Number(settings.r5RealityAmount??35)||0))/100;
    stage.mode=["auto","voice","full"].includes(settings.r5RealityMode)?settings.r5RealityMode:"auto";
    stage.node?.port?.postMessage({type:"config",enabled:stage.enabled,amount:stage.amount,mode:stage.mode});
  }
  function snapshot(stage){
    if(!stage)return null; const rt=stage.runtime||{};
    return {available:Boolean(stage.available),enabled:Boolean(stage.enabled),backend:stage.backend,error:stage.error||null,amount:Number(stage.amount||0),mode:stage.mode||"auto",algorithmicLatencyFrames:0,algorithmicLatencyMs:0,formula:"(v+w+x+y+z)^5 bounded feature interaction",frequencyBandFeaturesUsed:false,lostInformationRecoveredGuaranteed:false,...rt};
  }
  globalThis.YurikaRealityResolution=Object.freeze({createStage,apply,snapshot});
})();
