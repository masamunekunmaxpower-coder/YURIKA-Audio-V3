"use strict";
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');const root=path.resolve(__dirname,'..');
const code=['modular-core.js','dsp-core.js','self-dap-core.js','audio-modules.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(root,'offscreen.js'),'utf8')+'\nglobalThis.__state=()=>state;';
function next(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),1500);listener(msg,{},v=>{clearTimeout(t);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P(1);this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage(){},onmessage:null};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}disconnect(){}getFloatFrequencyData(a){a.fill(-45);}getFloatTimeDomainData(a){a.fill(0.1);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(i){return this.d[i];}}
class C{constructor(o={}){this.state='running';this.currentTime=1;this.sampleRate=o.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state='closed';}}
class W extends N{}
function mkStream(name){let ended=null,stops=0;const track={getSettings:()=>({channelCount:2}),addEventListener:(type,fn)=>{if(type==='ended')ended=fn;},stop:()=>{stops++;}};return{name,getTracks:()=>[track],getAudioTracks:()=>[track],fireEnded:()=>ended&&ended(),stops:()=>stops};}
(async()=>{
 let listener;const streams=[mkStream('a1'),mkStream('b1'),mkStream('a2'),mkStream('ext')];let i=0;
 const sb={console,Date,Math,Float32Array,performance:{now:()=>1000},setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},AudioContext:C,AudioWorkletNode:W,navigator:{mediaDevices:{getUserMedia:async()=>streams[i++]}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}},globalThis:null};sb.globalThis=sb;vm.runInContext(code,vm.createContext(sb));
 let r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:1,streamId:'a1',deck:'A',revision:1,settings:{enabled:true,djEnabled:true,djCrossfader:0}});assert(r.ok&&r.deckAActive&&!r.deckBActive&&r.inputMode==='dj');
 r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:2,streamId:'b1',deck:'B',revision:2,settings:{enabled:true,djEnabled:true,djCrossfader:0}});assert(r.ok&&r.deckAActive&&r.deckBActive);
 r=await next(listener,{target:'offscreen',type:'ADD_DECK',tabId:3,streamId:'a2',deck:'A',revision:3,settings:{enabled:true,djEnabled:true,djCrossfader:25}});assert(r.ok&&r.deckAActive&&r.deckBActive);assert.equal(streams[0].stops(),1);
 streams[0].fireEnded(); await new Promise(res=>setTimeout(res,5)); r=await next(listener,{target:'offscreen',type:'STATUS'});assert(r.deckAActive&&r.deckBActive,'stale ended event must not kill replacement deck');
 r=await next(listener,{target:'offscreen',type:'STOP_DECK',deck:'A'});assert(r.active&&r.deckBActive&&!r.deckAActive);
 r=await next(listener,{target:'offscreen',type:'STOP_DECK',deck:'B'});assert.equal(r.active,false);
 r=await next(listener,{target:'offscreen',type:'START_EXTERNAL',revision:10,settings:{enabled:true,autoLevelEnabled:true,autoLevelProfile:'reference'}});assert(r.ok&&r.active&&r.externalActive&&r.inputMode==='external');
 await next(listener,{target:'offscreen',type:'STOP'});
 console.log('PASS dj_external_runtime_test dual deck add/replace/stale-ended guard/release + external input lifecycle');
})().catch(e=>{console.error(e);process.exit(1);});
