const {test} = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../../sites/speedlimit/static/core.mjs'), import('../../sites/speedlimit/static/config.mjs')]);
const origin = [103.85, 1.3];
const point = north => [origin[0], origin[1] + north / 111194.9266];
const sign = (north, limit, id) => [...point(north), limit, 0, id];

test('a drop of at least 20 km/h is ignored strictly above its midpoint', async () => {
  const [{ignoreSpeedSign}] = await modules;
  for (const [current, incoming, speed, ignored] of [
    [80, 50, 65.01, true], [80, 50, 65, false], [80, 50, 64.99, false],
    [80, 60, 70.01, true], [80, 60, 70, false], [80, 61, 120, false],
    [80, 40, 60.01, true], [80, 40, 60, false],
    [90, 50, 70.01, true], [90, 50, 70, false], [90, 50, 69.99, false],
    [90, 40, 65.01, true], [90, 40, 65, false], [90, 40, 64.99, false],
    [80, 80, 120, false], [80, 90, 120, false],
    [80, 50, null, false], [80, 50, undefined, false], [80, 50, NaN, false],
    [80, 50, Infinity, false], [80, 50, 0, false],
  ]) assert.equal(ignoreSpeedSign(current, incoming, speed), ignored, `${current} to ${incoming}, speed ${speed}`);
});

test('a fast passage retains 80, consumes the ignored 50 and allows a later small drop', async () => {
  const [{DriveTracker}, {CONFIG}] = await modules;
  const tracker = new DriveTracker([sign(-150, 80, 1), sign(0, 50, 2), sign(200, 70, 3)], CONFIG);
  for (const north of [-180, -160, -140, -60, -40, 10]) tracker.update(point(north), 80);
  assert.equal(tracker.limit, 80);
  assert.equal(tracker.sign.id, 1);
  assert.equal(tracker.encounters.get(2).handled, true);
  tracker.update(point(20), 40);
  assert.equal(tracker.limit, 80, 'slowing after passage does not apply the consumed sign');
  for (const north of [70, 140, 190, 210]) tracker.update(point(north), 80);
  assert.equal(tracker.limit, 70);
  assert.equal(tracker.sign.id, 3);
});

test('slow, midpoint and unknown-speed passages apply the lower limit', async () => {
  const [{DriveTracker}, {CONFIG}] = await modules;
  for (const speed of [64, 65, null]) {
    const tracker = new DriveTracker([sign(-150, 80, 1), sign(0, 50, 2)], CONFIG);
    for (const north of [-180, -160, -140, -60, -40, 10]) tracker.update(point(north), speed);
    assert.equal(tracker.limit, 50, `speed ${speed}`);
    assert.equal(tracker.sign.id, 2);
  }
});

test('a later encounter can apply a sign ignored on an earlier pass', async () => {
  const [{DriveTracker}, {CONFIG}] = await modules;
  const tracker = new DriveTracker([sign(-150, 80, 1), sign(0, 50, 2)], CONFIG);
  for (const north of [-180, -160, -140, -60, -40, 10, 100, 200]) tracker.update(point(north), 80);
  assert.equal(tracker.encounters.has(2), false);
  for (const north of [150, 100, 50, 0, -50, -100, -150, -200, -220,
    -200, -180, -160, -140, -120, -100, -60, -40, 10]) tracker.update(point(north), 60);
  assert.equal(tracker.limit, 50);
  assert.equal(tracker.sign.id, 2);
});
