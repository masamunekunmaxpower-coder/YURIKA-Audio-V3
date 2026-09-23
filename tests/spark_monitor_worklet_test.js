"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const code=fs.readFileSync(path.join(root,"spark-monitor-worklet.js"),"utf8");
let Proc=null;
class AudioWorkletProcessor { constructor(){ this.messages=[]; this.port={postMessage:(m)=>this.messages.push(m)}; } }
const sandbox={AudioWorkletProcessor,sampleRate:48000,registerProcessor:(name,klass)=>{assert.equal(name,"yurika-spark-monitor");Proc=klass;},console,Math,Number};
vm.runInContext(code,vm.createContext(sandbox)); assert(Proc);
const p=new Proc();
function block(values){const input=Float32Array.from(values),out=new Float32Array(input.length);p.process([[input]],[[out]]);assert(out.every(v=>v===0));}
const N=128;
for(let b=0;b<6;b++) block(new Array(N).fill(0.8)); assert.equal(p.messages.length,0);
p.port.onmessage({data:{active:true}});
for(let b=0;b<120;b++) block(new Array(N).fill(0.035));
const baseline=p.messages.filter(m=>m.type==="spark").at(-1); assert(baseline&&baseline.pulse<0.12);
for(let b=0;b<3;b++){const a=new Array(N).fill(0.035);if(b===0){a[0]=0.95;a[1]=0.72;a[2]=0.48;}block(a);}
const hit=p.messages.filter(m=>m.type==="spark").at(-1); assert(hit.pulse>0.30); assert(hit.crest>1); assert(Number.isFinite(hit.discontinuity)); assert(Number.isFinite(hit.speechRatio)); assert(Number.isFinite(hit.breathRatio)); assert(Number.isFinite(hit.speechStability)); assert(Number.isFinite(hit.zcr));
for(let b=0;b<80;b++) block(new Array(N).fill(0.025));
const tail=p.messages.filter(m=>m.type==="spark").at(-1); assert(tail.pulse<hit.pulse); assert(Number.isFinite(tail.fastEnv)&&Number.isFinite(tail.slowEnv));
console.log("PASS spark_monitor_worklet_test fast attack + seam features + held release + zero-output side-chain");
