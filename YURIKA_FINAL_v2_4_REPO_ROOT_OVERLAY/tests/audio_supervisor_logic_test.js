"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modularCode=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const coreCode=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const modulesCode=fs.readFileSync(path.join(root,"audio-modules.js"),"utf8");
const selfCode=fs.readFileSync(path.join(root,"self-dap-core.js"),"utf8");
const offCode=fs.readFileSync(path.join(root,"offscreen.js"),"utf8")+"\nglobalThis.__getYurikaState=()=>state;";
function nextResponse(listener,message){return new Promise((resolve,reject)=>{let done=false;const t=setTimeout(()=>{if(!done)reject(new Error("timeout"));},1000);const sendResponse=v=>{if(done)return;done=true;clearTimeout(t);resolve(v);};const f=listener(message,{},sendResponse);if(f!==true&&!done){done=true;clearTimeout(t);resolve();}});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P();this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage(){},onmessage:null};this.frequencyBinCount=1024;this.fftSize=2048;this.smoothingTimeConstant=0;}connect(n){return n;}getFloatFrequencyData(a){a.fill(-45);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(c){return this.d[c];}}
class C{constructor(o={}){this.state="running";this.currentTime=1;this.sampleRate=o.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createDynamicsCompressor(){return new N();}createGain(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){this.state="running";}async close(){this.state="closed";}}
class W extends N{}
(async()=>{
 let listener;const track={stop(){},addEventListener(){},getSettings:()=>({channelCount:2})};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 const sandbox={console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Float32Array,AudioContext:C,AudioWorkletNode:W,navigator:{mediaDevices:{getUserMedia:async()=>stream}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}},globalThis:null};sandbox.globalThis=sandbox;
 vm.runInContext(`${modularCode}\n${coreCode}\n${selfCode}\n${modulesCode}\n${offCode}`,vm.createContext(sandbox));
 const start=await nextResponse(listener,{target:"offscreen",type:"START",tabId:1,streamId:"s",settings:{enabled:true,adaptiveSafetyEnabled:true}});assert(start.ok);
 const st=sandbox.__getYurikaState();assert(st.nodes.adaptiveTrim);assert.equal(st.adaptiveTrimDb,0);
 st.nodes.limiter.reduction=-4;st.safetyStats={peak:0.8,rms:0.1,balanceDb:0};
 for(let i=0;i<36;i++) sandbox.safetyMonitorTick();
 assert(st.adaptiveTrimDb<=-2.9&&st.adaptiveTrimDb>=-3.0,"trim bounded near -3dB");
 st.nodes.limiter.reduction=0;st.safetyStats.peak=0.4;
 for(let i=0;i<12;i++) sandbox.safetyMonitorTick();
 assert(st.adaptiveTrimDb>-3,"slow release begins");
 await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{adaptiveSafetyEnabled:false},revision:2});
 assert.equal(st.adaptiveTrimDb,0);assert.equal(st.nodes.adaptiveTrim.gain.value,1);
 assert.equal(sandbox.YurikaAudioCore.classifyStereo({inputChannels:2,correlation:0.7,balanceDb:0,rmsDbfs:-20,monoLikeStreak:0}),"stereo");
 assert.equal(sandbox.YurikaAudioCore.classifyStereo({inputChannels:2,correlation:0.99999,balanceDb:0.05,rmsDbfs:-20,monoLikeStreak:30}),"mono-like");
 await nextResponse(listener,{target:"offscreen",type:"STOP"});
 console.log("PASS audio_supervisor_logic_test adaptive trim bounds/release/off + stereo classification");
})().catch(e=>{console.error(e);process.exit(1);});
