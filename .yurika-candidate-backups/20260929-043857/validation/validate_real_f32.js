"use strict";
const fs=require('fs'),path=require('path'),{performance}=require('perf_hooks');
const root=path.resolve(__dirname,'..');require(path.join(root,'dart-detector','dart-detector-runtime.js'));
const raw=fs.readFileSync(process.argv[2]);const samples=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
const wasm=fs.readFileSync(path.join(root,'hires-hybrid-core.wasm'));const e=new WebAssembly.Instance(new WebAssembly.Module(wasm),{}).exports;
e.yurika_reset(96000);e.yurika_set_amount(.4);const input=new Float32Array(e.memory.buffer,e.yurika_input(),512),output=new Float32Array(e.memory.buffer,e.yurika_output(),512);const det=globalThis.YurikaDartDetectorRuntime.create();
let ss=0,n=0,peak=0,nonfinite=0,probe=0;let weights=[0,0,0],strategy=[0,0,0,0],drives=[0,0,0],times=[];const typeMap={tonal:0,transient:1,texture:2,ambience:3};
for(let pos=0;pos+256<=samples.length;pos+=256){for(let i=0;i<128;i++){input[i*2]=samples[pos+i*2];input[i*2+1]=samples[pos+i*2+1];}
 const t0=performance.now();e.yurika_process(128,2);times.push(performance.now()-t0);
 for(let i=0;i<128;i++)for(let c=0;c<2;c++){const x=input[i*2+c],y=output[i*2+c];if(!Number.isFinite(y))nonfinite++;const d=y-x;ss+=d*d;n++;peak=Math.max(peak,Math.abs(y));}
 if((++probe%4)===0){const p=det.process({rms:e.yurika_probe_rms(),peak:e.yurika_probe_peak(),diffRms:e.yurika_probe_diff_rms(),zeroCrossRate:e.yurika_probe_zcr(),sideRatio:e.yurika_probe_side_ratio(),sampleRate:96000,frames:512});const h=p.hierarchyWeights;e.yurika_set_detector(p.l1,p.l2,p.l3,p.confidence);e.yurika_set_hierarchy_weights(h.l1,h.l2,h.l3,p.confidence);e.yurika_clear_objects();for(let i=0;i<p.softObjects.length;i++){const o=p.softObjects[i],q=o.hierarchy;e.yurika_set_object(i,typeMap[o.type]??2,o.energy,o.confidence,q.l1,q.l2,q.l3);}e.yurika_commit_objects(p.softObjects.length);weights[0]+=h.l1;weights[1]+=h.l2;weights[2]+=h.l3;for(let k=0;k<4;k++)strategy[k]+=e.yurika_strategy(k);drives[0]+=e.yurika_bwe_drive();drives[1]+=e.yurika_sr_drive();drives[2]+=e.yurika_native_hf_ratio();}
}
const pc=Math.floor(probe/4),sorted=[...times].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];console.log(JSON.stringify({ok:nonfinite===0,seconds:samples.length/2/96000,deltaRms:Math.sqrt(ss/n),peak,nonfinite,probeCount:pc,meanHierarchy:weights.map(x=>x/pc),meanStrategy:strategy.map(x=>x/pc),meanBweDrive:drives[0]/pc,meanSrDrive:drives[1]/pc,meanNativeHfRatio:drives[2]/pc,processMs:{mean:times.reduce((a,b)=>a+b,0)/times.length,p95:q(.95),p99:q(.99),max:sorted.at(-1)}}));
