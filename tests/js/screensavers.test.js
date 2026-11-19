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

test('Wheely rotates uniformly every nine seconds with 80% trails above the rod', async () => {
  const { wheely } = await import('../../sites/screensavers/static/animations/wheely.mjs');
  const animation = wheely.create();
  animation.resize(1000, 1000);
  const operations = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => operations.push({ op: key, args, color: target.strokeStyle });
    },
  });
  for (const elapsed of [8, 0.5, 0.5, 0.5]) {
    animation.update(elapsed);
    operations.length = 0;
    animation.draw(ctx);
    const rodIndex = operations.findIndex(o => o.op === 'stroke' && o.color === '#c8ddd2');
    const trails = operations.map((o, i) => ({ ...o, i })).filter(o => o.op === 'stroke' && o.color.startsWith('hsl('));
    assert.ok(trails.length > 0 && trails.every(o => o.i > rodIndex));
    const start = operations[rodIndex - 2].args;
    const angle = Math.atan2(operations[rodIndex - 1].args[1], start[0]);
    const expected = animation.time * 2 * Math.PI / 9;
    assert.ok(Math.abs(Math.sin(angle) - Math.sin(expected)) < 1e-12);
    assert.ok(Math.abs(Math.cos(angle) - Math.cos(expected)) < 1e-12);
    const span = animation.time - animation.samples[0];
    assert.ok(Math.abs(span / 9 - 0.8) < 1 / 540 + 1e-10);
    assert.equal(operations.filter(o => o.op === 'closePath').length, 2);
  }
});

test('curve screensavers are registered after the existing screensavers', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../sites/screensavers/static/app.mjs'), 'utf8');
  assert.match(source, /\[wheely, pillows, star, pentagram, sineflower, morph\]/);
});

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('star screensaver geometry is closed, continuous and matches the exported morph weight', async () => {
  const { curvePoint, weight } = await import('../../sites/screensavers/static/animations/curve-saver.mjs');
  const { starPieces, segments, second } = await import('../../sites/screensavers/static/animations/curve-star.mjs');
  const CurveFormula = require('../../sites/curves/static/curve-formula.js');
  // Without a morph interval the curve is the first curve alone: a closed loop with no jumps.
  let previous = curvePoint(starPieces, 0, 0, 0, 0.1);
  assert.ok(distance(previous, curvePoint(starPieces, 1, 0, 0, 0.1)) < 1e-9);
  for (let i = 1; i <= 20000; i++) {
    const point = curvePoint(starPieces, i / 20000, 0, 0, 0.1);
    assert.ok(distance(previous, point) < 1, `jump near t=${i / 20000}`);
    previous = point;
  }
  // Every segment boundary is continuous for the second curve too.
  const names = segments.map(segment => segment[2]);
  for (let i = 1; i < segments.length; i++) {
    const boundary = segments[i - 1][0];
    if (names[i] !== names[i - 1]) assert.ok(distance(second[names[i - 1]](boundary), second[names[i]](boundary)) < 1e-9, `second curve jumps at ${boundary}`);
  }
  // The weight is the one the Curves app exports.
  const [x] = CurveFormula.successiveCoordinates([{ a: 0, b: 1, expression: () => ['3', '5'] }], [{ a: 0, b: 1, expression: () => ['7', '11'] }]);
  for (const [t, s1, s2, e] of [[0.1, 0.3, 0.85, 0.3], [0.5, 0.3, 0.85, 0.3], [0.9, 0.8, 0.2, 0.1], [0.05, 0.8, 0.2, 0.1], [0.3, 0.2, 0.2, 0.1], [0.7, 1.4, 2.9, 0.05]]) {
    const expected = (Function('t', 's1', 's2', 'e', `return ${x};`)(t, s1, s2, e) - 3) / 4;
    assert.ok(Math.abs(weight(t, s1, s2, e) - expected) < 1e-12);
  }
});

test('pentagram screensaver has a closed flower, and a closed pentagram made of five joined edges', async () => {
  const { flower, edge, pentagramPieces } = await import('../../sites/screensavers/static/animations/curve-pentagram.mjs');
  assert.ok(distance(flower(0), flower(1)) < 1e-9);
  for (let turns = 0; turns < 5; turns++) {
    const next = (turns + 1) % 5;
    assert.ok(distance(edge(turns, (turns + 1) * 0.2), edge(next, next * 0.2)) < 1e-9, `edge ${turns} does not meet edge ${next}`);
  }
  // Each segment's second curve is the edge it covers.
  for (const t of [0.05, 0.25, 0.5, 0.65, 0.95]) {
    const turns = Math.min(4, Math.floor(t / 0.2));
    assert.ok(distance(edge(turns, t), pentagramPieces.find(p => t < p.end).to(t)) < 1e-12);
  }
});

test('curve screensaver successive motion matches the Curves app animation', async () => {
  const { advanceSuccessive, oscillation } = await import('../../sites/screensavers/static/animations/curve-saver.mjs');
  const { starAnimations } = await import('../../sites/screensavers/static/animations/curve-star.mjs');
  const CurveAnimation = require('../../sites/curves/static/animation.js');
  const copy = structuredClone(starAnimations.successive), reference = structuredClone(starAnimations.successive);
  for (let step = 0; step < 6000; step++) {
    advanceSuccessive(copy, 1000 / 120);
    CurveAnimation.advanceSuccessive(reference, 1000 / 120);
  }
  assert.deepEqual(copy, reference);
  assert.equal(oscillation(0.1, 0.02, 0.25), CurveAnimation.oscillation(0.1, 0.02, 0.25));
});

test('sineflower screensaver blends the flower into a closed circle and rotates like the Curves app', async () => {
  const { curvePoint, advanceRotation, rotatePoint } = await import('../../sites/screensavers/static/animations/curve-saver.mjs');
  const { circle, sineflowerPieces } = await import('../../sites/screensavers/static/animations/curve-sineflower.mjs');
  const CurveAnimation = require('../../sites/curves/static/animation.js');
  assert.ok(distance(circle(0), circle(1)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...circle(0.37)) - 80) < 1e-9);
  // Well inside the morph interval the curve is the circle; outside it, the flower.
  assert.ok(distance(curvePoint(sineflowerPieces, 0.5, 0.1, 0.9, 0.01), circle(0.5)) < 1e-9);
  assert.ok(distance(curvePoint(sineflowerPieces, 0.95, 0.1, 0.9, 0.01), curvePoint(sineflowerPieces, 0.95, 0.1, 0.1, 0.01)) < 1e-9);
  for (const [phase, ms, speed] of [[0.9957944218056966, 8.3, 0.0192703950245372], [0.1, 1000, -0.05], [0.5, 16, 0]]) {
    assert.equal(advanceRotation(phase, ms, speed), CurveAnimation.advanceRotation(phase, ms, speed));
  }
  const [x, y] = rotatePoint([3, 4], Math.PI / 2);
  assert.ok(Math.abs(x + 4) < 1e-12 && Math.abs(y - 3) < 1e-12);
});

test('morph screensaver follows the first curve at m=0 and the reversed, half-turned curve at m=1', async () => {
  const { morphAt, advanceRotation } = await import('../../sites/screensavers/static/animations/curve-saver.mjs');
  const { first, backwards, morphPoint } = await import('../../sites/screensavers/static/animations/curve-morph.mjs');
  const CurveAnimation = require('../../sites/curves/static/animation.js');
  for (const t of [0, 0.01, 0.2, 0.41, 0.5, 0.58, 0.7, 0.99, 1]) {
    assert.ok(distance(morphPoint(t, 0), first(t)) < 1e-9);
    assert.ok(distance(morphPoint(t, 1), backwards(t)) < 1e-9);
    assert.ok(distance(morphPoint(t, 0.5), [(first(t)[0] + backwards(t)[0]) / 2, (first(t)[1] + backwards(t)[1]) / 2]) < 1e-9);
  }
  // Both ends of the first curve meet the other curve's ends turned half a revolution.
  assert.ok(distance(backwards(0), [-first(1)[0], -first(1)[1]]) < 1e-9);
  // The first curve is continuous.
  let previous = first(0);
  for (let i = 1; i <= 20000; i++) { const point = first(i / 20000); assert.ok(distance(previous, point) < 1, `jump near t=${i / 20000}`); previous = point; }
  for (const [phase, min, max] of [[0, 0, 1], [0.25, 0, 1], [0.11495795987551283, 0.2, 0.7]]) assert.equal(morphAt(phase, min, max), CurveAnimation.morphAt(phase, min, max));
});
