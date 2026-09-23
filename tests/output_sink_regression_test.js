'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../offscreen.js'),'utf8');
const begin=source.indexOf('  if(ctx && next.headphoneOutputDeviceId');
const end=source.indexOf('  if (!next.reflectionCharacterEnabled)',begin);
assert(begin>=0 && end>begin);
const snippet=source.slice(begin,end);
(async()=>{
 for(const target of ['', 'speaker-B']) {
  const calls=[],state={};
  vm.runInNewContext(snippet,{ctx:{setSinkId:id=>{calls.push(id);return Promise.resolve();}},next:{headphoneOutputDeviceId:target},previous:{headphoneOutputDeviceId:'speaker-A'},state});
  await new Promise(setImmediate);
  assert.deepEqual(calls,[target]);assert.equal(state.headphoneOutputSinkApplied,true);
 }
 const state={};
 vm.runInNewContext(snippet,{ctx:{setSinkId:()=>{throw Error('device removed');}},next:{headphoneOutputDeviceId:''},previous:{headphoneOutputDeviceId:'A'},state});
 await new Promise(setImmediate);
 assert.equal(state.headphoneOutputSinkApplied,false);
 assert.equal(state.headphoneOutputSinkError,'device removed');
 console.log('PASS output_sink_regression_test: default, explicit, synchronous rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
