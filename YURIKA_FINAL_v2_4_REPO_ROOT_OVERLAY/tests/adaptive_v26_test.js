"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const sb={globalThis:null,Math}; sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v26.js"),"utf8"),vm.createContext(sb));
const a=sb.YurikaAdaptiveV26; assert(a);

const base={seamNaturalizerEnabled:true,seamNaturalizerAmount:60,transientValleyEnabled:true,transientValleyAmount:50,deviceProfile:"stereo"};
assert.equal(a.deriveSeamConfidence({discontinuity:1,speechRatio:1,pulse:0.2,rms:0.1,crest:2}, {...base,seamNaturalizerEnabled:false}),0);
const splice=a.deriveSeamConfidence({discontinuity:0.85,speechRatio:0.82,pulse:0.16,rms:0.12,crest:2.1},base);
const drum=a.deriveSeamConfidence({discontinuity:0.85,speechRatio:0.08,pulse:0.92,rms:0.12,crest:7.5},base);
assert(splice>0.15); assert(drum<splice);

const valley=a.deriveValleyProfile(base,0.9,0);
assert(valley.active); assert(valley.depthDb>0&&valley.depthDb<=1.25); assert(valley.holdMs>=5&&valley.holdMs<=17);
const safe=a.deriveValleyProfile(base,0.9,1); assert.equal(safe.depthDb,0); assert.equal(safe.active,false);
const phone=a.deriveValleyProfile({...base,deviceProfile:"smartphone",transientValleyAmount:100},1,0); assert(phone.depthDb<=0.60+1e-9);

const healthy=a.computeOrbitHealth({safetyMeterExpected:true,safetyReportAgeMs:100,fastMonitorExpected:true,sparkReportAgeMs:30,sceneExpected:true,sceneTickAgeMs:55,nonFiniteCount:0,peak:0.7,limiterReductionDb:-0.1,effectiveGainErrorDb:0.01,contextState:"running",invalidNodeState:false});
assert.equal(healthy.score,100); assert.equal(a.desiredOrbitLevel(healthy.score),0);
const bad=a.computeOrbitHealth({safetyMeterExpected:true,safetyReportAgeMs:5000,fastMonitorExpected:true,sparkReportAgeMs:2000,sceneExpected:true,sceneTickAgeMs:1200,nonFiniteCount:5,peak:1.01,limiterReductionDb:-8,effectiveGainErrorDb:0.8,contextState:"suspended",invalidNodeState:true});
assert(bad.score<40); assert.equal(a.desiredOrbitLevel(bad.score),4);
console.log("PASS adaptive_v26_test seam discrimination + bounded valley + safety zero + orbit escalation");
