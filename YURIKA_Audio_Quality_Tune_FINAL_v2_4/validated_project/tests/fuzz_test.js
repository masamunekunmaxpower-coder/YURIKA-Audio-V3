"use strict";
const assert=require("assert");
require("../dsp-core.js");
const c=globalThis.YurikaAudioCore;
let seed=0x5eed1234;
const rnd=()=>((seed=(1664525*seed+1013904223)>>>0)/0x100000000);
const any=()=> (rnd()-0.5)*400;
for(let i=0;i<10000;i++){
  const raw={
    enabled:rnd()>0.5,preset:"p"+i,lowCutHz:any(),bassDb:any(),warmthDb:any(),clarityDb:any(),airDb:any(),outputDb:any(),
    compressor:rnd()>0.5,detail:any(),width:any(),reality:any(),noiseReduction:any(),spectralFill:any(),hiResMode:rnd()>0.5,
    dapMode:["off","reference","warm","natural","tube","BAD"][Math.floor(rnd()*6)],dapStrength:any(),
    selfDapEnabled:rnd()>0.5,selfDapStrength:any(),selfDapRestoration:["off","auto","on","BAD"][Math.floor(rnd()*4)],
    selfDapRestorationCutoffKhz:any(),perspectiveEnabled:rnd()>0.5,perspectiveDepth:any(),adaptiveSafetyEnabled:rnd()>0.5
  };
  const s=c.sanitizeSettings(raw);
  for(const k of ["lowCutHz","bassDb","warmthDb","clarityDb","airDb","outputDb","detail","width","reality","noiseReduction","spectralFill","dapStrength","selfDapStrength","selfDapRestorationCutoffKhz","perspectiveDepth"]) assert(Number.isFinite(s[k]),k);
  assert(s.lowCutHz>=5&&s.lowCutHz<=120); assert(s.dapStrength>=0&&s.dapStrength<=100); assert(s.selfDapStrength>=0&&s.selfDapStrength<=100);
  assert(s.selfDapRestorationCutoffKhz>=9&&s.selfDapRestorationCutoffKhz<=18); assert(s.perspectiveDepth>=0&&s.perspectiveDepth<=100);
  const pp=c.perspectiveProfile(s.perspectiveEnabled,s.perspectiveDepth); assert(pp.wet>=0&&pp.wet<=0.12+1e-12); assert(pp.predelaySeconds>=0.003&&pp.predelaySeconds<=0.0131);
  const hr=c.computeAutoHeadroomDb(s); const out=c.computeEffectiveOutputDb(s); assert(Number.isFinite(hr)&&hr<=0&&hr>=-12); assert(Number.isFinite(out)&&out>=-24&&out<=6);
  const preset=["flat","clean","music","voice","night","studio","immersive"][i%7];
  const before={...s,dapMode:"tube",dapStrength:81,selfDapEnabled:true,selfDapStrength:73,perspectiveEnabled:true,perspectiveDepth:67,adaptiveSafetyEnabled:false};
  const after=c.applyPreset(before,preset);
  assert.equal(after.dapMode,"tube"); assert.equal(after.dapStrength,81); assert.equal(after.selfDapEnabled,true); assert.equal(after.selfDapStrength,73); assert.equal(after.perspectiveEnabled,true); assert.equal(after.perspectiveDepth,67); assert.equal(after.adaptiveSafetyEnabled,false);
}
console.log("PASS fuzz_test 10000 randomized settings + headroom + independent layers");
