"use strict";
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');const root=path.resolve(__dirname,'..');
const code=['modular-core.js','dsp-core.js','self-dap-core.js','audio-modules.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(root,'offscreen.js'),'utf8')+'\nglobalThis.__state=()=>state;';
function next(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),1500);listener(msg,{},v=>{clearTimeout(t);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P(1);this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage(){},onmessage:null};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}disconnect(){}getFloatFrequencyData(a){a.fill(-45);}getFloatTimeDomainData(a){a.fill(0.1);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(i){return this.d[i];}}
class C{constructor(o={}){this.state='running';this.currentTime=1;this.sampleRate=o.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state='closed';}}
class W extends N{}
function mkStream(){const track={getSettings:()=>({channelCount:2}),addEventListener(){},stop(){}};return{getTracks:()=>[track],getAudioTracks:()=>[track]};}
(async()=>{
  let listener,now=1000,nextTimer=1;const intervals=new Map();const streams=[mkStream(),mkStream()];let si=0;
  const sb={console,Math,Float32Array,performance:{now:()=>now},Date:{now:()=>now},setTimeout,clearTimeout,setInterval:(fn)=>{const id=nextTimer++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),AudioContext:C,AudioWorkletNode:W,navigator:{mediaDevices:{getUserMedia:async()=>streams[si++]}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}},globalThis:null};sb.globalThis=sb;vm.runInContext(code,vm.createContext(sb));
  let r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:1,streamId:'a',deck:'A',revision:1,settings:{enabled:true,djEnabled:true,djCrossfader:-100,djAutoMixSeconds:1}});assert(r.ok&&r.deckAActive);
  r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:2,streamId:'b',deck:'B',revision:2,settings:{enabled:true,djEnabled:true,djCrossfader:-100,djAutoMixSeconds:1}});assert(r.ok&&r.deckBActive);
  r=await next(listener,{target:'offscreen',type:'AUTO_MIX',direction:'A_TO_B',seconds:1});assert(r.ok&&r.active&&r.target===100);
  r=await next(listener,{target:'offscreen',type:'STATUS'});assert(r.djAutoMixActive);assert(Math.abs(r.djCrossfader+100)<0.01);
  now=1500; for(const fn of [...intervals.values()]) fn(); r=await next(listener,{target:'offscreen',type:'STATUS'});assert(r.djAutoMixActive);assert(Math.abs(r.djCrossfader)<1,'halfway smoothstep should be centered');
  now=2001; for(const fn of [...intervals.values()]) fn(); r=await next(listener,{target:'offscreen',type:'STATUS'});assert.equal(r.djAutoMixActive,false);assert.equal(Math.round(r.djCrossfader),100);
  await next(listener,{target:'offscreen',type:'STOP'});
  console.log('PASS dj_auto_mix_runtime_test A->B equal-power automation reaches target and clears timer');
})().catch(e=>{console.error(e);process.exit(1);});
