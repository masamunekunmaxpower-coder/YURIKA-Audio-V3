"use strict";
const assert=require("assert");
require("../dsp-core.js");
const c=globalThis.YurikaAudioCore;

const current=c.sanitizeSettings({
  ...c.DEFAULTS,
  enabled:true,
  preset:"clean",
  dapMode:"tube", dapStrength:83,
  selfDapEnabled:true, selfDapStrength:77, selfDapRestoration:"on", selfDapRestorationCutoffKhz:16,
  perspectiveEnabled:true, perspectiveDepth:73, hiResMode:false
});
const music=c.applyPreset(current,"music");
assert.equal(music.preset,"music");
assert.equal(music.bassDb,2.0);
assert.equal(music.width,35);
assert.equal(music.dapMode,"tube");
assert.equal(music.dapStrength,83);
assert.equal(music.selfDapEnabled,true);
assert.equal(music.selfDapStrength,77);
assert.equal(music.selfDapRestoration,"on"); assert.equal(music.selfDapRestorationCutoffKhz,16); assert.equal(music.perspectiveEnabled,true); assert.equal(music.perspectiveDepth,73);

const studio=c.applyPreset(music,"studio");
assert.equal(studio.hiResMode,true);
assert.equal(studio.dapMode,"tube");
assert.equal(studio.selfDapEnabled,true); assert.equal(studio.perspectiveEnabled,true); assert.equal(studio.perspectiveDepth,73);

const selfRef=c.applyPreset(current,"selfdap");
assert.equal(selfRef.preset,"selfdap");
assert.equal(selfRef.selfDapEnabled,true);
assert.equal(selfRef.selfDapStrength,70);
assert.equal(selfRef.selfDapRestoration,"auto");
assert.equal(selfRef.dapMode,"off");
assert.equal(selfRef.dapStrength,0);
assert.equal(selfRef.hiResMode,true); assert.equal(selfRef.perspectiveEnabled,true); assert.equal(selfRef.perspectiveDepth,73);

const afterSelfMusic=c.applyPreset(selfRef,"music");
assert.equal(afterSelfMusic.preset,"music");
assert.equal(afterSelfMusic.selfDapEnabled,true);
assert.equal(afterSelfMusic.selfDapStrength,70);
assert.equal(afterSelfMusic.selfDapRestoration,"auto");
assert.equal(afterSelfMusic.dapMode,"off");

const patch=c.sanitizeSettingsPatch({bassDb:999,selfDapStrength:-50});
assert.deepEqual(Object.keys(patch).sort(),["bassDb","selfDapStrength"].sort());
assert.equal(patch.bassDb,6);
assert.equal(patch.selfDapStrength,0);
assert.equal(Object.prototype.hasOwnProperty.call(patch,"selfDapEnabled"),false);
assert.equal(Object.prototype.hasOwnProperty.call(patch,"dapMode"),false);

const legacy=c.migrateStoredSettings({
  preset:"music", bassDb:1, dapMode:"natural", dapStrength:61,
  selfDapEnabled:true,selfDapStrength:88,selfDapRestoration:"auto"
});
assert.equal(legacy.settingsSchemaVersion,c.SETTINGS_SCHEMA_VERSION);
assert.equal(legacy.dapMode,"natural");
assert.equal(legacy.dapStrength,61);
assert.equal(legacy.selfDapEnabled,true);
assert.equal(legacy.selfDapStrength,88);

for(const name of ["flat","clean","music","voice","night","studio","immersive"]){
  const p=c.PRESETS[name];
  for(const key of [...c.VIRTUAL_DAP_KEYS,...c.SELF_DAP_KEYS,...c.PERSPECTIVE_KEYS]){
    assert.equal(Object.prototype.hasOwnProperty.call(p,key),false,`${name} unexpectedly owns independent key ${key}`);
  }
}
console.log("PASS settings_layer_test EQ/DAP/Perspective layer isolation + system preset + migration");
