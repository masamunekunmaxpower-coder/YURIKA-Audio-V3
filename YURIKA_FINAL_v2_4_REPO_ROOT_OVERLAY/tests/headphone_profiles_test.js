"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");const sb={globalThis:null};sb.globalThis=sb;
vm.runInContext(fs.readFileSync(path.join(root,"headphone-profiles.js"),"utf8"),vm.createContext(sb));const h=sb.YurikaHeadphoneProfiles;assert(h);
for(const id of ["generic-neutral","sennheiser-hd600","sony-wh1000xm5"]){const p=h.getProfile(id);assert(p);assert(Number.isFinite(p.preampDb));assert(p.filters.length<=10);for(const f of p.filters){assert(["lowshelf","highshelf","peaking"].includes(f.type));assert(f.frequency>=20&&f.frequency<=20000);assert(Math.abs(f.gain)<=8);assert(f.q>0&&f.q<7);}}
assert.equal(h.getProfile("no-such-model").label,"Generic / No model correction");
assert.equal(h.matchOutputLabel("Headphones (WH-1000XM5 Stereo)").profileId,"sony-wh1000xm5");
assert.equal(h.matchOutputLabel("Sennheiser HD 600").profileId,"sennheiser-hd600");
assert.equal(h.matchOutputLabel("Mystery USB DAC").profileId,"generic-neutral");
console.log("PASS headphone_profiles_test bounded embedded exact-model profile registry + safe unknown fallback");
