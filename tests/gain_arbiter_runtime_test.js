"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const code=["modular-core.js","dsp-core.js","self-dap-core.js","audio-modules.js","scene-engine.js"]
  .map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n")+"\n"+
  fs.readFileSync(path.join(root,"offscreen.js"),"utf8")+"\nglobalThis.__state=()=>state;";
function next(l,m){return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error("timeout")),1500);l(m,{},v=>{clearTimeout(t);res(v);});});}
class P{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class N{constructor(){this.frequency=new P();this.gain=new P(1);this.Q=new P();this.threshold=new P();this.knee=new P();this.ratio=new P(1);this.attack=new P();this.release=new P();this.delayTime=new P();this.reduction=0;this.port={postMessage(){},onmessage:null};this.fftSize=2048;this.frequencyBinCount=1024;this.timeValue=0.1;}connect(n){return n;}disconnect(){}getFloatFrequencyData(a){a.fill(-45);}getFloatTimeDomainData(a){a.fill(this.timeValue);}}
class B{constructor(c,l){this.d=Array.from({length:c},()=>new Float32Array(l));}getChannelData(i){return this.d[i];}}
class C{constructor(o={}){this.state="running";this.currentTime=1;this.sampleRate=o.sampleRate||48000;this.destination=new N();this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return new N();}createBiquadFilter(){return new N();}createGain(){return new N();}createDynamicsCompressor(){return new N();}createWaveShaper(){return new N();}createConvolver(){return new N();}createChannelSplitter(){return new N();}createChannelMerger(){return new N();}createDelay(){return new N();}createAnalyser(){return new N();}createBuffer(c,l){return new B(c,l);}async resume(){}async close(){this.state="closed";}}
class W extends N{}
(async()=>{
  let listener;const tr={stop(){},addEventListener(){},getSettings:()=>({channelCount:2})};const stream={getTracks:()=>[tr],getAudioTracks:()=>[tr]};
  const sb={console,Date,Math,Float32Array,performance:{now:()=>1000},setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},AudioContext:C,AudioWorkletNode:W,navigator:{mediaDevices:{getUserMedia:async()=>stream}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:f=>listener=f}}},globalThis:null};sb.globalThis=sb;
  vm.runInContext(code,vm.createContext(sb));
  const r=await next(listener,{target:"offscreen",type:"START",tabId:1,streamId:"s",revision:1,settings:{enabled:true,autoLevelEnabled:true,sparkEnabled:true,sceneEnabled:true,sparkAmount:45}});assert(r.ok);
  const st=sb.__state();
  st.autoLevelDb=2.0;st.sparkMakeupDb=0.4;sb.commitEffectiveLevelGain({force:true,seconds:0.01});
  assert(Math.abs(st.effectiveLevelDb-2.4)<1e-9,"base + spark must combine exactly");
  assert(Math.abs(st.nodes.autoLevel.gain.value-Math.pow(10,2.4/20))<1e-9,"single AutoLevel Gain receives combined target");
  const outputBefore=st.nodes.output.gain.value;
  st.sceneRuntime={controls:{width:20,detail:25,reality:15}};
  sb.applyFastSparkControls(st.sceneRuntime.controls,{sparkMakeupDb:0.5,widthDelta:0,detailDelta:0,realityDelta:0});
  assert.equal(st.nodes.output.gain.value,outputBefore,"Fast Spark must not write Output Gain");
  assert(st.sparkMakeupDb>=0,"Spark makeup must never be negative");
  st.settings.autoLevelEnabled=false;st.autoLevelDb=0;sb.commitEffectiveLevelGain({force:true,seconds:0.01});
  assert(Math.abs(st.effectiveLevelDb-st.sparkMakeupDb)<1e-9,"Spark remains when Auto Level is disabled");
  st.settings.sparkEnabled=false;sb.resetSparkMakeup(0.01);
  assert.equal(st.sparkMakeupDb,0);assert.equal(st.effectiveLevelDb,0);assert.equal(st.nodes.autoLevel.gain.value,1);
  assert(st.effectiveLevelWrites>=4,"arbiter should own all runtime gain commits");
  await next(listener,{target:"offscreen",type:"STOP"});
  console.log("PASS gain_arbiter_runtime_test single-writer + nonnegative Spark + Output isolation + independent reset");
})().catch(e=>{console.error(e);process.exit(1);});
