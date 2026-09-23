'use strict';
const assert=require('node:assert/strict');
require('../self-dap-core.js');
const s=globalThis.YurikaSelfDap;
const sparse=Float32Array.from([-40,-Infinity,-Infinity,-Infinity,-80,-80,-80,-80]);
const measured=s.bandAverageDb(sparse,16000,0,4000);
assert(Math.abs(measured-(-40-10*Math.log10(4)))<1e-9);
assert.equal(s.bandAverageDb(sparse,16000,4000,8000),-80);
assert.equal(s.bandAverageDb(new Float32Array(8).fill(-Infinity),16000,0,8000),-120);
assert.equal(s.bandAverageDb(Float32Array.from([-40,NaN]),8000,0,4000),-120);
for(const [lo,hi] of [[NaN,4000],[0,Infinity],[4000,4000],[5000,4000]]) assert.equal(s.bandAverageDb(sparse,16000,lo,hi),-120);
for(const sr of [44100,48000,96000]) {
 const bins=new Float32Array(1024).fill(-45);
 for(const x of Object.values(s.spectrumBands(bins,sr))) assert(Math.abs(x+45)<1e-9);
}
console.log('PASS self_dap_precision_test: silence divisor, half-open bands, invalid inputs, 3 sample rates');
