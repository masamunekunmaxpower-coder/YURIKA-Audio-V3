"use strict";
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const core=read('dsp-core.js'), off=read('offscreen.js'), html=read('offscreen.html'), worklet=read('reality-resolution-worklet.js'), mgr=read('reality-resolution.js');
const checks=[
  ['core settings', /r5RealityEnabled/.test(core)&&/r5RealityAmount/.test(core)&&/r5RealityMode/.test(core)],
  ['module wired', /reality-resolution\.js/.test(html)&&/YurikaRealityResolution/.test(off)],
  ['stage between stems and voice material', /StemSeparator\.createStage[\s\S]*RealityResolution\.createStage[\s\S]*createVoiceMaterialStage\(ctx, realityResolution\.output\)/.test(off)],
  ['fifth order bounded feature gate', /featureSum[\s\S]*p5[\s\S]*confidence/.test(worklet)&&/raw audio transfer curve/.test(worklet)],
  ['zero lookahead', /algorithmicLatencyFrames:0/.test(worklet)&&/algorithmicLatencyFrames:0/.test(mgr)],
  ['no semantic perfect recovery claim', /lostInformationRecoveredGuaranteed:false/.test(worklet)&&/frequencyBandFeaturesUsed:false/.test(worklet)],
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
