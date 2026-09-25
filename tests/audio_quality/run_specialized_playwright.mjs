import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive: true });

function writeFloatWav(file, left, right, sampleRate) {
  const L = Buffer.from(left, "base64");
  const R = Buffer.from(right, "base64");
  const frames = Math.min(L.length, R.length) / 4;
  const dataBytes = frames * 2 * 4;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0); b.writeUInt32LE(36 + dataBytes, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34);
  b.write("data", 36); b.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    L.copy(b, 44 + i * 8, i * 4, i * 4 + 4);
    R.copy(b, 48 + i * 8, i * 4, i * 4 + 4);
  }
  fs.writeFileSync(file, b);
}

function dumpTap(prefix, tapName, tap, sampleRate) {
  writeFloatWav(path.join(outDir, `${prefix}.${tapName}.wav`), tap.left, tap.right, sampleRate);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yurika-specialized-quality-"));
let context = null;
try {
  console.log("[YURIKA] Launching specialized spatial/amp benchmark...");
  context = await chromium.launchPersistentContext(userDataDir, {
    channel:"chromium", headless:true, timeout:60_000,
    args:[
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox"
    ]
  });
  const workers = context.serviceWorkers();
  const worker = workers[0] || await context.waitForEvent("serviceworker", { timeout:30_000 });
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on("console", msg => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", err => console.error("[browser:pageerror]", err));
  await page.goto(`chrome-extension://${extensionId}/tests/audio_quality/runtime.html`, { waitUntil:"load", timeout:30_000 });
  await page.waitForFunction(() => typeof globalThis.runSpatialLocalizationTest === "function" && typeof globalThis.runVirtualAmpBench === "function" && typeof globalThis.runSonoBusDiagnosticTest === "function", null, { timeout:30_000 });

  const capabilities = await page.evaluate(() => globalThis.getYurikaSpecializedCapabilities?.() ?? {spatial:false,virtualAmp:false});
  fs.writeFileSync(path.join(outDir, "specialized-capabilities.json"), JSON.stringify(capabilities, null, 2));

  if (capabilities.spatial) {
  console.log("[YURIKA] Rendering 3D localization cue benchmark...");
  const spatialSmall = await page.evaluate(async () => {
    globalThis.__SPECIALIZED_SPATIAL_RESULT__ = null;
    return await globalThis.runSpatialLocalizationTest(chrome.runtime.getURL("tests/audio_quality/spatial-localization-stimulus.wav"));
  });
  await page.waitForFunction(() => globalThis.__SPECIALIZED_SPATIAL_RESULT__?.postSpatial?.left, null, { timeout:180_000 });
  const spatial = await page.evaluate(() => globalThis.__SPECIALIZED_SPATIAL_RESULT__);
  dumpTap("spatial", "pre-hrtf", spatial.preHrtf, spatial.sampleRate);
  dumpTap("spatial", "pre-spatial", spatial.preSpatial, spatial.sampleRate);
  dumpTap("spatial", "post", spatial.postSpatial, spatial.sampleRate);
  fs.writeFileSync(path.join(outDir, "spatial.status.json"), JSON.stringify(spatialSmall.status ?? {}, null, 2));
  fs.writeFileSync(path.join(outDir, "spatial.runtime.json"), JSON.stringify(spatialSmall, null, 2));
  } else { console.log("[YURIKA] Spatial specialized bench skipped: feature unavailable."); }

  if (capabilities.sonobus) {
  console.log("[YURIKA] Rendering SonoBus Mobile stage-isolation benchmark...");
  const sonobusSmall = await page.evaluate(async () => {
    globalThis.__SPECIALIZED_SONOBUS_RESULT__ = null;
    return await globalThis.runSonoBusDiagnosticTest(chrome.runtime.getURL("tests/audio_quality/quality-stimulus.wav"));
  });
  await page.waitForFunction(() => globalThis.__SPECIALIZED_SONOBUS_RESULT__?.final?.left, null, { timeout:180_000 });
  const sonobus = await page.evaluate(() => globalThis.__SPECIALIZED_SONOBUS_RESULT__);
  dumpTap("sonobus", "pre-hrtf", sonobus.preHrtf, sonobus.sampleRate);
  dumpTap("sonobus", "post-hrtf", sonobus.postHrtf, sonobus.sampleRate);
  dumpTap("sonobus", "post-spatial", sonobus.postSpatial, sonobus.sampleRate);
  dumpTap("sonobus", "final", sonobus.final, sonobus.sampleRate);
  fs.writeFileSync(path.join(outDir, "sonobus.status.json"), JSON.stringify(sonobusSmall.status ?? {}, null, 2));
  fs.writeFileSync(path.join(outDir, "sonobus.runtime.json"), JSON.stringify(sonobusSmall, null, 2));
  } else { console.log("[YURIKA] SonoBus specialized bench skipped: feature unavailable."); }

  if (capabilities.virtualAmp) {
  console.log("[YURIKA] Rendering Virtual Class-A amplifier benchmark...");
  const ampSmall = await page.evaluate(async () => {
    globalThis.__SPECIALIZED_AMP_RESULT__ = null;
    return await globalThis.runVirtualAmpBench(chrome.runtime.getURL("tests/audio_quality/amp-benchmark-stimulus.wav"));
  });
  await page.waitForFunction(() => globalThis.__SPECIALIZED_AMP_RESULT__?.postAmp?.left, null, { timeout:180_000 });
  const amp = await page.evaluate(() => globalThis.__SPECIALIZED_AMP_RESULT__);
  dumpTap("amp", "pre", amp.preAmp, amp.sampleRate);
  dumpTap("amp", "post", amp.postAmp, amp.sampleRate);
  dumpTap("amp", "final", amp.final, amp.sampleRate);
  fs.writeFileSync(path.join(outDir, "amp.status.json"), JSON.stringify(ampSmall.status ?? {}, null, 2));
  fs.writeFileSync(path.join(outDir, "amp.runtime.json"), JSON.stringify(ampSmall, null, 2));
  } else { console.log("[YURIKA] Virtual Amp specialized bench skipped: feature unavailable."); }

  console.log("[YURIKA] Specialized renders complete.");
} catch (error) {
  const failure = { time:new Date().toISOString(), name:error?.name ?? "Error", message:error?.message ?? String(error), stack:error?.stack ?? null };
  fs.writeFileSync(path.join(outDir, "specialized-render-failure.json"), JSON.stringify(failure, null, 2));
  console.error("[YURIKA] Specialized render failed:", error);
  process.exitCode = 1;
} finally {
  if (context) try { await context.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive:true, force:true }); } catch {}
}
