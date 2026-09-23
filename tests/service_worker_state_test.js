"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modularCode=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const coreCode=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const v28Code=fs.readFileSync(path.join(root,"adaptive-v28.js"),"utf8");
const swCode=fs.readFileSync(path.join(root,"service-worker.js"),"utf8").replace('importScripts("modular-core.js", "dsp-core.js", "adaptive-v28.js");',"");

function nextResponse(listener,message,timeoutMs=4000){return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>{if(!done)reject(new Error(`timeout ${message.type}`));},timeoutMs);const sendResponse=(v)=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};try{const flag=listener(message,{},sendResponse);if(flag!==true&&!done){done=true;clearTimeout(timer);resolve();}}catch(e){clearTimeout(timer);reject(e);}});}

function createWorker(sharedStore={}, initialCapture=false){
  let listener, captured=initialCapture, offscreenExists=initialCapture, activeUrl="https://www.youtube.com/watch?v=state", startCalls=0, stopCalls=0, updateCalls=0, lastUpdate=null, lastStart=null;
  const storage={...sharedStore};
  const chrome={
    storage:{local:{get:async()=>({...storage}),set:async(v)=>{Object.assign(storage,v);}}},
    runtime:{
      getURL:p=>`chrome-extension://id/${p}`,
      getContexts:async()=>offscreenExists?[{contextType:"OFFSCREEN_DOCUMENT"}]:[],
      sendMessage:async(msg)=>{
        if(msg.target!=="offscreen") return {ok:true};
        if(msg.type==="START"||msg.type==="ADD_SESSION"){captured=true;offscreenExists=true;startCalls++;lastStart=structuredClone(msg);return{ok:true,active:true,sessionTabIds:[7],sessionCount:1,sampleRate:msg.settings?.hiResMode?96000:48000,settingsRevision:msg.revision};}
        if(msg.type==="STOP"||msg.type==="STOP_SESSION"){captured=false;stopCalls++;return{ok:true,active:false,sessionTabIds:[],sessionCount:0};}
        if(msg.type==="UPDATE_SETTINGS"){updateCalls++;lastUpdate=structuredClone(msg);return{ok:true,active:true,settingsRevision:msg.revision};}
        if(msg.type==="STATUS")return{ok:true,active:captured,sessionTabIds:captured?[7]:[],sessionCount:captured?1:0,sampleRate:48000,audioContextState:captured?"running":"closed"};
        return{ok:true};
      },
      onMessage:{addListener:fn=>listener=fn}
    },
    offscreen:{createDocument:async()=>{offscreenExists=true;},closeDocument:async()=>{offscreenExists=false;captured=false;}},
    tabs:{query:async()=>[{id:7,url:activeUrl}]},
    tabCapture:{getCapturedTabs:async()=>captured?[{tabId:7,status:"active"}]:[],getMediaStreamId:async()=>"stream-state"}
  };
  const sandbox={console,URL,setTimeout,clearTimeout,structuredClone,navigator:{hardwareConcurrency:4},globalThis:null,chrome};sandbox.globalThis=sandbox;
  vm.runInContext(`${modularCode}\n${coreCode}\n${v28Code}\n${swCode}`,vm.createContext(sandbox));
  return {listener,storage,setUrl:v=>activeUrl=v,getStats:()=>({captured,startCalls,stopCalls,updateCalls,lastUpdate,lastStart})};
}

(async()=>{
  const w=createWorker();
  let r=await nextResponse(w.listener,{target:"service-worker",type:"GET_SETTINGS"});
  assert.equal(r.ok,true); assert.equal(r.settings.preset,"clean"); assert.equal(r.settings.enabled,false);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PRESET",name:"selfdap"});
  assert.equal(r.ok,true); assert.equal(r.settings.preset,"selfdap"); assert.equal(r.settings.selfDapEnabled,true); assert.equal(r.settings.selfDapStrength,70); assert.equal(r.settings.selfDapRestoration,"auto"); assert.equal(r.settings.detail,0); assert.equal(r.settings.dapMode,"off");
  const baseSelf={enabled:r.settings.selfDapEnabled,strength:r.settings.selfDapStrength,rest:r.settings.selfDapRestoration,cut:r.settings.selfDapRestorationCutoffKhz,dap:r.settings.dapMode};

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{detail:47}});
  assert.equal(r.settings.preset,"selfdap"); assert.equal(r.settings.detail,47); assert.deepEqual({enabled:r.settings.selfDapEnabled,strength:r.settings.selfDapStrength,rest:r.settings.selfDapRestoration,cut:r.settings.selfDapRestorationCutoffKhz,dap:r.settings.dapMode},baseSelf);
  assert.deepEqual(Object.keys(r.changed),["detail"]);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{preset:"flat",enabled:true,bassDb:3.5}});
  assert.equal(r.settings.preset,"selfdap"); assert.equal(r.settings.enabled,false); assert.equal(r.settings.bassDb,3.5);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{selfDapStrength:82}});
  assert.equal(r.settings.selfDapStrength,82); assert.equal(r.settings.preset,"selfdap");
  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{perspectiveEnabled:true,perspectiveDepth:61}});
  assert.equal(r.settings.perspectiveEnabled,true);assert.equal(r.settings.perspectiveDepth,61);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PRESET",name:"music"});
  assert.equal(r.settings.preset,"music"); assert.equal(r.settings.selfDapEnabled,true); assert.equal(r.settings.selfDapStrength,82); assert.equal(r.settings.perspectiveEnabled,true); assert.equal(r.settings.perspectiveDepth,61); assert.equal(r.settings.bassDb,2);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PRESET",name:"selfdap"});
  assert.equal(r.settings.preset,"selfdap"); assert.equal(r.settings.selfDapStrength,70); assert.equal(r.settings.dapMode,"off"); assert.equal(r.settings.perspectiveDepth,61); // Perspective is independent even for Self DAP Reference.

  r=await nextResponse(w.listener,{target:"service-worker",type:"SET_ENABLED",enabled:true});
  assert.equal(r.ok,true); assert.equal(r.settings.enabled,true); assert.equal(w.getStats().captured,true); assert.equal(w.getStats().startCalls,1);

  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{detail:58}});
  assert.equal(r.settings.detail,58); assert.deepEqual(Object.keys(w.getStats().lastUpdate.settings),["detail"]); assert.equal(w.getStats().lastUpdate.settings.selfDapStrength,undefined);

  const startsBefore=w.getStats().startCalls,stopsBefore=w.getStats().stopCalls;
  r=await nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{hiResMode:false}});
  assert.equal(r.settings.hiResMode,false); assert(w.getStats().startCalls>startsBefore); assert(w.getStats().stopCalls>stopsBefore);

  await nextResponse(w.listener,{target:"service-worker",type:"SET_ENABLED",enabled:false});
  assert.equal(w.getStats().captured,false);

  // 1,000 concurrently submitted actions must serialize in listener arrival order.
  const promises=[];
  for(let i=0;i<1000;i++) promises.push(nextResponse(w.listener,{target:"service-worker",type:"APPLY_PATCH",patch:{detail:i%101}},10000));
  const results=await Promise.all(promises);
  assert(results.every(x=>x.ok));
  r=await nextResponse(w.listener,{target:"service-worker",type:"GET_SETTINGS"});
  assert.equal(r.settings.detail,999%101); assert.equal(r.settings.selfDapEnabled,true); assert.equal(r.settings.selfDapStrength,70); assert.equal(r.settings.preset,"selfdap");

  // Simulate service-worker/browser restart with persisted settings but no capture.
  const w2=createWorker(w.storage,false);
  const reloaded=await nextResponse(w2.listener,{target:"service-worker",type:"GET_SETTINGS"});
  assert.equal(reloaded.settings.enabled,false); assert.equal(reloaded.settings.detail,999%101); assert.equal(reloaded.settings.selfDapEnabled,true); assert.equal(reloaded.settings.preset,"selfdap");
  assert(reloaded.revision>=r.revision);

  console.log("PASS service_worker_state_test canonical authority + single-key patches + preset isolation + 1000 serialized actions + restart persistence");
})().catch(e=>{console.error(e);process.exit(1);});
