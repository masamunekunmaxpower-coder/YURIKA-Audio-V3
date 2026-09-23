import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive:true });
function writeFloatWav(file, left, right, sampleRate) {
  const L = Buffer.from(left, "base64"), R = Buffer.from(right, "base64");
  const frames = Math.min(L.length, R.length) / 4;
  const dataBytes = frames * 2 * 4;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF",0); b.writeUInt32LE(36+dataBytes,4); b.write("WAVE",8); b.write("fmt ",12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(3,20); b.writeUInt16LE(2,22); b.writeUInt32LE(sampleRate,24);
  b.writeUInt32LE(sampleRate*2*4,28); b.writeUInt16LE(8,32); b.writeUInt16LE(32,34); b.write("data",36); b.writeUInt32LE(dataBytes,40);
  for (let i=0;i<frames;i++) { L.copy(b,44+i*8,i*4,i*4+4); R.copy(b,48+i*8,i*4,i*4+4); }
  fs.writeFileSync(file,b);
}
const userDataDir = path.join(outDir, "chromium-profile");
fs.rmSync(userDataDir,{recursive:true,force:true});
const context = await chromium.launchPersistentContext(userDataDir, {
  headless:false,
  args:[`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--autoplay-policy=no-user-gesture-required"]
});
try {
  let workers = context.serviceWorkers();
  const worker = workers[0] || await context.waitForEvent("serviceworker", {timeout:15000});
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/tests/audio_quality/runtime.html`, {waitUntil:"load"});
  const profiles = ["neutral","clean","music","selfdap"];
  for (const profile of profiles) {
    console.log(`render ${profile}`);
    const small = await page.evaluate(async ({profile}) => {
      return await globalThis.runYurikaQualityTest(chrome.runtime.getURL("tests/audio_quality/quality-stimulus.wav"), profile);
    }, {profile});
    const result = await page.evaluate(() => globalThis.__QUALITY_RESULT__);
    fs.writeFileSync(path.join(outDir,`${profile}.status.json`),JSON.stringify(small.status,null,2));
    writeFloatWav(path.join(outDir,`${profile}.wav`),result.left,result.right,result.sampleRate);
  }
} finally { await context.close(); }
