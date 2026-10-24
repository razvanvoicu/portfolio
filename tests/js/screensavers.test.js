const { test } = require('node:test');
const assert = require('node:assert/strict');

test('curated pillow transitions preserve velocity and finish away from retracing phases', async () => {
  const { pillowRatios, createTransition, transitionPhase } = await import('../../sites/screensavers/static/animations/lissajous.mjs');
  for (const family of [pillowRatios]) {
    for (let index = 1; index < family.length; index++) {
      for (const [from, to] of [[family[index - 1], family[index]], [family[index], family[index - 1]]]) {
        const transition = createTransition(from, to, [Math.PI / (2 * from[1]), 0]);
        const [m, n] = to;
        const end = transitionPhase(transition, 20);
        assert.ok(Math.abs(Math.cos(n * end[0] - m * end[1])) < 1e-10);
        for (const boundary of [8, 20]) {
          const h = 1e-4;
          const a = transitionPhase(transition, boundary - h);
          const b = transitionPhase(transition, boundary);
          const c = transitionPhase(transition, boundary + h);
          for (let axis = 0; axis < 2; axis++) {
            assert.ok(Math.abs((c[axis] - b[axis]) / h - (b[axis] - a[axis]) / h) < 1e-5);
          }
        }
      }
    }
  }
});

test('pillow sequence joins remain continuous across repeated forward and reverse transitions', async () => {
  const { pillowRatios, PillowSequence } = await import('../../sites/screensavers/static/animations/lissajous.mjs');
  for (const family of [pillowRatios]) {
    const sequence = new PillowSequence(family);
    const h = 1e-5;
    for (let segment = 1; segment <= 100; segment++) {
      const before = sequence.phaseAt(segment * 36 - h);
      const at = sequence.phaseAt(segment * 36);
      const after = sequence.phaseAt(segment * 36 + h);
      const [m, n] = family[sequence.index];
      assert.ok(Math.abs(Math.cos(n * at[0] - m * at[1])) < 1e-9);
      for (let axis = 0; axis < 2; axis++) {
        assert.ok(Math.abs(Math.cos(at[axis]) - Math.cos(before[axis])) < 1e-4);
        const left = (Math.cos(at[axis]) - Math.cos(before[axis])) / h;
        const right = (Math.cos(after[axis]) - Math.cos(at[axis])) / h;
        assert.ok(Math.abs(left - right) < 0.002);
      }
    }
  }
});

test('one pillow sequence visits all five ratios and returns along the same path', async () => {
  const { pillowRatios, PillowSequence } = await import('../../sites/screensavers/static/animations/lissajous.mjs');
  const sequence = new PillowSequence(pillowRatios);
  const visited = [];
  for (let segment = 0; segment <= 8; segment++) {
    sequence.phaseAt(segment * 36);
    visited.push([...sequence.family[sequence.index]]);
  }
  assert.deepEqual(visited, [[7, 8], [8, 9], [9, 10], [7, 11], [9, 14], [7, 11], [9, 10], [8, 9], [7, 8]]);
});

test('pillow trail remains bounded and independent of update cadence', async () => {
  const { pillows } = await import('../../sites/screensavers/static/animations/lissajous.mjs');
  const a = pillows.create(), b = pillows.create();
  a.resize(1920, 1080); b.resize(1920, 1080);
  for (let i = 0; i < 91 * 120; i++) a.update(1 / 120);
  for (let i = 0; i < 91 * 60; i++) b.update(1 / 60);
  assert.ok(a.samples.length <= 3361 && a.samples.length >= 3360);
  assert.ok(b.samples.length <= 3361 && b.samples.length >= 3360);
  const lastA = a.samples.at(-1), lastB = b.samples.at(-1);
  assert.ok(Math.abs(lastA.time - lastB.time) <= 1 / 240 + 1e-9);
  assert.ok(Math.abs(lastA.x - lastB.x) < 0.04);
  assert.ok(Math.abs(lastA.y - lastB.y) < 0.04);
  for (const point of a.samples) {
    assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1);
  }
});

test('Wheely midpoint and quarter points follow the specified loci', async () => {
  const { rodPoint } = await import('../../sites/screensavers/static/animations/wheely.mjs');
  for (let angle = 0; angle < Math.PI * 2; angle += 0.03) {
    const m = rodPoint(angle, 0.5);
    assert.ok(Math.abs(m.x ** 2 + m.y ** 2 - 0.25) < 1e-12);
    for (const f of [0.25, 0.75]) {
      const p = rodPoint(angle, f);
      assert.ok(Math.abs((p.x / (1 - f)) ** 2 + (p.y / f) ** 2 - 1) < 1e-12);
    }
  }
});

test('wandering stays inside bounds through smooth steering without clamping', async () => {
  const { Wander } = await import('../../sites/screensavers/static/wander.mjs');
  for (const [width, height] of [[1920, 1080], [1080, 1920], [800, 800], [100, 70]]) {
    for (let seed = 1; seed <= 20; seed++) {
      let state = seed;
      const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
      const wander = new Wander(random);
      wander.resize(width, height, Math.min(width, height) * 0.8);
      for (let i = 0; i < 72000; i++) {
        const heading = wander.heading;
        const x = wander.x, y = wander.y;
        wander.update(1 / 120);
        assert.ok(wander.x > wander.minX && wander.x < wander.maxX);
        assert.ok(wander.y > wander.minY && wander.y < wander.maxY);
        assert.ok(Math.abs(wander.heading - heading) < Math.PI / 2);
        assert.ok(Math.abs(Math.hypot(wander.x - x, wander.y - y) * 120 - 7.5) < 1e-8);
      }
      wander.resize(320, 240, 192);
      assert.ok(wander.x >= wander.minX && wander.x <= wander.maxX);
      assert.ok(wander.y >= wander.minY && wander.y <= wander.maxY);
    }
  }
});
