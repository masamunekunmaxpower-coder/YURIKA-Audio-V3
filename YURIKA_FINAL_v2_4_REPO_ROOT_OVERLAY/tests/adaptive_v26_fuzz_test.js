"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const sb={globalThis:null,Math}; sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v26.js"),"utf8"),vm.createContext(sb));
const a=sb.YurikaAdaptiveV26; assert(a);
const devices=["headphone","stereo","smartphone","tv","portable","multispeaker"];
let maxValley=0;
for(let i=0;i<100000;i++){
  const settings={
    seamNaturalizerEnabled:Math.random()>.1,
    seamNaturalizerAmount:Math.random()*140-20,
    transientValleyEnabled:Math.random()>.1,
    transientValleyAmount:Math.random()*140-20,
    deviceProfile:devices[i%devices.length]
  };
  const report={
    discontinuity:Math.random()*1.5-.25,
    speechRatio:Math.random()*1.5-.25,
    pulse:Math.random()*1.5-.25,
    rms:Math.random()*.8,
    crest:Math.random()*12
  };
  const seam=a.deriveSeamConfidence(report,settings);
  assert(Number.isFinite(seam)&&seam>=0&&seam<=1);
  const pressure=Math.random()*1.4-.2;
  const v=a.deriveValleyProfile(settings,report.pulse,pressure);
  assert(Number.isFinite(v.depthDb)&&v.depthDb>=0);
  const cap=a.DEVICE_VALLEY_MAX_DB[settings.deviceProfile];
  assert(v.depthDb<=cap+1e-9);
  if(pressure>=1) assert.equal(v.depthDb,0);
  maxValley=Math.max(maxValley,v.depthDb);
  const h=a.computeOrbitHealth({
    safetyMeterExpected:Math.random()>.2,safetyReportAgeMs:Math.random()*8000,
    fastMonitorExpected:Math.random()>.2,sparkReportAgeMs:Math.random()*3000,
    sceneExpected:Math.random()>.2,sceneTickAgeMs:Math.random()*1600,
    nonFiniteCount:Math.floor(Math.random()*7),peak:Math.random()*1.05,
    limiterReductionDb:-Math.random()*10,effectiveGainErrorDb:Math.random()*.8-.4,
    timerDriftMs:Math.random()*4000,contextState:Math.random()>.95?"suspended":"running",
    invalidNodeState:Math.random()>.98
  });
  assert(Number.isFinite(h.score)&&h.score>=0&&h.score<=100);
  const level=a.desiredOrbitLevel(h.score); assert(Number.isInteger(level)&&level>=0&&level<=4);
}
console.log(`PASS adaptive_v26_fuzz_test 100000 cases maxValley=${maxValley.toFixed(4)}dB`);
