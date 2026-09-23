"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modularCode=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const coreCode=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const modulesCode=fs.readFileSync(path.join(root,"audio-modules.js"),"utf8");
const selfCode=fs.readFileSync(path.join(root,"self-dap-core.js"),"utf8");
const offCode=fs.readFileSync(path.join(root,"offscreen.js"),"utf8");
function nextResponse(listener,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("timeout")),1500);listener(message,{},v=>{clearTimeout(timer);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P();this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage:()=>{}};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}getFloatFrequencyData(a){a.fill(-45);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(c){return this.d[c];}}
class C{constructor(opts={}){this.state="running";this.currentTime=0;this.sampleRate=opts.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state="closed";}}
class AW extends N{}
(async()=>{
  let listener; const track={stop:()=>{},addEventListener:()=>{},getSettings:()=>({channelCount:2})}; const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  const s={console,setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,AudioContext:C,AudioWorkletNode:AW,navigator:{mediaDevices:{getUserMedia:async()=>stream}},globalThis:null,chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}}};s.globalThis=s;
  vm.runInContext(`${modularCode}\n${coreCode}\n${selfCode}\n${modulesCode}\n${offCode}`,vm.createContext(s));
  const started=await nextResponse(listener,{target:"offscreen",type:"START",tabId:1,streamId:"s",revision:100,settings:{enabled:true,hiResMode:false,dapMode:"natural",dapStrength:66,selfDapEnabled:true,selfDapStrength:72,selfDapRestoration:"auto",perspectiveEnabled:true,perspectiveDepth:55}});
  assert.equal(started.ok,true); assert.equal(started.settingsRevision,100); assert.equal(started.dapMode,"natural"); assert.equal(started.selfDapEnabled,true);

  const patch=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",revision:101,settings:{detail:44}});
  assert.equal(patch.applied,true); assert.equal(patch.stale,false); assert.equal(patch.settingsRevision,101); assert.equal(patch.dapMode,"natural"); assert.equal(patch.dapStrength,66); assert.equal(patch.selfDapEnabled,true); assert.equal(patch.selfDapStrength,72); assert.equal(patch.perspectiveEnabled,true); assert.equal(patch.perspectiveDepth,55);

  const stale=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",revision:100,settings:{dapMode:"tube",selfDapEnabled:false,perspectiveEnabled:false}});
  assert.equal(stale.applied,false); assert.equal(stale.stale,true); assert.equal(stale.revision,101);
  const status=await nextResponse(listener,{target:"offscreen",type:"STATUS"});
  assert.equal(status.dapMode,"natural"); assert.equal(status.selfDapEnabled,true); assert.equal(status.perspectiveEnabled,true); assert.equal(status.settingsRevision,101);

  const newer=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",revision:102,settings:{dapMode:"tube"}});
  assert.equal(newer.applied,true); assert.equal(newer.dapMode,"tube"); assert.equal(newer.selfDapEnabled,true); assert.equal(newer.settingsRevision,102);
  await nextResponse(listener,{target:"offscreen",type:"STOP"});
  console.log("PASS revision_guard_test partial patches preserve layers + stale revisions rejected + clean shutdown");
})().catch(e=>{console.error(e);process.exit(1);});
