"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const code=fs.readFileSync(path.resolve(__dirname,"..","safety-meter-worklet.js"),"utf8");
let Proc;class AudioWorkletProcessor{constructor(){this.messages=[];this.port={postMessage:m=>this.messages.push(m)};}}
const sb={AudioWorkletProcessor,registerProcessor:(n,c)=>Proc=c,console};vm.runInContext(code,vm.createContext(sb));
const p=new Proc();let seed=0x15051505;const rnd=()=>((seed=(1664525*seed+1013904223)>>>0)/0x100000000);
let injected=0;
for(let b=0;b<4000;b++){
  const n=128,L=new Float32Array(n),R=new Float32Array(n),oL=new Float32Array(n),oR=new Float32Array(n);
  for(let i=0;i<n;i++){
    let l=(rnd()*2-1)*0.95,r=(rnd()*2-1)*0.95;
    if((b*n+i)%77777===0){l=NaN;injected++;}
    if((b*n+i)%99991===0){r=Infinity;injected++;}
    L[i]=l;R[i]=r;
  }
  p.process([[L,R]],[[oL,oR]]);
  for(let i=0;i<n;i++){assert(Number.isFinite(oL[i]));assert(Number.isFinite(oR[i]));assert(Math.abs(oL[i])<=0.951);assert(Math.abs(oR[i])<=0.951);}
}
assert(p.messages.length>100);let faults=0;
for(const m of p.messages){assert(Number.isFinite(m.peak));assert(Number.isFinite(m.rms));if(m.correlation!==null)assert(m.correlation>=-1&&m.correlation<=1);faults+=m.nonFiniteCount;}
assert(faults>=injected-2);
console.log(`PASS safety_meter_stress_test 512000 stereo frames / ${p.messages.length} reports / nonfinite sanitized`);
