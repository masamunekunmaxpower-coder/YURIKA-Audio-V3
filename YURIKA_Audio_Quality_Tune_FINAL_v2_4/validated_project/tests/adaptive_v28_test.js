"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");const root=path.resolve(__dirname,"..");const sb={globalThis:null,Math};sb.globalThis=sb;vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v28.js"),"utf8"),vm.createContext(sb));const a=sb.YurikaAdaptiveV28;assert(a);
assert.equal(a.cpuProfile(2).maxSessions,1);assert.equal(a.cpuProfile(4).maxSessions,2);assert.equal(a.cpuProfile(8).maxSessions,3);assert.equal(a.cpuProfile(16).maxSessions,4);
const rp=a.reflectionProfile({reflectionCharacterEnabled:true,reflectionCharacterAmount:100,reflectionCharacterMode:"lively"},{pulse:1,speechRatio:.1,seamConfidence:0},0);assert(rp.active);assert(rp.wet<=.058+1e-9);assert.equal(rp.taps.length,3);const safe=a.reflectionProfile({reflectionCharacterEnabled:true,reflectionCharacterAmount:100},{pulse:1},1);assert.equal(safe.wet,0);
const loc=a.localizationProxy({itdMs:.3,ildDb:4,iacc:.8});assert(loc.cueErrorDeg>=0&&loc.consistencyScore>=0&&loc.consistencyScore<=100);assert(a.spatialReportBlocks(48000,80)>=4);
console.log("PASS adaptive_v28_test cpu tiers + bounded reflection + localization cue proxy");
