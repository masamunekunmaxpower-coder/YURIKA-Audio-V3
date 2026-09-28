(() => {
  "use strict";
  const MODES = Object.freeze({
    "reference-shoebox": Object.freeze({rt60:2.05,predelayMs:17,earlyMix:0.43,lateMix:0.57,dampingHz:7200,diffusion:0.88,width:1.08,wetBase:0.205}),
    "vineyard": Object.freeze({rt60:1.88,predelayMs:12,earlyMix:0.50,lateMix:0.50,dampingHz:7600,diffusion:0.91,width:1.13,wetBase:0.195}),
    "chamber": Object.freeze({rt60:1.52,predelayMs:10,earlyMix:0.54,lateMix:0.46,dampingHz:6900,diffusion:0.84,width:1.02,wetBase:0.165}),
    "opera": Object.freeze({rt60:1.46,predelayMs:14,earlyMix:0.47,lateMix:0.53,dampingHz:6500,diffusion:0.87,width:1.04,wetBase:0.175})
  });
  const SEATS = Object.freeze({
    front:Object.freeze({predelayMul:0.76,wetMul:0.76,earlyMul:1.08,lateMul:0.88,widthMul:0.96}),
    center:Object.freeze({predelayMul:1.0,wetMul:1.0,earlyMul:1.0,lateMul:1.0,widthMul:1.0}),
    rear:Object.freeze({predelayMul:1.18,wetMul:1.14,earlyMul:0.94,lateMul:1.10,widthMul:1.04}),
    balcony:Object.freeze({predelayMul:1.28,wetMul:1.18,earlyMul:1.08,lateMul:1.08,widthMul:1.10})
  });
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const isHeadphoneType=(t)=>["headphone","iem","earbuds","remote-headphone"].includes(String(t||""));
  function resolveOutputClass(settings={}, resolved=null) {
    const target=String(settings.spatialOutputTarget||"local");
    if(target==="sonobus-mobile-headphones") return "remote-headphone";
    if(target==="sonobus-mobile-speaker") return "remote-speaker";
    const d=String(resolved?.profile?.deviceType || resolved?.deviceType || settings.deviceProfile || "stereo").toLowerCase();
    if(d.includes("iem")) return "iem";
    if(d.includes("earbud")) return "earbuds";
    if(d.includes("headphone")) return "headphone";
    if(d.includes("studio")) return "studio-monitor";
    if(d.includes("laptop")) return "laptop";
    if(d.includes("tv")) return "tv";
    if(d.includes("speaker")) return "speaker";
    return d==="headphone"?"headphone":"speaker";
  }
  function computeParameters(settings={}, resolved=null) {
    const mode=MODES[settings.concertHallMode]?settings.concertHallMode:"reference-shoebox";
    const seat=SEATS[settings.concertHallSeat]?settings.concertHallSeat:"center";
    const p=MODES[mode], s=SEATS[seat];
    const amount=clamp(settings.concertHallAmount,0,100)/100;
    const outputClass=resolveOutputClass(settings,resolved);
    const occupancy=clamp(settings.concertHallOccupancy,0,100)/100;
    // Audience/seat absorption is intentionally bounded. A well-designed hall should
    // not swing wildly between empty and occupied conditions.
    const occupancyDelta=occupancy-0.70;
    const adapt={headphone:0.78,iem:0.72,earbuds:0.68,"remote-headphone":0.70,laptop:0.66,tv:0.76,speaker:1.0,"remote-speaker":0.90,"studio-monitor":0.94}[outputClass] ?? 0.92;
    const hfAdapt=isHeadphoneType(outputClass)?0.93:(outputClass==="laptop"?0.82:1.0);
    const wet=clamp(p.wetBase*s.wetMul*adapt*(0.35+0.95*amount),0,0.34);
    const dry=clamp(1-wet*0.12,0.95,1.0);
    const early=p.earlyMix*s.earlyMul, late=p.lateMix*s.lateMul, norm=Math.max(0.001,early+late);
    return Object.freeze({
      enabled:Boolean(settings.concertHallEnabled)&&amount>0, mode, seat, outputClass,
      rt60:p.rt60*(1-0.08*occupancyDelta), predelayMs:p.predelayMs*s.predelayMul,
      earlyMix:early/norm, lateMix:late/norm,
      dampingHz:p.dampingHz*hfAdapt*(1-0.14*occupancyDelta), diffusion:p.diffusion, occupancy,
      width:clamp(p.width*s.widthMul,0.8,1.28), wet, dry,
      wetTrim:isHeadphoneType(outputClass)?0.86:0.92,
      serialAddedLatencyMs:0,
      acousticDelayNote:"wet-only predelay/early reflections; dry direct path is not serially delayed"
    });
  }
  async function createStage(ctx,input) {
    const dry=ctx.createGain(), wet=ctx.createGain(), output=ctx.createGain();
    dry.gain.value=1; wet.gain.value=0;
    input.connect(dry); dry.connect(output);
    let node=null, available=false, error=null;
    try {
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("concert-hall-worklet.js"));
      node=new AudioWorkletNode(ctx,"yurika-concert-hall",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:"explicit"});
      input.connect(node); node.connect(wet); wet.connect(output); available=true;
    } catch(e) { error=e?.message||String(e); }
    return {output,stage:{ctx,input,dry,wet,output,node,available,error,last:null,lastEnabled:false}};
  }
  function smooth(param,value,now,seconds=0.20){try{param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);param.linearRampToValueAtTime(value,now+seconds);}catch{try{param.value=value;}catch{}}}
  function apply(stage,settings={},resolved=null,{initial=false}={}) {
    if(!stage?.ctx) return null;
    const p=computeParameters(settings,resolved); stage.last=p;
    const now=stage.ctx.currentTime;
    if(stage.node?.port) stage.node.port.postMessage({type:"config",enabled:p.enabled,rt60:p.rt60,predelayMs:p.predelayMs,earlyMix:p.earlyMix,lateMix:p.lateMix,dampingHz:p.dampingHz,diffusion:p.diffusion,width:p.width,wetTrim:p.wetTrim,geometry:p.mode});
    if(initial){stage.dry.gain.value=p.enabled&&stage.available?p.dry:1;stage.wet.gain.value=p.enabled&&stage.available?p.wet:0;}
    else {smooth(stage.dry.gain,p.enabled&&stage.available?p.dry:1,now,0.18);smooth(stage.wet.gain,p.enabled&&stage.available?p.wet:0,now,0.24);}
    stage.lastEnabled=p.enabled;
    return p;
  }
  function snapshot(stage){
    const p=stage?.last;
    return p?{...p,available:Boolean(stage.available),backend:stage.available?"AudioWorklet 8-line FDN + early reflections":"bypass",error:stage.error||null}:null;
  }
  function dispose(stage){try{stage?.node?.port?.postMessage({type:"reset"});}catch{} try{stage?.input?.disconnect(stage?.node);}catch{} try{stage?.node?.disconnect();}catch{}}
  globalThis.YurikaConcertHall=Object.freeze({MODES,SEATS,computeParameters,createStage,apply,snapshot,dispose});
})();
