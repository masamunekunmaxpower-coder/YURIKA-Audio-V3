'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const original=fs.readFileSync(path.join(__dirname,'runtime_mock_test.js'),'utf8');
const marker='async function testOffscreen()';
if(!original.includes(marker))throw Error('fixture changed');
const fixture=original.slice(0,original.indexOf(marker));
const scenarios=`
(async()=>{
 let listener,closeCount=0,ended=[];
 let failure=false;
 class TestContext extends FakeAudioContext {
  createMediaStreamSource(){if(failure)throw Error('graph-build-failed');return super.createMediaStreamSource();}
  async close(){closeCount++;await super.close();}
 }
 const stream=()=>{const t={stop(){},addEventListener:(e,f)=>ended.push(f),getSettings:()=>({channelCount:2})};return {getTracks:()=>[t],getAudioTracks:()=>[t]};};
 const sandbox={console,setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,AudioContext:TestContext,AudioWorkletNode:FakeAudioWorkletNode,navigator:{hardwareConcurrency:4,mediaDevices:{getUserMedia:async()=>stream()}},chrome:{runtime:{getURL:p=>p,sendMessage:async()=>({ok:true}),onMessage:{addListener:f=>listener=f}}}};
 sandbox.globalThis=sandbox;
 vm.runInContext(modularCode+'\\n'+coreCode+'\\n'+v28Code+'\\n'+selfCode+'\\n'+modulesCode+'\\n'+offCode+'\\nglobalThis.api={start,stop,applySettings,status,getState:()=>state};',vm.createContext(sandbox));
 const api=sandbox.api;
 try {
  failure=true;
  const bad=await api.start({tabId:1,streamId:'test',settings:{}});
  assert.equal(bad.ok,false);assert.equal(closeCount,1,'failed partial context must close');
  failure=false;
  const st=await api.start({tabId:1,streamId:'test',settings:{enabled:true,selfDapEnabled:true,selfDapStrength:0}});
  assert(st.ok);assert.equal(st.selfDapBypassGain,1);assert.equal(st.selfDapProcessedGain,0);
  assert.equal(api.getState().selfDapMonitorTimer,null);
  api.applySettings({selfDapStrength:70});
  assert.equal(api.status().selfDapProcessedGain,1);assert(api.getState().selfDapMonitorTimer);
  // Observe both automation endpoints, not merely the requested mode flag.
  const stage=api.getState().nodes.selfDap, times=[];
  assert.equal(stage.ms.sideDelay.delayTime.value,0);
  assert.equal(stage.ms.sideHpf.frequency.value,5);
  assert(Math.abs(stage.ms.sideHpf.Q.value+3.0102999566)<1e-9);
  assert(Math.abs(stage.ms.sidePresence.gain.value-0.7)<1e-10);
  assert.strictEqual(stage.abSum.connected,stage.processedGain,'Self-DAP must bypass redundant internal compressor');
  assert.notStrictEqual(stage.abSum.connected,stage.selfLimiter);
  stage.bypassGain.gain.linearRampToValueAtTime=(v,t)=>{times.push(t);};
  stage.processedGain.gain.linearRampToValueAtTime=(v,t)=>{times.push(t);};
  api.applySettings({selfDapStrength:0});
  assert.equal(times.length,2);assert.equal(times[0],times[1]);
  assert.equal(api.getState().selfDapMonitorTimer,null);
  const stale=ended[0];
  await api.start({tabId:1,streamId:'replacement',settings:{enabled:true}});
  stale();await new Promise(r=>setTimeout(r,80));
  assert(api.status().active,'old ended event must not stop replacement');
 } finally {await api.stop();}
 console.log('PASS self_dap_runtime_v22_test: zero-strength bypass, monitor lifecycle, complementary ramps, context cleanup, stale end event');
})().catch(e=>{console.error(e);process.exitCode=1;});
`;
vm.runInThisContext('(function(require,__dirname){'+fixture+scenarios+'})')(require,__dirname);
