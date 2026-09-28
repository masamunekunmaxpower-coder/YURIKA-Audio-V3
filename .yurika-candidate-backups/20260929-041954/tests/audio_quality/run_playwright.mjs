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
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); // IEEE float
  b.writeUInt16LE(2, 22); // stereo
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2 * 4, 28);
  b.writeUInt16LE(8, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames; i++) {
    L.copy(b, 44 + i * 8, i * 4, i * 4 + 4);
    R.copy(b, 48 + i * 8, i * 4, i * 4 + 4);
  }

  fs.writeFileSync(file, b);
}

const userDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "yurika-audio-quality-")
);

let context = null;

try {
  console.log("[YURIKA] Launching Playwright Chromium in headless extension mode...");

  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    timeout: 60_000,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox"
    ]
  });

  const workers = context.serviceWorkers();
  const worker =
    workers[0] ||
    await context.waitForEvent("serviceworker", { timeout: 30_000 });

  const extensionId = new URL(worker.url()).host;
  console.log(`[YURIKA] Extension loaded: ${extensionId}`);

  const page = await context.newPage();
  page.on("console", (msg) =>
    console.log(`[browser:${msg.type()}] ${msg.text()}`)
  );
  page.on("pageerror", (err) =>
    console.error("[browser:pageerror]", err)
  );

  await page.goto(
    `chrome-extension://${extensionId}/tests/audio_quality/runtime.html`,
    { waitUntil: "load", timeout: 30_000 }
  );

  await page.waitForFunction(
    () => typeof globalThis.runYurikaQualityTest === "function",
    null,
    { timeout: 30_000 }
  );

  const profiles = await page.evaluate(() =>
    typeof globalThis.getYurikaQualityProfiles === "function"
      ? globalThis.getYurikaQualityProfiles()
      : ["neutral", "clean", "music", "selfdap"]
  );
  fs.writeFileSync(path.join(outDir, "profiles.json"), JSON.stringify(profiles, null, 2));

  for (const profile of profiles) {
    console.log(`[YURIKA] Rendering ${profile}...`);

    const small = await page.evaluate(async ({ profile }) => {
      globalThis.__QUALITY_RESULT__ = null;
      return await globalThis.runYurikaQualityTest(
        chrome.runtime.getURL(
          "tests/audio_quality/quality-stimulus.wav"
        ),
        profile
      );
    }, { profile });

    await page.waitForFunction(
      () =>
        globalThis.__QUALITY_RESULT__ &&
        typeof globalThis.__QUALITY_RESULT__.left === "string" &&
        typeof globalThis.__QUALITY_RESULT__.right === "string" &&
        typeof globalThis.__QUALITY_RESULT__.referenceLeft === "string" &&
        typeof globalThis.__QUALITY_RESULT__.referenceRight === "string",
      null,
      { timeout: 180_000 }
    );

    const result = await page.evaluate(
      () => globalThis.__QUALITY_RESULT__
    );

    fs.writeFileSync(
      path.join(outDir, `${profile}.status.json`),
      JSON.stringify(small.status ?? {}, null, 2)
    );

    writeFloatWav(
      path.join(outDir, `${profile}.ref.wav`),
      result.referenceLeft,
      result.referenceRight,
      result.sampleRate
    );

    writeFloatWav(
      path.join(outDir, `${profile}.wav`),
      result.left,
      result.right,
      result.sampleRate
    );

    console.log(
      `[YURIKA] ${profile}: ${result.sampleRate} Hz, synchronized input/output WAVs written`
    );
  }

  console.log(
    "[YURIKA] All supported profiles rendered with synchronized references."
  );
} catch (error) {
  const failure = {
    time: new Date().toISOString(),
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack ?? null
  };

  fs.writeFileSync(
    path.join(outDir, "render-failure.json"),
    JSON.stringify(failure, null, 2)
  );

  console.error("[YURIKA] Render failed:", error);
  process.exitCode = 1;
} finally {
  if (context) {
    try {
      await context.close();
    } catch (e) {
      console.error("[YURIKA] Context close warning:", e);
    }
  }

  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}
