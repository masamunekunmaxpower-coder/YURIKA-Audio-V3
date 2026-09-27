"use strict";
const fs=require('fs'),vm=require('vm'),path=require('path');
let ProcessorClass=null;
class AudioWorkletProcessor { constructor(){this.port={onmessage:null,postMessage:(m)=>{this._last=m;}};} }
const sandbox={AudioWorkletProcessor,sampleRate:48000,registerProcessor:(name,cls)=>{if(name==='yurika-r5-reality-resolution')ProcessorClass=cls;},Math,Number,Float64Array};
vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../reality-resolution-worklet.js'),'utf8'),sandbox);
if(!ProcessorClass)throw new Error('processor not registered');
function run(enabled,amount=0.55){
  const p=new ProcessorClass(); p.port.onmessage({data:{type:'config',enabled,amount,mode:'auto',reportEveryBlocks:8}});
  let maxErr=0,maxDelta=0,finite=true,last=null;
  p.port.postMessage=(m)=>{last=m;};
  let phase=0;
  for(let b=0;b<32;b++){
    const L=new Float32Array(128),R=new Float32Array(128),oL=new Float32Array(128),oR=new Float32Array(128);
    for(let i=0;i<128;i++){
      const n=b*128+i,t=n/48000;
      const env=0.35+0.65*Math.min(1,(n%900)/180);
      const breath=0.018*Math.sin(2*Math.PI*7331*t+0.4*Math.sin(2*Math.PI*5.2*t));
      const s=env*(0.22*Math.sin(2*Math.PI*191*t)+0.08*Math.sin(2*Math.PI*382*t+0.2*Math.sin(2*Math.PI*4.1*t)))+breath;
      L[i]=s;R[i]=s*0.995+0.004*Math.sin(2*Math.PI*311*t);
    }
    p.process([[L,R]],[[oL,oR]]);
    for(let i=0;i<128;i++){
      finite=finite&&Number.isFinite(oL[i])&&Number.isFinite(oR[i]);
      maxDelta=Math.max(maxDelta,Math.abs(oL[i]-L[i]),Math.abs(oR[i]-R[i]));
      if(!enabled)maxErr=Math.max(maxErr,Math.abs(oL[i]-L[i]),Math.abs(oR[i]-R[i]));
    }
  }
  return {maxErr,maxDelta,finite,last};
}
const off=run(false,0.8); const on=run(true,0.55);
console.log({off,on});
if(!off.finite||!on.finite)throw new Error('non-finite output');
if(off.maxErr>1e-7)throw new Error(`bypass not identity: ${off.maxErr}`);
if(!(on.maxDelta>1e-8&&on.maxDelta<0.08))throw new Error(`unexpected injection: ${on.maxDelta}`);
if(!on.last||on.last.algorithmicLatencyFrames!==0)throw new Error('latency contract failed');
if(on.last.frequencyBandFeaturesUsed!==false||on.last.lostInformationRecoveredGuaranteed!==false)throw new Error('claim contract failed');
console.log('PASS R5 reality worklet simulation');
