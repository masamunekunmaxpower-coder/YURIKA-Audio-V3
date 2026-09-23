"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const code=fs.readFileSync(path.join(root,"safety-meter-worklet.js"),"utf8");
let Proc=null;
class AudioWorkletProcessor { constructor(){ this.messages=[]; this.port={postMessage:(m)=>this.messages.push(m)}; } }
const sandbox={AudioWorkletProcessor,registerProcessor:(name,klass)=>{assert.equal(name,"yurika-safety-meter");Proc=klass;},console};
vm.runInContext(code,vm.createContext(sandbox));
assert(Proc);
const p=new Proc();
function runBlock(l,r){const outL=new Float32Array(l.length),outR=new Float32Array(r.length);p.process([[Float32Array.from(l),Float32Array.from(r)]],[[outL,outR]]);return [outL,outR];}
const N=128;
for(let b=0;b<40;b++){
  const l=[],r=[];for(let i=0;i<N;i++){const x=0.2*Math.sin((b*N+i)*0.03);l.push(x);r.push(x);}
  const [ol,or]=runBlock(l,r);assert(Math.abs(ol[10]-l[10])<1e-6);assert(Math.abs(or[20]-r[20])<1e-6);
}
assert(p.messages.length>=1);const m=p.messages[p.messages.length-1];
assert(m.peak>0.19&&m.peak<0.21);assert(m.rms>0.1);assert(m.correlation>0.999999);assert.equal(m.nonFiniteCount,0);
// Non-finite input is zeroed rather than propagated.
const bad=new Array(N).fill(0);bad[3]=NaN;bad[9]=Infinity;
let last;
for(let b=0;b<33;b++){last=runBlock(b===0?bad:new Array(N).fill(0.01),new Array(N).fill(0.01));}
assert(Number.isFinite(last[0][3]));
const reports=p.messages.filter(x=>x.type==="stats");assert(reports.some(x=>x.nonFiniteCount>=2));
console.log("PASS safety_meter_worklet_test passthrough + correlation + non-finite sanitization");
