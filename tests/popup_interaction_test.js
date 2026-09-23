"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");
const modularCode=fs.readFileSync(path.join(root,"modular-core.js"),"utf8");
const coreCode=fs.readFileSync(path.join(root,"dsp-core.js"),"utf8");
const popupCode=fs.readFileSync(path.join(root,"popup.js"),"utf8");

class FakeNode{
  constructor(id,{type="text",tagName="INPUT",value="",checked=false}={}){this.id=id;this.type=type;this.tagName=tagName;this.value=String(value);this.checked=checked;this.disabled=false;this.textContent="";this.listeners={};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatch(type){for(const fn of this.listeners[type]||[]) fn({type,target:this});}
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

(async()=>{
  const baseSandbox={console,URL,setTimeout,clearTimeout,globalThis:null};baseSandbox.globalThis=baseSandbox;
  vm.runInContext(`${modularCode}\n${coreCode}`,vm.createContext(baseSandbox));
  const core=baseSandbox.YurikaAudioCore;
  let canonical=core.applyPreset(core.DEFAULTS,"selfdap");
  canonical=core.sanitizeSettings({...canonical,enabled:false,perspectiveEnabled:true,perspectiveDepth:42});
  let revision=10;

  const ids=[...core.SETTINGS_KEYS];
  const checkbox=new Set(ids.filter(id=>typeof canonical[id]==="boolean"));
  const selects=new Set(ids.filter(id=>typeof canonical[id]==="string"));
  const nodes={};
  for(const id of ids){
    const type=checkbox.has(id)?"checkbox":(selects.has(id)?"select-one":"range");
    const tagName=selects.has(id)?"SELECT":"INPUT";
    nodes[id]=new FakeNode(id,{type,tagName,value:canonical[id]??"",checked:Boolean(canonical[id])});
  }
  for(const id of ["bassDbOut","warmthDbOut","clarityDbOut","airDbOut","outputDbOut","detailOut","widthOut","realityOut","noiseReductionOut","spectralFillOut","dapStrengthOut","selfDapStrengthOut","perspectiveDepthOut","dacMatrixStrengthOut","dacAkmWeightOut","dacEssWeightOut","dacTiWeightOut","roomAmountOut","integrityStrengthOut","autoLevelTargetDbfsOut","djCrossfaderOut","deckAGainDbOut","deckBGainDbOut","deckALowDbOut","deckAMidDbOut","deckAHighDbOut","deckBLowDbOut","deckBMidDbOut","deckBHighDbOut","cartridgeMixAOut","cartridgeMixBOut","cartridgeMixCOut","diagPeak","diagRms","diagCorr","diagStereo","diagAutoLevel","diagSparkGain","diagEffectiveGain","diagTrim","diagLimiter","diagSupervisor","status","deckState"]) nodes[id]=new FakeNode(id,{tagName:"OUTPUT"});

  const documentListeners={}; const windowListeners={};
  const document={
    visibilityState:"visible",
    getElementById:id=>nodes[id]||null,
    addEventListener:(t,fn)=>{(documentListeners[t]??=[]).push(fn);}
  };
  const window={addEventListener:(t,fn)=>{(windowListeners[t]??=[]).push(fn);}};
  const sendMessage=async(msg)=>{
    assert.equal(msg.target,"service-worker");
    if(msg.type==="GET_SETTINGS") return {ok:true,settings:canonical,revision};
    if(msg.type==="STATUS") return {ok:true,active:false};
    if(msg.type==="SET_ENABLED"){canonical=core.sanitizeSettings({...canonical,enabled:Boolean(msg.enabled)});revision++;return{ok:true,settings:canonical,revision};}
    if(msg.type==="APPLY_PATCH"){
      canonical=core.applyManualPatch(canonical,msg.patch);revision++;
      return{ok:true,settings:canonical,revision,changed:msg.patch};
    }
    if(msg.type==="APPLY_PRESET"){
      canonical=core.applyPreset(canonical,msg.name,{preserveIndependentLayers:true});revision++;
      return{ok:true,settings:canonical,revision};
    }
    throw new Error(`unexpected ${msg.type}`);
  };

  const sandbox={console,URL,setTimeout,clearTimeout,setInterval,clearInterval,globalThis:null,document,window,chrome:{runtime:{sendMessage}}}; sandbox.globalThis=sandbox;
  vm.runInContext(`${modularCode}\n${coreCode}`,vm.createContext(sandbox));
  vm.runInContext(popupCode,sandbox);
  await sleep(30);

  assert.equal(nodes.preset.value,"selfdap");assert.equal(nodes.selfDapEnabled.checked,true);assert.equal(nodes.selfDapStrength.value,"70");assert.equal(nodes.selfDapRestoration.value,"auto");assert.equal(nodes.selfDapRestorationCutoffKhz.value,"14");assert.equal(nodes.perspectiveDepth.value,"42");

  // Manual DSP edits must never rewrite Self DAP or base preset.
  nodes.detail.value="44";nodes.detail.dispatch("input");nodes.detail.dispatch("change");await sleep(80);
  assert.equal(canonical.detail,44);assert.equal(canonical.preset,"selfdap");assert.equal(canonical.selfDapStrength,70);assert.equal(nodes.preset.value,"selfdap");assert.equal(nodes.selfDapStrength.value,"70");
  nodes.width.value="63";nodes.width.dispatch("input");nodes.width.dispatch("change");await sleep(80);
  nodes.bassDb.value="2.5";nodes.bassDb.dispatch("input");nodes.bassDb.dispatch("change");await sleep(80);
  assert.equal(canonical.width,63);assert.equal(canonical.bassDb,2.5);assert.equal(canonical.selfDapEnabled,true);assert.equal(canonical.selfDapRestoration,"auto");assert.equal(canonical.perspectiveDepth,42);

  // Explicit independent edit sticks through later audio edits.
  nodes.selfDapStrength.value="83";nodes.selfDapStrength.dispatch("input");nodes.selfDapStrength.dispatch("change");await sleep(80);
  nodes.clarityDb.value="3";nodes.clarityDb.dispatch("input");nodes.clarityDb.dispatch("change");await sleep(80);
  assert.equal(canonical.selfDapStrength,83);assert.equal(nodes.selfDapStrength.value,"83");assert.equal(canonical.preset,"selfdap");

  // Normal preset intentionally changes tone layer, but independent layers survive.
  nodes.preset.value="music";nodes.preset.dispatch("change");await sleep(100);
  assert.equal(canonical.preset,"music");assert.equal(canonical.selfDapStrength,83);assert.equal(canonical.selfDapEnabled,true);assert.equal(canonical.perspectiveDepth,42);assert.equal(nodes.selfDapStrength.value,"83");

  // Self DAP Reference is an explicit template action: it may reset its own template values exactly once.
  nodes.preset.value="selfdap";nodes.preset.dispatch("change");await sleep(100);
  assert.equal(canonical.selfDapStrength,70);assert.equal(canonical.preset,"selfdap");
  nodes.reality.value="39";nodes.reality.dispatch("input");nodes.reality.dispatch("change");await sleep(80);
  assert.equal(canonical.reality,39);assert.equal(canonical.selfDapStrength,70);assert.equal(canonical.preset,"selfdap");

  // Popup-close path: pending range edit must be flushed on pagehide even without change event.
  nodes.spectralFill.value="31";nodes.spectralFill.dispatch("input");
  for(const fn of windowListeners.pagehide||[]) fn({type:"pagehide"});
  await sleep(100);
  assert.equal(canonical.spectralFill,31);assert.equal(canonical.selfDapStrength,70);assert.equal(canonical.preset,"selfdap");

  console.log("PASS popup_interaction_test Self DAP sticky through DSP edits + normal preset isolation + pagehide flush");
})().catch(e=>{console.error(e);process.exit(1);});
