"use strict";
const assert=require("assert"),fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.resolve(__dirname,"..");const sb={globalThis:null};sb.globalThis=sb;vm.runInContext(fs.readFileSync(path.join(root,"adaptive-v29.js"),"utf8"),vm.createContext(sb));const a=sb.YurikaAdaptiveV29;assert(a);assert.equal(a.CALIBRATION_FREQUENCIES.length,8);
let r=a.deriveCalibrationGains([-30,-31,-32,-31,-30,-29,-30,-31],-55);assert(r.ok);assert.equal(r.gainsDb.length,8);for(const g of r.gainsDb)assert(Math.abs(g)<=3.000001);assert(a.calibrationPrecutDb(r.gainsDb,100)<=0);
r=a.deriveCalibrationGains([-50,-50,-50,-50,-50,-50,-50,-50],-55);assert(!r.ok&&r.reason==="low-snr");
assert.deepEqual(Array.from(a.safeCalibrationArray([9,-9,1,2,3,4,5,6])),[3,-3,1,2,3,3,3,3]);
console.log("PASS adaptive_v29_test bounded 8-band calibration + low-SNR reject + headroom precut");