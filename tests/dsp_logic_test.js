"use strict";
const assert = require("assert");
require("../dsp-core.js");
require("../self-dap-core.js");
const core = globalThis.YurikaAudioCore;
const selfDap = globalThis.YurikaSelfDap;

const extreme = core.sanitizeSettings({
  enabled:1,preset:"x".repeat(100),lowCutHz:-999,bassDb:999,warmthDb:-999,clarityDb:"3.5",airDb:NaN,
  outputDb:Infinity,compressor:false,detail:999,width:-2,reality:150,noiseReduction:-4,spectralFill:500,hiResMode:1,dapMode:"evil",dapStrength:999,selfDapEnabled:1,selfDapStrength:999,selfDapRestoration:"evil",selfDapRestorationCutoffKhz:999,perspectiveEnabled:1,perspectiveDepth:999
});
assert.equal(extreme.enabled,true); assert.equal(extreme.preset.length,24); assert.equal(extreme.lowCutHz,20);
assert.equal(extreme.bassDb,6); assert.equal(extreme.warmthDb,-6); assert.equal(extreme.clarityDb,3.5);
assert.equal(extreme.airDb,core.DEFAULTS.airDb); assert.equal(extreme.outputDb,core.DEFAULTS.outputDb);
assert.equal(extreme.compressor,false); assert.equal(extreme.detail,100); assert.equal(extreme.width,0);
assert.equal(extreme.reality,100); assert.equal(extreme.noiseReduction,0); assert.equal(extreme.spectralFill,100); assert.equal(extreme.hiResMode,true);
assert.equal(extreme.dapMode,core.DEFAULTS.dapMode); assert.equal(extreme.dapStrength,100);
assert.equal(extreme.selfDapEnabled,true); assert.equal(extreme.selfDapStrength,100); assert.equal(extreme.selfDapRestoration,"auto"); assert.equal(extreme.selfDapRestorationCutoffKhz,18); assert.equal(extreme.perspectiveEnabled,true); assert.equal(extreme.perspectiveDepth,100);

const zero = core.sanitizeSettings({bassDb:0,warmthDb:0,clarityDb:0,airDb:0,detail:0,width:0,reality:0,spectralFill:0,outputDb:0});
assert.equal(core.computeAutoHeadroomDb(zero),0);
const maxed = core.sanitizeSettings({bassDb:6,warmthDb:6,clarityDb:6,airDb:6,detail:100,width:100,reality:100,spectralFill:100,outputDb:6});
assert(core.computeAutoHeadroomDb(maxed) <= -10);
assert(core.computeEffectiveOutputDb(maxed) <= -4);

assert.deepEqual(core.widthToMatrix(0), {width:1,same:1,cross:0});
const wide = core.widthToMatrix(100); assert(wide.width <= 1.35 + 1e-9); assert(wide.cross < 0);
const fill = core.spectralFillGains(100); assert(fill.bodyDb <= 1.5 && fill.topDb <= 1.7);
assert(core.detailMixGain(100) <= 0.15);
const reality = core.realityMixGains(100); assert(reality.harmonic <= 0.06 && reality.reflection <= 0.07);
const curve = core.makeSoftSaturationCurve(4096,1.4); assert.equal(curve.length,4096); assert(Math.abs(curve[0]+1)<0.001); assert(Math.abs(curve[curve.length-1]-1)<0.001);


const dapOff=core.dapProfile("off",100); assert.equal(dapOff.harmonic,0); assert.equal(dapOff.crossfeed,0);
const dapRef=core.dapProfile("reference",100); assert(dapRef.harmonic<=0.011); assert(dapRef.crossfeed<=0.016);
const dapWarm=core.dapProfile("warm",100); assert(dapWarm.lowDb>0 && dapWarm.highDb<0); assert(dapWarm.harmonic<=0.036);
const dapNatural=core.dapProfile("natural",100); assert(dapNatural.crossfeed<=0.076 && dapNatural.crossfeed>dapWarm.crossfeed);
const dapTube=core.dapProfile("tube",100); assert(dapTube.harmonic<=0.061); assert(dapTube.preDb<0);
const headroomNoDap=core.computeAutoHeadroomDb({...core.DEFAULTS,dapMode:"off",dapStrength:0});
const headroomTube=core.computeAutoHeadroomDb({...core.DEFAULTS,dapMode:"tube",dapStrength:100});
assert(headroomTube<headroomNoDap);
const headroomSelf=core.computeAutoHeadroomDb({...core.DEFAULTS,selfDapEnabled:true,selfDapStrength:100}); assert(headroomSelf<headroomNoDap);

assert.equal(core.isYoutubeUrl("https://www.youtube.com/watch?v=1"),true);
assert.equal(core.isYoutubeUrl("https://youtube.com/shorts/1"),true);
assert.equal(core.isYoutubeUrl("http://www.youtube.com/watch?v=1"),false);
assert.equal(core.isYoutubeUrl("https://youtube.com.evil.example/watch"),false);

for (const [name,preset] of Object.entries(core.PRESETS)) {
  const s=core.sanitizeSettings({...preset,preset:name});
  assert(s.detail>=0&&s.detail<=100,name); assert(s.width>=0&&s.width<=100,name);
  assert(s.outputDb>=-12&&s.outputDb<=6,name); assert(core.DAP_MODES.includes(s.dapMode),name); assert(s.dapStrength>=0&&s.dapStrength<=100,name); assert(s.selfDapStrength>=0&&s.selfDapStrength<=100,name);
}
const sp=selfDap.profile(100); assert.equal(sp.sideHpfHz,100); assert(Math.abs(sp.sideDelaySeconds-0.0002)<1e-9); assert(sp.sideGainDb<=3.0); assert(sp.restorationWet<=0.25);
assert.equal(selfDap.restorationDecision("off",{}).active,false); assert.equal(selfDap.restorationDecision("on",{}).active,true);
const need=selfDap.restorationDecision("auto",{b12_14:-35,b14_16:-38,b16_18:-45,b18_20:-53,overall:-25}); assert.equal(need.active,true);
const intact=selfDap.restorationDecision("auto",{b12_14:-35,b14_16:-37,b16_18:-39,b18_20:-41,overall:-25}); assert.equal(intact.active,false);
const quiet=selfDap.restorationDecision("auto",{b14_16:-90,b16_18:-95,b18_20:-100,overall:-85}); assert.equal(quiet.active,false);

const pOff=core.perspectiveProfile(false,100); assert.equal(pOff.wet,0); assert.equal(pOff.directDb,0);
const pDepth=core.perspectiveProfile(true,100); assert(pDepth.wet<=0.120001); assert(pDepth.directDb>=-0.61); assert(pDepth.lowpassHz>=8900); assert(pDepth.predelaySeconds<=0.0131);
const headroomNoDepth=core.computeAutoHeadroomDb({...core.DEFAULTS,perspectiveEnabled:false,perspectiveDepth:100});
const headroomDepth=core.computeAutoHeadroomDb({...core.DEFAULTS,perspectiveEnabled:true,perspectiveDepth:100}); assert(headroomDepth<headroomNoDepth);
console.log("PASS dsp_logic_test advanced DSP + virtual DAP + self DAP + perspective");
