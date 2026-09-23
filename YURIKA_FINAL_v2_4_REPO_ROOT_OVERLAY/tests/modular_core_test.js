"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,".."); const sandbox={console,globalThis:null};sandbox.globalThis=sandbox;
vm.runInContext(fs.readFileSync(path.join(root,"modular-core.js"),"utf8"),vm.createContext(sandbox));
vm.runInContext(fs.readFileSync(path.join(root,"dsp-core.js"),"utf8"),sandbox);
const M=sandbox.YurikaModularCore,C=sandbox.YurikaAudioCore;
const s=C.sanitizeSettings({...C.DEFAULTS,bassDb:1.23,detail:33.37,dacMatrixStrength:47.25,roomAmount:19.75,djCrossfader:-12.34,cartridgeAGainDb:0.37});
assert.equal(s.bassDb,1.23);assert.equal(s.detail,33.37);assert.equal(s.dacMatrixStrength,47.25);assert.equal(s.djCrossfader,-12.34);assert.equal(s.cartridgeAGainDb,0.37);
for(const mode of M.DAC_MATRIX_MODES){const p=M.dacMatrixProfile(mode,100,40,35,25);for(const k of ['lowDb','presenceDb','highDb','harmonic','preDb','drive','cutoffHz','q'])assert(Number.isFinite(p[k]),`${mode} ${k}`);assert(p.harmonic>=0&&p.harmonic<0.1);}
for(const mode of M.ROOM_MODES){const p=M.roomProfile(mode,100);assert(p.wet>=0&&p.wet<=0.07);assert(p.predelaySeconds>=0&&p.predelaySeconds<0.1);}
for(const mode of M.INTEGRITY_MODES){const p=M.integrityProfile(mode,100);assert(p.dcBlockHz>=0&&p.dcBlockHz<=5);}
const cp=M.cartridgeProfile(23000,220,0.3);assert(cp.highShelfDb>=-2&&cp.highShelfDb<=1.2);assert(cp.resonanceHz>=5500&&cp.resonanceHz<=14500);
const mix=M.cartridgeMixGains(100,100,100);assert(Math.abs(mix.a+mix.b+mix.c-1)<1e-12);
for(const x of [-100,-50,0,50,100]){const f=M.equalPowerCrossfade(x);assert(Math.abs(f.a*f.a+f.b*f.b-1)<1e-12);}
for(const profile of ['quiet','reference','dj','custom'])assert(M.autoLevelTarget(profile,-18)>=-30&&M.autoLevelTarget(profile,-18)<=-12);
assert.equal(M.autoLevelCorrection({measuredDbfs:-40,targetDbfs:-16}),6);assert.equal(M.autoLevelCorrection({measuredDbfs:-5,targetDbfs:-20}),-12);
for(let i=0;i<20000;i++){
 const r=()=>Math.random()*400-150; const p=M.dacMatrixProfile('fusion',r(),r(),r(),r()); assert(Number.isFinite(p.drive)&&p.drive>=1&&p.drive<2);
 const f=M.equalPowerCrossfade(r());assert(f.a>=0&&f.a<=1&&f.b>=0&&f.b<=1);
 const c=M.cartridgeProfile(r()*1000,r()*10,r());assert(Number.isFinite(c.highShelfDb)&&Number.isFinite(c.resonanceHz));
}

assert.equal(M.composeEffectiveLevelDb({autoLevelEnabled:true,autoLevelDb:2,sparkEnabled:true,sparkMakeupDb:0.4}),2.4);
assert.equal(M.composeEffectiveLevelDb({autoLevelEnabled:false,autoLevelDb:6,sparkEnabled:true,sparkMakeupDb:0.4}),0.4);
assert.equal(M.composeEffectiveLevelDb({autoLevelEnabled:true,autoLevelDb:2,sparkEnabled:true,sparkMakeupDb:-4}),2);
assert.equal(M.composeEffectiveLevelDb({autoLevelEnabled:true,autoLevelDb:6,sparkEnabled:true,sparkMakeupDb:0.8}),6.8);
console.log('PASS modular_core_test decimal precision + DAC/room/integrity/cartridge/autolevel/DJ invariants + 20k fuzz');
