"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");let Processor=null;
class AWP{constructor(){this.port={onmessage:null,postMessage:(m)=>{this.last=m;}};}}
const sb={AudioWorkletProcessor:AWP,registerProcessor:(n,c)=>{Processor=c;},sampleRate:48000,Float32Array,Math,console};
vm.runInContext(fs.readFileSync(path.join(root,"spatial-metrics-worklet.js"),"utf8"),vm.createContext(sb));
assert(Processor);const p=new Processor();p.reportEveryBlocks=4;
function feed(delay=0,gainR=1,invert=false){
  let last=null;p.port.postMessage=(m)=>last=m;
  for(let b=0;b<12;b++){
    const L=new Float32Array(128),R=new Float32Array(128);
    for(let i=0;i<128;i++){const t=b*128+i;const x=Math.sin(2*Math.PI*997*t/48000)+0.31*Math.sin(2*Math.PI*2303*t/48000);L[i]=x;const td=t-delay;const y=td>=0?(Math.sin(2*Math.PI*997*td/48000)+0.31*Math.sin(2*Math.PI*2303*td/48000)):0;R[i]=(invert?-1:1)*gainR*y;}
    p.process([[L,R]],[[new Float32Array(128)] ]);
  }
  return last;
}
let m=feed(12,0.5,false);assert(m&&m.type==="spatial");assert(Math.abs(Math.abs(m.itdMs)-0.25)<0.08,`itd ${m.itdMs}`);assert(Math.abs(m.ildDb-6.02)<0.8,`ild ${m.ildDb}`);assert(m.iacc>0.90);assert(m.iaccSigned>0.80);assert(m.hrtfCueConsistency>=0&&m.hrtfCueConsistency<=100);
const p2=new Processor();p2.reportEveryBlocks=4;let inv=null;p2.port.postMessage=m=>inv=m;for(let b=0;b<12;b++){const L=new Float32Array(128),R=new Float32Array(128);for(let i=0;i<128;i++){const t=b*128+i,x=Math.sin(2*Math.PI*733*t/48000);L[i]=x;R[i]=-x;}p2.process([[L,R]],[[new Float32Array(128)]]);}assert(inv.iacc>0.95);assert(inv.iaccSigned<-.95);assert(inv.hrtfCueConsistency<100);
console.log("PASS spatial_metrics_worklet_test ITD + ILD + abs-IACC + polarity/HRTF cue guard");
