"use strict";
const fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const exists=(f)=>fs.existsSync(path.join(root,f));
if(!exists("spatial-device-profiles.js")||!exists("spatial-engine.js")){console.log("remote_mobile_contract_test: SKIP (candidate has no Spatial ecosystem)");process.exit(0);}
for(const f of ["dsp-core.js","spatial-device-profiles.js","spatial-engine.js"]) vm.runInThisContext(fs.readFileSync(path.join(root,f),"utf8"),{filename:f});
const C=globalThis.YurikaAudioCore,P=globalThis.YurikaSpatialDeviceProfiles,E=globalThis.YurikaSpatialEngine;
const a=(x,m)=>{if(!x)throw new Error(m)};
if(!Object.prototype.hasOwnProperty.call(C.DEFAULTS,"spatialOutputTarget")){console.log("remote_mobile_contract_test: SKIP (pre remote-mobile candidate)");process.exit(0);}
const s=C.sanitizeSettings({...C.DEFAULTS,spatialEnabled:true,spatialOutputTarget:"sonobus-mobile-headphones"});
const r=P.resolve({requestedProfile:"auto",outputTarget:s.spatialOutputTarget,label:"CABLE Input",legacyDeviceProfile:"stereo"});
a(r.profileId==="sonobus-mobile-binaural","remote target profile missing");
const p=E.computeParameters(s,{resolved:r,sampleRate:48000,inputChannels:2,scene:{}});
a(p.remoteBinaural===true,"remote target not binaural");a(p.sideDelaySeconds<0.001,"remote cue delay too large");a(p.earlyReflection<=0.010,"remote reflection too large");
const ss=C.sanitizeSettings({...C.DEFAULTS,spatialEnabled:true,spatialOutputTarget:"sonobus-mobile-speaker"});
const rs=P.resolve({requestedProfile:"auto",outputTarget:ss.spatialOutputTarget,label:"",legacyDeviceProfile:"stereo"});
const ps=E.computeParameters(ss,{resolved:rs,sampleRate:48000,inputChannels:2,scene:{}});
a(ps.hrtfStatus==="not-applicable","speaker target must not use HRTF");
console.log("remote_mobile_contract_test: PASS");
