"use strict";
const fs=require("fs"), vm=require("vm");
const src=fs.readFileSync("offscreen.js","utf8");
function extractFunction(name){
  const sig=`function ${name}(`; const start=src.indexOf(sig); if(start<0) throw new Error(`${name} missing`);
  const brace=src.indexOf("{",start); let depth=0,end=-1;
  for(let i=brace;i<src.length;i++){ if(src[i]==="{")depth++; else if(src[i]==="}" && --depth===0){end=i+1;break;} }
  if(end<0) throw new Error(`${name} unterminated`); return src.slice(start,end);
}
const calls=[];
const sandbox={
  console,
  Date:{now:()=>100000},
  state:null,
  linearToDb:(x)=>x>0?20*Math.log10(x):-120,
  dbToGain:(db)=>Math.pow(10,db/20),
  smooth:(param,value,now,seconds)=>{param.value=value;calls.push({value,seconds});}
};
vm.createContext(sandbox); vm.runInContext(extractFunction("safetyMonitorTick"),sandbox);
function fresh({trim=0,peak=.2,rms=.1,lim=0,enabled=true}={}){
  calls.length=0;
  sandbox.state={
    context:{state:"running",currentTime:1,resume:()=>Promise.resolve()},
    nodes:{limiter:{reduction:lim},adaptiveTrim:{gain:{value:Math.pow(10,trim/20)}}},
    settings:{adaptiveSafetyEnabled:enabled}, safetyStats:{peak,rms}, safetyMeterAvailable:true,safetyLastStatsAtMs:100000,
    adaptiveTrimDb:trim, adaptiveTrimQuietStreak:0, adaptiveTrimHoldReason:"unity",adaptiveTrimLastPressureAtMs:0,adaptiveTrimReleaseCount:0,
    limiterPressureStreak:0,limiterRelaxStreak:0,runtimeWatchdogMisses:0,runtimeRecoveries:0
  };
  return sandbox.state;
}
let s=fresh({trim:-.25,peak:.2,rms:.1,lim:0}); for(let i=0;i<24;i++) sandbox.safetyMonitorTick();
if(s.adaptiveTrimDb!==-.25 || s.adaptiveTrimHoldReason!=="active-program-hold") throw new Error(`active program released trim: ${JSON.stringify(s)}`);
s=fresh({trim:-.25,peak:.01,rms:.003,lim:0}); for(let i=0;i<7;i++) sandbox.safetyMonitorTick();
if(s.adaptiveTrimDb!==-.25) throw new Error("quiet released before 8 ticks"); sandbox.safetyMonitorTick();
if(Math.abs(s.adaptiveTrimDb-(-.15))>1e-9 || s.adaptiveTrimReleaseCount!==1) throw new Error(`quiet release failed: ${JSON.stringify(s)}`);
s=fresh({trim:0,peak:.2,rms:.1,lim:-2}); for(let i=0;i<3;i++) sandbox.safetyMonitorTick();
if(Math.abs(s.adaptiveTrimDb-(-.25))>1e-9) throw new Error(`pressure attack failed: ${s.adaptiveTrimDb}`);
if(!calls.some(x=>Math.abs(x.seconds-.08)<1e-9)) throw new Error("pressure attack ramp changed");
console.log(JSON.stringify({ok:true,activeHold:sandbox.state.adaptiveTrimHoldReason,tests:"pressure attack preserved; active-program release frozen; quiet-only release"}));
