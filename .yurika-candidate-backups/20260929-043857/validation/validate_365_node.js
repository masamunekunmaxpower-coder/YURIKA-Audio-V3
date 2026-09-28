"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"..");
require(path.join(root,"dart-detector","dart-detector-runtime.js"));
const bytes=fs.readFileSync(path.join(root,"hires-hybrid-core.wasm"));
function inst(){return new WebAssembly.Instance(new WebAssembly.Module(bytes),{}).exports;}
function finite(x){return Number.isFinite(x);}
function runProfile(w){
  const e=inst();e.yurika_reset(96000);e.yurika_set_amount(.4);e.yurika_set_detector(.35,.55,.45,.9);e.yurika_set_hierarchy_weights(w[0],w[1],w[2],.95);
  const input=new Float32Array(e.memory.buffer,e.yurika_input(),512),output=new Float32Array(e.memory.buffer,e.yurika_output(),512);
  let ss=0,pk=0;
  for(let i=0;i<128;i++){let x=.22*Math.sin(2*Math.PI*997*i/96000)+(i===24?.55:0);input[i*2]=x;input[i*2+1]=x*.97;}
  e.yurika_process(128,2);
  for(let i=0;i<128;i++){for(let c=0;c<2;c++){const y=output[i*2+c];assert(finite(y));const x=input[i*2+c],d=y-x;ss+=d*d;pk=Math.max(pk,Math.abs(y));}}
  return {deltaRms:Math.sqrt(ss/256),peak:pk,nonfinite:e.yurika_nonfinite_count()};
}
const e=inst();
for(const name of ["yurika_set_hierarchy_weights","yurika_hierarchy_weight","yurika_hierarchy_confidence"])assert.equal(typeof e[name],"function",name);
e.yurika_reset(96000);
let input=new Float32Array(e.memory.buffer,e.yurika_input(),512),output=new Float32Array(e.memory.buffer,e.yurika_output(),512);
for(let i=0;i<256;i++)input[i]=0;e.yurika_process(128,2);for(let i=0;i<256;i++)assert.equal(output[i],0);
input[0]=NaN;input[1]=Infinity;e.yurika_process(1,2);assert(finite(output[0])&&finite(output[1]));
const p1=runProfile([1,0,0]),p2=runProfile([0,1,0]),p3=runProfile([0,0,1]);
assert(Math.max(p1.deltaRms,p2.deltaRms,p3.deltaRms)-Math.min(p1.deltaRms,p2.deltaRms,p3.deltaRms)>1e-8,"hierarchy profiles collapsed");
const d=globalThis.YurikaDartDetectorRuntime.create();let pkt;
for(let i=0;i<600;i++)pkt=d.process({rms:.12,peak:.28,diffRms:.014,zeroCrossRate:.03,sideRatio:.2,sampleRate:96000,frames:512});
const ws=pkt.hierarchyWeights.l1+pkt.hierarchyWeights.l2+pkt.hierarchyWeights.l3;
assert(Math.abs(ws-1)<1e-6);assert(pkt.dominantIndex>=1&&pkt.dominantIndex<=3);assert(pkt.softObjects.length===4);
const a=globalThis.YurikaDartDetectorRuntime.create(),b=globalThis.YurikaDartDetectorRuntime.create();
let pa,pb;for(let i=0;i<400;i++){const m={rms:.10+.02*Math.sin(i*.07),peak:.32,diffRms:.012,zeroCrossRate:.035,sideRatio:.25};pa=a.process({...m,sampleRate:96000,frames:512});pb=b.process({...m,sampleRate:48000,frames:256});}
const rateDiff=Math.max(Math.abs(pa.hierarchyWeights.l1-pb.hierarchyWeights.l1),Math.abs(pa.hierarchyWeights.l2-pb.hierarchyWeights.l2),Math.abs(pa.hierarchyWeights.l3-pb.hierarchyWeights.l3));
assert(rateDiff<1e-9,"rate-aware time constant mismatch");
console.log(JSON.stringify({ok:true,profiles:{L1:p1,L2:p2,L3:p3},detector:{dominantIndex:pkt.dominantIndex,hierarchyWeights:pkt.hierarchyWeights,confidence:pkt.confidence},rateAwareMaxWeightDiff:rateDiff}));
