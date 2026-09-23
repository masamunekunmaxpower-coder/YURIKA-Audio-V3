const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const dsp = fs.readFileSync(path.join(root, "dsp-core.js"), "utf8");
const self = fs.readFileSync(path.join(root, "self-dap-core.js"), "utf8");
function ok(cond, msg){ if(!cond) throw new Error(msg); }
ok(dsp.includes("FINAL_LIMITER_MAKEUP_COMPENSATION_DB = -0.57"), "missing -0.57 dB limiter compensation");
ok(self.includes("bufferHarmonic: 0.006 * t"), "buffer harmonic not polished");
ok(self.includes("abHarmonic: 0.009 * t"), "AB harmonic not polished");
ok(self.includes("sideDelaySeconds: 0"), "Self-DAP side delay regression");
ok(self.includes("sideHpfHz: 5"), "Self-DAP side HPF regression");
console.log("PASS final_polish_v25_test");
