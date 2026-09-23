"use strict";
const assert = require("assert");
const fs = require("fs"), vm = require("vm"), path = require("path");
let Processor = null;
class Base { constructor(){ this.port={onmessage:null}; } }
const sandbox = {
  AudioWorkletProcessor: Base,
  sampleRate: 48000,
  registerProcessor: (name, cls) => { assert.equal(name,"yurika-noise-suppressor"); Processor=cls; },
  Math, console
};
vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../noise-worklet.js"),"utf8"), vm.createContext(sandbox));
assert(Processor);

function run(strength, amp, blocks=80) {
  const p=new Processor(); p.port.onmessage({data:{strength}});
  let last;
  for(let b=0;b<blocks;b++) {
    const input=[new Float32Array(128).fill(amp),new Float32Array(128).fill(amp)];
    const output=[new Float32Array(128),new Float32Array(128)];
    assert.equal(p.process([input],[output]),true); last=output[0][127];
  }
  return last;
}
const bypass=run(0,0.001); assert(Math.abs(bypass-0.001)<0.00002);
const suppressed=run(100,0.001); assert(Math.abs(suppressed)<Math.abs(bypass));
const loud=run(100,0.2); assert(Math.abs(loud)>0.15);
console.log("PASS noise_worklet_test bypass + quiet suppression + loud preservation");
