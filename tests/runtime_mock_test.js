"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modularCode=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const coreCode=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const v28Code=fs.readFileSync(path.join(root,"adaptive-v28.js"),"utf8");
const modulesCode=fs.readFileSync(path.join(root,"audio-modules.js"),"utf8");
const selfCode=fs.readFileSync(path.join(root,"self-dap-core.js"),"utf8");
const swCode=fs.readFileSync(path.join(root,"service-worker.js"),"utf8").replace('importScripts("modular-core.js", "dsp-core.js", "adaptive-v28.js");',"");
const offCode=fs.readFileSync(path.join(root,"offscreen.js"),"utf8");

function nextResponse(listener,message){return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>{if(!done)reject(new Error("message timeout"));},1500);const sendResponse=(v)=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};try{const flag=listener(message,{},sendResponse);if(flag!==true&&!done){done=true;clearTimeout(timer);resolve();}}catch(e){clearTimeout(timer);reject(e);}});}

async function testServiceWorker(){
  let listener,activeUrl="https://www.youtube.com/watch?v=test",streamCalls=0,lastMessage=null;
  let store={}; const sandbox={console,URL,setTimeout,clearTimeout,navigator:{hardwareConcurrency:4},globalThis:null,chrome:{storage:{local:{get:async()=>({...store}),set:async(v)=>{Object.assign(store,v);}}},runtime:{getURL:(p)=>`chrome-extension://id/${p}`,getContexts:async()=>[],sendMessage:async(msg)=>{lastMessage=msg;if(msg.type==="START")return{ok:true,active:true,sampleRate:96000,hiResActive:true};if(msg.type==="STOP")return{ok:true,active:false};if(msg.type==="STATUS")return{ok:true,active:true,sampleRate:96000,audioContextState:"running"};if(msg.type==="UPDATE_SETTINGS")return{ok:true,active:true};return{ok:true};},onMessage:{addListener:(fn)=>listener=fn}},offscreen:{createDocument:async()=>{},closeDocument:async()=>{}},tabs:{query:async()=>[{id:7,url:activeUrl}]},tabCapture:{getCapturedTabs:async()=>[],getMediaStreamId:async({targetTabId})=>{assert.equal(targetTabId,7);streamCalls++;return"stream-123";}}}};
  sandbox.globalThis=sandbox;vm.runInContext(`${modularCode}\n${coreCode}\n${v28Code}\n${swCode}`,vm.createContext(sandbox));
  const started=await nextResponse(listener,{target:"service-worker",type:"START",settings:{bassDb:999,detail:999,hiResMode:true,enabled:true}});
  assert.equal(started.ok,true);assert.equal(streamCalls,1);assert.equal(lastMessage.settings.bassDb,6);assert.equal(lastMessage.settings.detail,100);assert.equal(lastMessage.settings.hiResMode,true);
  activeUrl="https://youtube.com.evil.example/watch";const rejected=await nextResponse(listener,{target:"service-worker",type:"START",settings:{}});assert.equal(rejected.ok,false);assert.equal(streamCalls,1);
}

class FakeParam{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class FakeNode{constructor(){this.frequency=new FakeParam();this.gain=new FakeParam();this.Q=new FakeParam();this.threshold=new FakeParam();this.knee=new FakeParam();this.ratio=new FakeParam(1);this.attack=new FakeParam();this.release=new FakeParam();this.delayTime=new FakeParam();this.reduction=0;this.port={postMessage:(m)=>{this.lastMessage=m;}};this.curve=null;this.oversample="none";this.fftSize=2048;this.smoothingTimeConstant=0;this.frequencyBinCount=1024;}connect(node){this.connected=node;return node;}getFloatFrequencyData(a){for(let i=0;i<a.length;i++)a[i]=-45;}}
class FakeBuffer{constructor(ch,l){this.data=Array.from({length:ch},()=>new Float32Array(l));}getChannelData(ch){return this.data[ch];}}
class FakeAudioContext{
  constructor(opts={}){this.state="running";this.currentTime=1;this.sampleRate=opts.sampleRate||48000;this.destination=new FakeNode();this.audioWorklet={addModule:async()=>{}};}
  createMediaStreamSource(){return new FakeNode();}createBiquadFilter(){return new FakeNode();}createDynamicsCompressor(){return new FakeNode();}createGain(){return new FakeNode();}
  createWaveShaper(){return new FakeNode();}createConvolver(){return new FakeNode();}createChannelSplitter(){return new FakeNode();}createChannelMerger(){return new FakeNode();}createDelay(){return new FakeNode();}createAnalyser(){return new FakeNode();}
  createBuffer(ch,l){return new FakeBuffer(ch,l);}async resume(){this.state="running";}async close(){this.state="closed";}
}
class FakeAudioWorkletNode extends FakeNode{constructor(){super();}}

async function testOffscreen(){
  let listener,stopped=0;const audioTrack={stop:()=>stopped++,addEventListener:()=>{},getSettings:()=>({channelCount:2})};const stream={getTracks:()=>[audioTrack],getAudioTracks:()=>[audioTrack]};
  const sandbox={console,setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,AudioContext:FakeAudioContext,AudioWorkletNode:FakeAudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async(c)=>{assert.equal(c.video,false);assert.equal(c.audio.mandatory.chromeMediaSourceId,"stream-123");return stream;}}},globalThis:null,chrome:{runtime:{getURL:(p)=>`chrome-extension://id/${p}`,sendMessage:async()=>({ok:true}),onMessage:{addListener:(fn)=>listener=fn}}}};
  sandbox.globalThis=sandbox;vm.runInContext(`${modularCode}\n${coreCode}\n${v28Code}\n${selfCode}\n${modulesCode}\n${offCode}`,vm.createContext(sandbox));
  const invalid=await nextResponse(listener,{target:"offscreen",type:"START",tabId:-1,streamId:""});assert.equal(invalid.ok,false);
  const started=await nextResponse(listener,{target:"offscreen",type:"START",tabId:7,streamId:"stream-123",settings:{enabled:true,detail:80,width:70,reality:60,noiseReduction:50,spectralFill:50,hiResMode:true,dapMode:"natural",dapStrength:70,selfDapEnabled:true,selfDapStrength:70,selfDapRestoration:"on",selfDapRestorationCutoffKhz:16,perspectiveEnabled:true,perspectiveDepth:70}});
  assert.equal(started.ok,true);assert.equal(started.sampleRate,96000);assert.equal(started.hiResActive,true);assert.equal(started.noiseWorkletAvailable,true);assert.equal(started.sparkWorkletAvailable,true);assert.equal(started.dapMode,"natural");assert.equal(started.dapStrength,70);assert.equal(started.dapCrossfeedActive,true);assert.equal(started.selfDapEnabled,true);assert.equal(started.selfDapStrength,70);assert.equal(started.selfDapRestoration,"on"); assert.equal(started.selfDapRestorationCutoffKhz,16); assert.equal(started.perspectiveEnabled,true); assert.equal(started.perspectiveDepth,70); assert(started.perspectiveWet>0); assert.equal(started.selfDapBypassGain,0); assert.equal(started.selfDapProcessedGain,1); assert.equal(started.masterSafetyGain,1);
  const updated=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{detail:999,width:-1,reality:999,noiseReduction:999,spectralFill:999,hiResMode:true,dapMode:"tube",dapStrength:999,selfDapEnabled:true,selfDapStrength:999,selfDapRestoration:"on"}});assert.equal(updated.ok,true);assert.equal(updated.restartRequired,false);assert.equal(updated.dapMode,"tube");assert.equal(updated.dapStrength,100);
  const flatCut=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{lowCutHz:5}});assert.equal(flatCut.lowCutBypassed,true);
  const activeCut=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{lowCutHz:35}});assert.equal(activeCut.lowCutBypassed,false);
  const bypassed=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{selfDapEnabled:false,perspectiveEnabled:false}}); assert.equal(bypassed.selfDapBypassGain,1); assert.equal(bypassed.selfDapProcessedGain,0); assert.equal(bypassed.perspectiveWet,0);
  const restartFlag=await nextResponse(listener,{target:"offscreen",type:"UPDATE_SETTINGS",settings:{hiResMode:false}});assert.equal(restartFlag.restartRequired,true);
  const ended=await nextResponse(listener,{target:"offscreen",type:"STOP"});assert.equal(ended.active,false);assert(stopped>=1);
}

(async()=>{await testServiceWorker();await testOffscreen();console.log("PASS runtime_mock_test layered DAP + perspective + true bypass + safety fade");})().catch(e=>{console.error(e);process.exit(1);});
