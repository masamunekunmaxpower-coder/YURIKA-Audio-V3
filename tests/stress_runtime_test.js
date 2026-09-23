"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modular=fs.readFileSync(path.join(root,"modular-core.js"),"utf8"), core=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8"), modules=fs.readFileSync(path.join(root,"audio-modules.js"),"utf8"), self=fs.readFileSync(path.join(root,"self-dap-core.js"),"utf8"), off=fs.readFileSync(path.join(root,"offscreen.js"),"utf8");
function next(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),3000);listener(msg,{},v=>{clearTimeout(t);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P();this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage:()=>{}};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}getFloatFrequencyData(a){a.fill(-45);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(c){return this.d[c];}}
class C{constructor(opts={}){this.state='running';this.currentTime=0;this.sampleRate=opts.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state='closed';}}
class AW extends N{}
(async()=>{
 let listener,stopCount=0; const mkStream=()=>{const track={stop:()=>stopCount++,addEventListener:()=>{},getSettings:()=>({channelCount:2})};return{getTracks:()=>[track],getAudioTracks:()=>[track]};};
 const sandbox={console,Float32Array,Date,performance:{now:()=>1000},setTimeout:(fn)=>{fn();return 1;},clearTimeout:()=>{},setInterval:()=>123,clearInterval:()=>{},AudioContext:C,AudioWorkletNode:AW,navigator:{mediaDevices:{getUserMedia:async()=>mkStream()}},globalThis:null,chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}}}; sandbox.globalThis=sandbox;
 vm.runInContext(`${modular}\n${core}\n${self}\n${modules}\n${off}`,vm.createContext(sandbox));
 for(let i=1;i<=200;i++){
   const st=await next(listener,{target:'offscreen',type:'START',tabId:1,streamId:'s'+i,revision:i*10000,settings:{enabled:true,selfDapEnabled:i%2===0,perspectiveEnabled:i%3===0,perspectiveDepth:i%101,dapMode:i%2?'natural':'off',dapStrength:i%101}}); assert.equal(st.ok,true);
   const en=await next(listener,{target:'offscreen',type:'STOP'}); assert.equal(en.active,false);
 }
 const baseRev=2000000;
 await next(listener,{target:'offscreen',type:'START',tabId:1,streamId:'final',revision:baseRev,settings:{enabled:true,selfDapEnabled:true,perspectiveEnabled:true,perspectiveDepth:20}});
 for(let i=1;i<=5000;i++){
   const r=baseRev+i;
   const u=await next(listener,{target:'offscreen',type:'UPDATE_SETTINGS',revision:r,settings:{detail:i%101,perspectiveDepth:(i*7)%101,selfDapRestorationCutoffKhz:9+(i%10)}}); assert.equal(u.applied,true); assert.equal(u.settingsRevision,r);
   if(i%25===0){const stale=await next(listener,{target:'offscreen',type:'UPDATE_SETTINGS',revision:r-1,settings:{perspectiveEnabled:false}});assert.equal(stale.stale,true);}
 }
 const status=await next(listener,{target:'offscreen',type:'STATUS'}); assert.equal(status.settingsRevision,baseRev+5000); assert.equal(status.perspectiveEnabled,true); assert(status.selfDapRestorationCutoffKhz>=9&&status.selfDapRestorationCutoffKhz<=18);
 await next(listener,{target:'offscreen',type:'STOP'}); assert(stopCount>=201);
 console.log('PASS stress_runtime_test 200 start/stop cycles + 5000 revisions + stale rejection');
})().catch(e=>{console.error(e);process.exit(1);});
