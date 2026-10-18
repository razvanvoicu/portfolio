const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'),import('../../sites/speedlimit/static/config.mjs')]);
test('gentle warning includes 3 km/h excess, louder warning begins strictly above it',async()=>{
  const [m,{CONFIG:c}] = await modules;
  assert.equal(m.warningLevel(68,70,2,c),'off');
  assert.equal(m.warningLevel(68.1,70,2,c),'gentle');
  assert.equal(m.warningLevel(71,70,2,c),'gentle');
  assert.equal(m.warningLevel(71.01,70,2,c),'loud');
  assert.equal(m.warningLevel(75,70,-2,c),'gentle');
  assert.equal(m.warningLevel(75.01,70,-2,c),'loud');
  assert.equal(m.warningLevel(null,70,0,c),'off');
});
test('visual severity remains available at limits where sound is suppressed',async()=>{
  const [m,{CONFIG:c}] = await modules;
  assert.equal(m.warningLevel(54,50,0,c),'loud');
  assert.equal(m.shouldSound(54,50,0,c),false);
  assert.equal(m.warningLevel(63,60,0,c),'gentle');
  assert.equal(m.shouldSound(63,60,0,c),true);
});
