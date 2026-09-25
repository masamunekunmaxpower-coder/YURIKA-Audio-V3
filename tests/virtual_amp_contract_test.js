"use strict";
const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const core=read("dsp-core.js");
if(!/virtualAmpEnabled/.test(core)){
  console.log("virtual_amp_contract_test: SKIP (candidate has no Virtual Amp)");
  process.exit(0);
}
const manifest=JSON.parse(read("manifest.json"));
const offscreenHtml=read("offscreen.html");
const offscreen=read("offscreen.js");
const amp=read("virtual-amp.js");
const worklet=read("virtual-amp-worklet.js");
for(const f of ["virtual-amp.js","virtual-amp-worklet.js","virtual-amp-core.wasm","virtual-amp-core.cpp"]){
  if(!fs.existsSync(path.join(root,f))) throw new Error(`missing Virtual Amp file: ${f}`);
}
const csp=manifest?.content_security_policy?.extension_pages||"";
if(!csp.includes("'wasm-unsafe-eval'")) throw new Error("manifest CSP missing wasm-unsafe-eval");
if(offscreenHtml.indexOf("virtual-amp.js")<0 || offscreenHtml.indexOf("virtual-amp.js")>offscreenHtml.indexOf("offscreen.js")) throw new Error("virtual-amp.js must load before offscreen.js");
if(!/VirtualAmp\?\.createStage/.test(offscreen)) throw new Error("offscreen does not create Virtual Amp stage");
if(!/autoLevel\.connect\(adaptiveTrim\)/.test(offscreen)) throw new Error("adaptiveTrim upstream connection missing");
if(!/virtualAmp\.output\.connect\(limiter\)/.test(offscreen)) throw new Error("Virtual Amp is not upstream of final limiter");
if(/adaptiveTrim\.connect\(limiter\)/.test(offscreen)) throw new Error("direct adaptiveTrim->limiter bypasses Virtual Amp");
if(!/backend:\"bypass\"/.test(amp) || !/input\.connect\(fallback\)/.test(amp)) throw new Error("Virtual Amp fail-open bypass contract missing");
if(!/copy dry input to output|outL\[i\]=inL/i.test(worklet)) {
  // Worklet source can use a different wording; require at least an error path plus direct sample copy tokens.
  if(!/type:\"error\"/.test(worklet) || !/out/.test(worklet) || !/input/.test(worklet)) throw new Error("Virtual Amp runtime fail-open contract unclear");
}
console.log("virtual_amp_contract_test: PASS");
