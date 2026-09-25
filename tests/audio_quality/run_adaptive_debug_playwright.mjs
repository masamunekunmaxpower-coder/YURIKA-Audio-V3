import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const outDir=path.join(here,"results"); fs.mkdirSync(outDir,{recursive:true});
function writeFloatWav(file,left,right,sampleRate){
  const L=Buffer.from(left,"base64"),R=Buffer.from(right,"base64"); const frames=Math.min(L.length,R.length)/4,dataBytes=frames*8;
  const b=Buffer.alloc(44+dataBytes);b.write("RIFF",0);b.writeUInt32LE(36+dataBytes,4);b.write("WAVE",8);b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*8,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write("data",36);b.writeUInt32LE(dataBytes,40);
  for(let i=0;i<frames;i++){L.copy(b,44+i*8,i*4,i*4+4);R.copy(b,48+i*8,i*4,i*4+4);} fs.writeFileSync(file,b);
}
const userDataDir=fs.mkdtempSync(path.join(os.tmpdir(),"yurika-adaptive-debug-")); let context=null;
try{
  context=await chromium.launchPersistentContext(userDataDir,{channel:"chromium",headless:true,timeout:60000,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,"--autoplay-policy=no-user-gesture-required","--disable-gpu","--disable-software-rasterizer","--no-sandbox"]});
  const workers=context.serviceWorkers(); const worker=workers[0]||await context.waitForEvent("serviceworker",{timeout:30000}); const ext=new URL(worker.url()).host;
  const page=await context.newPage(); page.on("console",m=>console.log(`[browser:${m.type()}] ${m.text()}`)); page.on("pageerror",e=>console.error("[browser:pageerror]",e));
  await page.goto(`chrome-extension://${ext}/tests/audio_quality/runtime.html`,{waitUntil:"load",timeout:30000});
  await page.waitForFunction(()=>typeof globalThis.captureAdaptiveDebugCase==="function",null,{timeout:30000});
  const variants=await page.evaluate(()=>globalThis.getAdaptiveDebugVariants());
  for(const kind of ["selfdap","sonobus"]){
    let index=0;
    for(const variant of variants[kind]){
      console.log(`[YURIKA] adaptive debug ${kind}/${variant}`);
      const full=(variant==="normal"||variant==="all-controls-off");
      const result=await page.evaluate(async ({kind,variant,full,index})=>await globalThis.captureAdaptiveDebugCase(kind,variant,chrome.runtime.getURL("tests/audio_quality/control-debug-stimulus.wav"),full,2200+(kind==="sonobus"?100:0)+index),{kind,variant,full,index});
      const prefix=`debug.${kind}.${variant}`;
      for(const [name,tap] of Object.entries(result.taps)) writeFloatWav(path.join(outDir,`${prefix}.${name}.wav`),tap.left,tap.right,result.sampleRate);
      fs.writeFileSync(path.join(outDir,`${prefix}.json`),JSON.stringify({kind,variant,sampleRate:result.sampleRate,status:result.status,timeline:result.timeline,tapNames:Object.keys(result.taps)},null,2));
      index++;
    }
  }
}catch(error){
  fs.writeFileSync(path.join(outDir,"adaptive-debug-render-failure.json"),JSON.stringify({time:new Date().toISOString(),name:error?.name??"Error",message:error?.message??String(error),stack:error?.stack??null},null,2)); console.error(error); process.exitCode=1;
}finally{if(context)try{await context.close();}catch{} try{fs.rmSync(userDataDir,{recursive:true,force:true});}catch{}}
