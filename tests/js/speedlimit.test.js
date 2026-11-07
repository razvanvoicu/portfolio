const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = import('../../sites/speedlimit/static/core.mjs');
test('inclusive threshold, fractional speeds, and negative tolerance', async () => {
  const {isOver, threshold} = await core;
  assert.equal(threshold(70, 2), 68);
  assert.equal(isOver(68, 70, 2), false);
  assert.equal(isOver(68.01, 70, 2), true);
  assert.equal(isOver(72, 70, -2), false);
  assert.equal(isOver(72.01, 70, -2), true);
  assert.equal(isOver(null, 70, 2), false);
  assert.equal(isOver(90, null, 2), false);
});
test('unknown device speed is never coerced to stopped', async () => {
  const {speedKph} = await core;
  assert.equal(speedKph({speed:null}), null);
  assert.equal(speedKph({speed:-1}), null);
  assert.equal(speedKph({speed:0}), 0);
  assert.equal(speedKph({speed:20}), 72);
});
test('Singapore boundary excludes Malaysia, Indonesia and polygon holes', async () => {
  const fs = require('node:fs');
  const raw = fs.readFileSync('sites/speedlimit/static/road-data.js', 'utf8');
  const data = await import('data:text/javascript;base64,' + Buffer.from(raw).toString('base64'));
  const {inSingapore} = await core;
  assert.equal(inSingapore([103.851,1.29], data.SG_POLYGONS), true);
  assert.equal(inSingapore([103.763,1.484], data.SG_POLYGONS), false);
  assert.equal(inSingapore([104.03,1.13], data.SG_POLYGONS), false);
  assert.equal(inSingapore([103.77,1.46], data.SG_POLYGONS), false);
  const {corrections} = JSON.parse(fs.readFileSync('sites/speedlimit/data/sign-corrections.json', 'utf8'));
  const disabledSourceSigns = corrections.filter(entry=>entry.operation==='disable' && typeof entry.id==='number').length;
  assert.equal(data.SPEED_SIGNS.filter(sign=>typeof sign[4]==='number').length, 4338 - disabledSourceSigns);
  assert.equal(data.SPEED_SIGNS.length, data.DATA_INFO.signCount);
  assert.equal(data.SPEED_SIGNS.some(sign=>sign[4]===81950), false);
  assert.equal(data.SPEED_SIGNS.some(sign=>sign[4]===83759), false);
  assert.equal(data.SPEED_SIGNS.some(sign=>sign[4]===81945), false);
  assert.equal(data.SPEED_SIGNS.find(sign=>sign[4]===64917)[2], 80);
  for (const id of [83665, 83664, 34637, 81946, 81951]) {
    assert.equal(data.SPEED_SIGNS.find(sign=>sign[4]===id)[2], 80);
  }
  assert.equal(data.SPEED_SIGNS.find(sign=>sign[4]===73788)[2], 90);
  assert.equal(inSingapore([2,2], [[[[0,0],[4,0],[4,4],[0,4]],[[1,1],[3,1],[3,3],[1,3]]]]), false);
});
