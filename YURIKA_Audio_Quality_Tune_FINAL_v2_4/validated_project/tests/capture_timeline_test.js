'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'audio_quality/capture-worklet.js'), 'utf8');
for (const sr of [44100,48000,96000]) {
  let Processor;
  const messages=[];
  const box={sampleRate:sr,currentTime:0,currentFrame:0,Float32Array,
    AudioWorkletProcessor:class {constructor(){this.port={postMessage:m=>messages.push(m)};}},
    registerProcessor:(_,p)=>{Processor=p;}};
  vm.runInNewContext(source,box);
  const p=new Processor();
  p.port.onmessage({data:{type:'start',frames:300,startAt:64.25/sr}});
  for(let q=0;q<4;q++) {
    box.currentFrame=q*128;box.currentTime=box.currentFrame/sr;
    const out=new Float32Array(128).fill(9);
    p.process(q===1?[[]]:[[new Float32Array(128).fill(q+1)]],[[out]]);
    assert(out.every(v=>v===0));
  }
  assert.equal(messages.length,1);assert.equal(messages[0].type,'done');
  const a=messages[0].left;
  assert.equal(a.length,300);
  assert(a.slice(0,63).every(v=>v===1));
  assert(a.slice(63,191).every(v=>v===0));
  assert(a.slice(191).every(v=>v===3));
  assert.deepEqual(messages[0].right,a);
  for(const frames of [0,-1,NaN,Infinity,2**32,1.5]) {
    p.port.onmessage({data:{type:'start',frames}});
    assert.equal(messages.at(-1).type,'error');
  }
  // Entirely disconnected capture must still complete, including a partial last block.
  box.currentFrame=0;box.currentTime=0;
  p.port.onmessage({data:{type:'start',frames:17,startAt:0}});
  p.process([[]],[[new Float32Array(128)]]);
  assert.equal(messages.at(-1).type,'done');
  assert(messages.at(-1).left.every(v=>v===0));
}
console.log('PASS capture_timeline_test: 3 sample rates, partial blocks, dropout, mono, silence, invalid bounds');
