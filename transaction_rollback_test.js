"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modular=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const core=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const v28Code=fs.readFileSync(path.join(root,"adaptive-v28.js"),"utf8");
const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8").replace('importScripts("modular-core.js", "dsp-core.js", "adaptive-v28.js");',"");
function response(listener,msg){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error(`timeout ${msg.type}`)),2500);listener(msg,{},v=>{clearTimeout(t);resolve(v);});});}
function worker({captureIdFails=false,addDeckFails=false,externalFails=false}={}){
  let listener, captured=false, offscreen=false; const storage={};
  const chrome={
    storage:{local:{get:async()=>({...storage}),set:async v=>Object.assign(storage,v)}},
    runtime:{getURL:p=>`chrome-extension://id/${p}`,getContexts:async()=>offscreen?[{}]:[],sendMessage:async msg=>{
      if(msg.target!=="offscreen")return{ok:true};
      if(msg.type==="START"){captured=true;offscreen=true;return{ok:true,active:true};}
      if(msg.type==="STOP"){captured=false;return{ok:true,active:false};}
      if(msg.type==="ADD_DECK")return addDeckFails?{ok:false,error:"deck runtime failure"}:{ok:true,active:true,deckAActive:true,inputMode:"dj"};
      if(msg.type==="START_EXTERNAL")return externalFails?{ok:false,error:"permission denied"}:{ok:true,active:true,externalActive:true,inputMode:"external"};
      if(msg.type==="STATUS")return{ok:true,active:captured};
      if(msg.type==="UPDATE_SETTINGS")return{ok:true,active:captured};
      return{ok:true};
    },onMessage:{addListener:fn=>listener=fn}},
    offscreen:{createDocument:async()=>{offscreen=true;},closeDocument:async()=>{offscreen=false;}},
    tabs:{query:async()=>[{id:9,url:"https://www.youtube.com/watch?v=tx"}]},
    tabCapture:{getCapturedTabs:async()=>captured?[{tabId:9,status:"active"}]:[],getMediaStreamId:async()=>{if(captureIdFails)throw new Error("capture id denied");return"sid";}}
  };
  const sb={console,URL,setTimeout,clearTimeout,structuredClone,navigator:{hardwareConcurrency:4},chrome,globalThis:null};sb.globalThis=sb;
  vm.runInContext(`${modular}\n${core}\n${v28Code}\n${sw}`,vm.createContext(sb));
  return{listener,storage,state:()=>({captured,offscreen})};
}
(async()=>{
  // Inactive -> capture-id failure must restore OFF and close idle offscreen.
  let w=worker({captureIdFails:true}); let r=await response(w.listener,{target:"service-worker",type:"ARM_DECK",deck:"A"});
  assert.equal(r.ok,false); assert.equal(r.settings.enabled,false); assert.equal(r.settings.djEnabled,false); assert.equal(w.storage.enabled,false); assert.equal(w.state().offscreen,false);

  // Inactive -> runtime ADD_DECK failure must also restore OFF.
  w=worker({addDeckFails:true}); r=await response(w.listener,{target:"service-worker",type:"ARM_DECK",deck:"A"});
  assert.equal(r.ok,false); assert.equal(r.settings.enabled,false); assert.equal(r.settings.djEnabled,false); assert.equal(w.storage.enabled,false); assert.equal(w.state().offscreen,false);

  // If normal processing is already active, a failed Deck arm must not turn it off or force DJ state.
  w=worker({addDeckFails:true}); r=await response(w.listener,{target:"service-worker",type:"SET_ENABLED",enabled:true}); assert(r.ok&&r.settings.enabled);
  r=await response(w.listener,{target:"service-worker",type:"ARM_DECK",deck:"B"});
  assert.equal(r.ok,false); assert.equal(r.settings.enabled,true); assert.equal(r.settings.djEnabled,false); assert.equal(w.storage.enabled,true); assert.equal(w.state().offscreen,true);

  // External permission/runtime failure must restore the prior active state rather than writing enabled=false.
  w=worker({externalFails:true}); r=await response(w.listener,{target:"service-worker",type:"SET_ENABLED",enabled:true}); assert(r.ok&&r.settings.enabled);
  r=await response(w.listener,{target:"service-worker",type:"START_EXTERNAL"});
  assert.equal(r.ok,false); assert.equal(r.settings.enabled,true); assert.equal(r.settings.djEnabled,false); assert.equal(w.storage.enabled,true); assert.equal(w.state().offscreen,true);

  console.log("PASS transaction_rollback_test deck/external failures restore canonical state transactionally");
})().catch(e=>{console.error(e);process.exit(1);});
