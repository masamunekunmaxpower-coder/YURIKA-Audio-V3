"use strict";
const assert=require("assert");
require("../dsp-core.js");
const c=globalThis.YurikaAudioCore;
let s=c.applyPreset(c.DEFAULTS,"selfdap");
const independent=()=>({dapMode:s.dapMode,dapStrength:s.dapStrength,selfDapEnabled:s.selfDapEnabled,selfDapStrength:s.selfDapStrength,selfDapRestoration:s.selfDapRestoration,selfDapRestorationCutoffKhz:s.selfDapRestorationCutoffKhz,perspectiveEnabled:s.perspectiveEnabled,perspectiveDepth:s.perspectiveDepth,adaptiveSafetyEnabled:s.adaptiveSafetyEnabled});
let expected=independent();
const audioKeys=c.PRESET_AUDIO_KEYS.filter(k=>k!=="hiResMode");
let seed=0x51fda7;
const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
for(let i=0;i<50000;i++){
  if(i%997===0){
    const names=["flat","clean","music","voice","night","studio","immersive"];
    s=c.applyPreset(s,names[i%names.length]);
    assert.deepEqual(independent(),expected,`normal preset changed independent layer at ${i}`);
    continue;
  }
  const key=audioKeys[Math.floor(rnd()*audioKeys.length)];
  let value;
  if(key==="compressor") value=rnd()>.5;
  else if(key==="lowCutHz") value=[20,28,35,50,70][Math.floor(rnd()*5)];
  else if(["bassDb","warmthDb","clarityDb","airDb","outputDb"].includes(key)) value=-12+rnd()*24;
  else value=-50+rnd()*200;
  const before=s;
  s=c.applyManualPatch(s,{[key]:value,preset:"flat",enabled:true});
  assert.equal(s.preset,before.preset); assert.equal(s.enabled,before.enabled);
  assert.deepEqual(independent(),expected,`manual audio edit leaked into independent layer at ${i}`);
}
// Explicit independent edits must change only their own keys and remain sticky afterwards.
s=c.applyManualPatch(s,{selfDapStrength:91,perspectiveEnabled:true,perspectiveDepth:77,dapMode:"tube",dapStrength:64,adaptiveSafetyEnabled:false});
expected=independent();
for(const name of ["clean","music","studio","immersive","flat"]){s=c.applyPreset(s,name);assert.deepEqual(independent(),expected);}
const d=c.diffSettings(s,c.applyManualPatch(s,{detail:44}));assert.deepEqual(Object.keys(d),["detail"]);
console.log("PASS state_engine_stress_test 50000 actions + independent layer invariants + explicit edits sticky");
