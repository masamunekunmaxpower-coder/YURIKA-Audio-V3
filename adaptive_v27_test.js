"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const sb={globalThis:null,Math};sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v27.js"),"utf8"),vm.createContext(sb));
const a=sb.YurikaAdaptiveV27; assert(a);

const base={voiceMaterialEnabled:true,voiceMaterialAmount:70,voiceDepthMode:"deep",voiceTransparency:60,voiceAir:50,transientEdgeEnabled:true,transientEdgeAmount:60,transientEdgeTone:"focused",deviceProfile:"stereo"};
const human=a.deriveVoiceMaterial({speechRatio:.72,breathRatio:.18,zcr:.08,speechStability:.75,rms:.08,crest:2.5,discontinuity:.02},base);
assert(human.active); assert(human.voiceConfidence>0.2); assert(human.bodyDb>0); assert(human.reflectionWet>0);
const synth=a.deriveVoiceMaterial({speechRatio:.78,breathRatio:.02,zcr:.025,speechStability:.95,rms:.08,crest:2.1,discontinuity:.01},base);
assert(synth.syntheticTendency>human.syntheticTendency);
const off=a.deriveVoiceMaterial({speechRatio:.8,rms:.1},{...base,voiceMaterialEnabled:false}); assert.equal(off.voiceConfidence,0);

const edge=a.deriveEdgeAccent(base,{pulse:.95,speechRatio:.12,breathRatio:.02,zcr:.05},0,0);
assert(edge.active); assert(edge.wet>0 && edge.wet<=a.EDGE_MAX_WET.stereo+1e-9); assert(edge.holdMs<4);
const safe=a.deriveEdgeAccent(base,{pulse:1,speechRatio:.1,breathRatio:.01,zcr:.02},1,0); assert.equal(safe.wet,0);
const sibilant=a.deriveEdgeAccent(base,{pulse:.95,speechRatio:.85,breathRatio:.65,zcr:.32},0,0); assert(sibilant.wet<edge.wet);
const seam=a.deriveEdgeAccent(base,{pulse:.95,speechRatio:.2,breathRatio:.02,zcr:.04},0,1); assert(seam.wet<edge.wet*0.2);
const phone=a.deriveEdgeAccent({...base,deviceProfile:"smartphone",transientEdgeAmount:100},{pulse:1},0,0); assert(phone.wet<=a.EDGE_MAX_WET.smartphone+1e-9);

const h=a.hrtfProfile("wide",100); assert(h.crossfeed>0&&h.crossfeed<0.1); assert(h.delaySeconds>0&&h.delaySeconds<0.001);
console.log("PASS adaptive_v27_test voice heuristic + bounded edge accent + safety/sibilance/seam guards + lightweight HRTF");
