"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");const sb={globalThis:null,Math};sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v27.js"),"utf8"),vm.createContext(sb));const a=sb.YurikaAdaptiveV27;
let maxWet=0,maxVoice=0;
for(let i=0;i<100000;i++){
 const settings={voiceMaterialEnabled:Math.random()>.1,voiceMaterialAmount:Math.random()*140-20,voiceDepthMode:["shallow","normal","deep","x"][i%4],voiceTransparency:Math.random()*140-20,voiceAir:Math.random()*140-20,transientEdgeEnabled:Math.random()>.1,transientEdgeAmount:Math.random()*150-25,transientEdgeTone:["soft","focused","sharp","x"][i%4],deviceProfile:["headphone","stereo","smartphone","tv","portable","multispeaker","x"][i%7]};
 const report={pulse:Math.random()*1.4-.2,speechRatio:Math.random()*1.4-.2,breathRatio:Math.random()*1.4-.2,zcr:Math.random()*1.4-.2,speechStability:Math.random()*1.4-.2,rms:Math.random()*.3,crest:Math.random()*12,discontinuity:Math.random()*1.4-.2};
 const v=a.deriveVoiceMaterial(report,settings); for(const x of [v.voiceConfidence,v.syntheticTendency,v.bodyDb,v.mudDb,v.presenceDb,v.airDb,v.reflectionWet]) assert(Number.isFinite(x)); assert(v.voiceConfidence>=0&&v.voiceConfidence<=1); assert(v.syntheticTendency>=0&&v.syntheticTendency<=1); maxVoice=Math.max(maxVoice,v.voiceConfidence);
 const e=a.deriveEdgeAccent(settings,report,Math.random()*1.4-.2,Math.random()*1.4-.2); for(const x of [e.wet,e.holdMs,e.releaseMs,e.centerHz,e.q]) assert(Number.isFinite(x)); assert(e.wet>=0); const cap=a.EDGE_MAX_WET[settings.deviceProfile]??a.EDGE_MAX_WET.stereo; assert(e.wet<=cap+1e-9); maxWet=Math.max(maxWet,e.wet);
}
console.log(`PASS adaptive_v27_fuzz_test 100000 cases maxWet=${maxWet.toFixed(5)} maxVoice=${maxVoice.toFixed(5)}`);
