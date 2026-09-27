"use strict";
const fs=require("fs");
const vm=require("vm");
const path=require("path");
const ROOT=path.resolve(__dirname,"..");

global.sampleRate=48000;
global.AudioWorkletProcessor=class { constructor(){ this.port={onmessage:null,postMessage(){}}; } };
let Processor=null;
global.registerProcessor=(name,klass)=>{ if(name==="yurika-concert-hall") Processor=klass; };
vm.runInThisContext(fs.readFileSync(path.join(ROOT,"concert-hall-worklet.js"),"utf8"),{filename:"concert-hall-worklet.js"});
if(!Processor) throw new Error("concert hall processor not registered");
const p=new Processor();
p.cfg={...p.cfg,enabled:true,rt60:2.05,predelayMs:17,earlyMix:0.43,lateMix:0.57,dampingHz:7200,diffusion:0.88,width:1.08,wetTrim:0.92,geometry:"reference-shoebox"};
p._recalc();
const N=Math.round(5.5*sampleRate), y=new Float32Array(N); let at=0;
while(at<N){
  const n=Math.min(128,N-at), L=new Float32Array(n),R=new Float32Array(n),oL=new Float32Array(n),oR=new Float32Array(n);
  if(at===0){L[0]=1;R[0]=1;}
  p.process([[L,R]],[[oL,oR]]); y.set(oL,at); at+=n;
}
let peak=0,peakAt=0;for(let i=0;i<N;i++){const a=Math.abs(y[i]);if(!Number.isFinite(a))throw new Error("non-finite hall sample");if(a>peak){peak=a;peakAt=i;}}
const e=new Float64Array(N);let acc=0;for(let i=N-1;i>=0;i--){acc+=y[i]*y[i];e[i]=acc;}
const e0=Math.max(e[0],1e-30);let sx=0,sy=0,sxx=0,sxy=0,count=0;
for(let i=0;i<N;i++){
  const db=10*Math.log10(Math.max(e[i]/e0,1e-30));
  if(db<=-5 && db>=-35){const t=i/sampleRate;sx+=t;sy+=db;sxx+=t*t;sxy+=t*db;count++;}
}
const den=count*sxx-sx*sx; const slope=den? (count*sxy-sx*sy)/den : 0; const rt60=slope<0 ? -60/slope : Infinity;
if(!(peakAt/sampleRate*1000>25 && peakAt/sampleRate*1000<90)) throw new Error(`unexpected wet onset/peak ${peakAt/sampleRate*1000} ms`);
if(!(rt60>=1.70 && rt60<=2.40)) throw new Error(`RT60 proxy out of target window: ${rt60}`);
if(!(peak<0.5)) throw new Error(`wet impulse peak too high: ${peak}`);
console.log("concert hall worklet simulation: PASS",JSON.stringify({peak:Number(peak.toFixed(6)),wetPeakMs:Number((peakAt/sampleRate*1000).toFixed(3)),rt60Proxy:Number(rt60.toFixed(3)),samples:N}));
