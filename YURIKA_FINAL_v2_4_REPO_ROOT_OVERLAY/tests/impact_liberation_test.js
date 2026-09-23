"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const sb={globalThis:null,Date,Math,Float32Array}; sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"scene-engine.js"),"utf8"),vm.createContext(sb));
const e=sb.YurikaSceneEngine; assert(e);
const baseSettings={sparkEnabled:true,sparkAmount:45,impactEnabled:true,impactAmount:65,deviceProfile:"stereo",compressor:true,roomEnabled:true,selfDapEnabled:true,reality:60};
const d=e.deriveFastSparkDelta(baseSettings,0.75);
assert(d.impactGain>0.08 && d.impactGain<0.20,`unexpected default impact ${d.impactGain}`);
assert(d.compressorEscape>0.4 && d.compressorEscape<=0.92);
const base={width:40,detail:55,reality:60};
const t=e.composeFastSparkTargets(base,d,"stereo",0);
assert(t.impactGain>0); assert(t.compressorEscape>0);
const safe=e.composeFastSparkTargets(base,d,"stereo",1);
assert.equal(safe.impactGain,0); assert.equal(safe.compressorEscape,0);
const off=e.deriveFastSparkDelta({...baseSettings,impactEnabled:false},0.9);
assert.equal(off.impactGain,0); assert.equal(off.compressorEscape,0);
const noSpark=e.deriveFastSparkDelta({...baseSettings,sparkEnabled:false},1);
assert.equal(noSpark.impactGain,0); assert.equal(noSpark.compressorEscape,0);
const caps={headphone:0.20,stereo:0.24,smartphone:0.075,tv:0.14,portable:0.09,multispeaker:0.24};
for(const [device,cap] of Object.entries(caps)){
  for(let i=0;i<=1000;i++){
    const pulse=i/1000;
    const delta=e.deriveFastSparkDelta({...baseSettings,deviceProfile:device,sparkAmount:100,impactAmount:100},pulse);
    assert(delta.impactGain>=0 && delta.impactGain<=cap+1e-12,`${device} cap`);
    for(const pressure of [0,.25,.5,.75,1]){
      const target=e.composeFastSparkTargets(base,delta,device,pressure);
      assert(target.impactGain>=0 && target.impactGain<=cap+1e-12);
      assert(target.compressorEscape>=0 && target.compressorEscape<=.92+1e-12);
      if(pressure===1){assert.equal(target.impactGain,0);assert.equal(target.compressorEscape,0);}
    }
  }
}
console.log("PASS impact_liberation_test 6 devices x 1001 pulses x pressure sweep + off/kill invariants");
