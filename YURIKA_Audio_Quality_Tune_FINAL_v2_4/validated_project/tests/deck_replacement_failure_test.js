"use strict";
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');const root=path.resolve(__dirname,'..');
const code=['modular-core.js','dsp-core.js','self-dap-core.js','audio-modules.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(root,'offscreen.js'),'utf8')+'\nglobalThis.__state=()=>state;';
function next(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),1500);listener(msg,{},v=>{clearTimeout(t);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P(1);this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage(){},onmessage:null};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}disconnect(){}getFloatFrequencyData(a){a.fill(-45);}getFloatTimeDomainData(a){a.fill(0.1);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(i){return this.d[i];}}
let sourceCalls=0,throwOnSourceCall=0;
class C{constructor(o={}){this.state='running';this.currentTime=1;this.sampleRate=o.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){sourceCalls++;if(sourceCalls===throwOnSourceCall)throw new Error('source build failed');return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state='closed';}}
class W extends N{}
function mkStream(name){let ended=null,stops=0;const track={getSettings:()=>({channelCount:2}),addEventListener:(type,fn)=>{if(type==='ended')ended=fn;},stop:()=>{stops++;}};return{name,getTracks:()=>[track],getAudioTracks:()=>[track],fireEnded:()=>ended&&ended(),stops:()=>stops};}
(async()=>{
 let listener;const a1=mkStream('a1'),a2=mkStream('a2');const streams=[a1,a2];let i=0;
 const sb={console,Date,Math,Float32Array,performance:{now:()=>1000},setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},AudioContext:C,AudioWorkletNode:W,navigator:{mediaDevices:{getUserMedia:async()=>streams[i++]}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}},globalThis:null};sb.globalThis=sb;vm.runInContext(code,vm.createContext(sb));
 let r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:1,streamId:'a1',deck:'A',revision:1,settings:{enabled:true,djEnabled:true,djCrossfader:-100}});assert(r.ok&&r.deckAActive);assert.equal(a1.stops(),0);
 // Fail while constructing the replacement source. Old Deck A must remain live and the failed new stream must be stopped.
 throwOnSourceCall=2;
 r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:2,streamId:'a2',deck:'A',revision:2,settings:{enabled:true,djEnabled:true,djCrossfader:0}});assert.equal(r.ok,false);
 r=await next(listener,{target:'offscreen',type:'STATUS'});assert(r.active&&r.deckAActive);assert.equal(sb.__state().streams.A.name,'a1');assert.equal(a1.stops(),0);assert.equal(a2.stops(),1);
 await next(listener,{target:'offscreen',type:'STOP'});
 console.log('PASS deck_replacement_failure_test failed replacement leaves old deck alive and disposes new stream');
})().catch(e=>{console.error(e);process.exit(1);});
