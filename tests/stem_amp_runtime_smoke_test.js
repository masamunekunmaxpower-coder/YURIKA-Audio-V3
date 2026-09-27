"use strict";
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const root=path.resolve(__dirname,"..");
global.sampleRate=48000;
class AWP{constructor(){this.port={onmessage:null,messages:[],postMessage:(m)=>this.port.messages.push(m)}}}
global.AudioWorkletProcessor=AWP;
let registered={};global.registerProcessor=(n,c)=>registered[n]=c;
const load=(f)=>vm.runInThisContext(fs.readFileSync(path.join(root,f),"utf8"),{filename:f});
let seed=0x3401; const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};

load("stem-separator-worklet.js");
const Stem=registered["yurika-five-stem-separator"]; assert(Stem,"stem processor missing");
const stem=new Stem();let maxErr=0;
for(let b=0;b<80;b++){
  const L=new Float32Array(128),R=new Float32Array(128);
  for(let i=0;i<128;i++){const t=(b*128+i)/sampleRate;L[i]=0.35*Math.sin(2*Math.PI*90*t)+0.12*Math.sin(2*Math.PI*1000*t)+0.05*(rnd()*2-1);R[i]=0.33*Math.sin(2*Math.PI*90*t)+0.11*Math.sin(2*Math.PI*1000*t+0.1)+0.05*(rnd()*2-1);}
  const outputs=Array.from({length:5},()=>[new Float32Array(128),new Float32Array(128)]);
  stem.process([[L,R]],outputs);
  for(let i=0;i<128;i++){let sl=0,sr=0;for(let s=0;s<5;s++){sl+=outputs[s][0][i];sr+=outputs[s][1][i];}maxErr=Math.max(maxErr,Math.abs(sl-L[i]),Math.abs(sr-R[i]));}
}
assert(maxErr<2e-6,`stem reconstruction error ${maxErr}`);
assert(stem.port.messages.some(m=>m.type==="stem-runtime"),"missing stem runtime telemetry");

registered={};load("virtual-amp-worklet.js");
const Amp=registered["yurika-virtual-class-a"];assert(Amp,"amp processor missing");
const wasm=new WebAssembly.Module(fs.readFileSync(path.join(root,"virtual-amp-core.wasm")));
const amp=new Amp({processorOptions:{wasmModule:wasm}});
amp.port.onmessage({data:{type:"config",enabled:true,cubic:0.00006,noise:0.0000008*Math.pow(10,-12/20),crosstalk:0.000001,preGain:Math.pow(10,-12/20),postGain:Math.pow(10,12/20),headroomExtensionDb:12,opAmpEnabled:true,opAmpFeedback:0.42,opAmpDcServoHz:1.5,ratedPowerWPerChannel:8,maxPowerWPerChannel:12,p1dBReferenceDbfs:-0.75}});
for(let b=0;b<36;b++){const L=new Float32Array(128),R=new Float32Array(128);for(let i=0;i<128;i++){const t=(b*128+i)/sampleRate;L[i]=R[i]=0.4*Math.sin(2*Math.PI*1000*t);}const O=[new Float32Array(128),new Float32Array(128)];amp.process([[L,R]],[O]);}
const rt=amp.port.messages.filter(m=>m.type==="runtime").at(-1);assert(rt,"missing amp runtime");
assert(Number.isFinite(rt.estimatedPowerWPerChannel),"amp dynamic power unavailable");
assert(rt.p1dBEquivalentInputDbfs>10,"P1dB-equivalent headroom extension not applied");
assert(Number.isFinite(rt.runtimeSnrDb)&&Number.isFinite(rt.runtimeThdnEstimateDb),"dynamic S/N or THD+N estimate missing");
console.log("stem/amp runtime smoke: PASS",JSON.stringify({maxStemReconstructionError:maxErr,p1dBEquivalentInputDbfs:rt.p1dBEquivalentInputDbfs,estimatedPowerWPerChannel:rt.estimatedPowerWPerChannel,runtimeSnrDb:rt.runtimeSnrDb,runtimeThdnEstimateDb:rt.runtimeThdnEstimateDb}));
