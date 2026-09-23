'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 for(const failStop of [false,true]) {
  let closed=0,stopped=0,graphStopped=0;
  const box={AudioContext:class {
   async resume(){} async close(){closed++;}
   createMediaStreamDestination(){return {stream:{}};}
   createGain(){return {gain:{},connect(){}};}
   createOscillator(){return {frequency:{},connect(){},start(){},stop(){stopped++;}};}
  },YurikaAudioCore:{DEFAULTS:{},PRESETS:{flat:{}},sanitizeSettings:s=>s},
  __YURIKA_TEST_API__:{start:async()=>({ok:false,error:'test-start-failure'}),stop:async()=>{graphStopped++;if(failStop)throw Error('stop-failure');}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'audio_quality/runtime.js'),'utf8'),box);
  await assert.rejects(box.runYurikaQualityTest('unused'),/failure/);
  assert.equal(closed,1);assert.equal(stopped,1);assert.equal(graphStopped,1);
 }
 console.log('PASS quality_cleanup_test: startup failure and teardown failure close owned resources');
})().catch(e=>{console.error(e);process.exitCode=1;});
