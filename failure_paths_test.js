"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");const modular=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");const core=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");const modules=fs.readFileSync(path.join(root,"audio-modules.js"),"utf8");const selfCode=fs.readFileSync(path.join(root,"self-dap-core.js"),"utf8");const sceneCode=fs.readFileSync(path.join(root,"scene-engine.js"),"utf8");const off=fs.readFileSync(path.join(root,"offscreen.js"),"utf8");
function next(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("timeout")),1500);listener(msg,{},(v)=>{clearTimeout(t);resolve(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P();this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage:()=>{}};this.fftSize=2048;this.frequencyBinCount=1024;this.smoothingTimeConstant=0;}connect(n){return n;}getFloatFrequencyData(a){for(let i=0;i<a.length;i++)a[i]=-90;}getFloatTimeDomainData(a){for(let i=0;i<a.length;i++)a[i]=0;}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(c){return this.d[c];}}
class C{
  constructor(opts={}){if(opts.sampleRate===96000)throw new Error("96k unsupported");this.state="running";this.currentTime=0;this.sampleRate=48000;this.destination=new N();this.audioWorklet={addModule:async()=>{throw new Error("worklet blocked");}};}
  createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state="closed";}
}
class AW extends N{}
(async()=>{
 let listener;const track={stop:()=>{},addEventListener:()=>{},getSettings:()=>({channelCount:1})};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 const s={console,performance:{now:()=>1000},setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,AudioContext:C,AudioWorkletNode:AW,navigator:{mediaDevices:{getUserMedia:async()=>stream}},globalThis:null,chrome:{runtime:{getURL:p=>`chrome-extension://id/${p}`,sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}}}};s.globalThis=s;
 vm.runInContext(`${modular}\n${core}\n${selfCode}\n${modules}\n${sceneCode}\n${off}`,vm.createContext(s));
 const started=await next(listener,{target:"offscreen",type:"START",tabId:1,streamId:"s",settings:{enabled:true,hiResMode:true,noiseReduction:100,width:100,dapMode:"natural",dapStrength:100,selfDapEnabled:true,selfDapStrength:100,selfDapRestoration:"auto",perspectiveEnabled:true,perspectiveDepth:100,sparkEnabled:true,sparkAmount:100}});
 assert.equal(started.ok,true);assert.equal(started.sampleRate,48000);assert.equal(started.hiResActive,false);assert.equal(started.noiseWorkletAvailable,false);assert.equal(started.sparkWorkletAvailable,false);assert.equal(started.sparkFallbackActive,true);assert.equal(started.inputChannels,1);assert.equal(started.dapCrossfeedActive,false);assert.equal(started.selfDapEnabled,true);assert.equal(started.selfDapRestorationActive,false); assert.equal(started.perspectiveEnabled,true); assert(started.perspectiveWet>0);
 await next(listener,{target:"offscreen",type:"STOP"});
 console.log("PASS failure_paths_test 96k fallback + worklet fallback + mono input + DAP/self-DAP stereo processing bypass");
})().catch(e=>{console.error(e);process.exit(1);});
