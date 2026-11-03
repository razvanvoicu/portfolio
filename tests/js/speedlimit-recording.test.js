const { test } = require('node:test');
const assert = require('node:assert/strict');

async function setup(saved = {}) {
  const { TripRecorder } = await import('../../sites/speedlimit/static/recording.mjs');
  const calls = [], statuses = [];
  let response = { ok: true };
  const recorder = new TripRecorder({
    storage: { getItem: key => saved[key] ?? null, setItem: (key, value) => saved[key] = value },
    request: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response; },
    onStatus: (...args) => statuses.push(args),
  });
  return { recorder, calls, statuses, saved, respond: value => response = value };
}
const fix = timestamp => ({ timestamp, coords: { latitude: 1.345, longitude: 103.774, accuracy: 6, altitude: null, altitudeAccuracy: null, heading: 299, speed: 15 } });

test('disabled recording neither captures fixes nor makes save requests; password validation gates enabling', async () => {
  const { recorder: r, calls, respond, saved } = await setup();
  r.start(); r.record(fix(100)); await r.stop();
  assert.equal(r.trip, null); assert.equal(calls.length, 0);
  respond({ ok: false, status: 401 });
  await assert.rejects(r.enable('wrong'), /Incorrect password/);
  assert.equal(r.enabled, false); assert.deepEqual(saved, {});
  respond({ ok: true }); await r.enable('correct');
  assert.equal(r.enabled, true);
  assert.equal(saved['speedlimit.record.password'], 'correct');
  assert.equal(saved['speedlimit.record.enabled'], 'true');
  const reopened = await setup(saved);
  assert.equal(reopened.recorder.enabled, true);
  assert.equal(reopened.recorder.password, 'correct');
  r.disable(); assert.equal(saved['speedlimit.record.enabled'], 'false');
  assert.equal(saved['speedlimit.record.password'], 'correct');
});

test('a 30-minute ride keeps every raw fix and uploads ordered authenticated batches only at Stop', async () => {
  const { recorder: r, calls } = await setup();
  await r.enable('correct'); calls.length = 0;
  const start = Date.parse('2026-11-03T10:00:00Z');
  r.start(start);
  for (let i = 0; i < 1800; i++) r.record(fix(start + i * 1000));
  assert.equal(calls.length, 0);
  await r.stop(start + 1800000);
  assert.equal(calls.length, 9);
  const allFixes = calls.flatMap(call => call.body.fixes);
  assert.equal(allFixes.length, 1800);
  assert.deepEqual(allFixes[0], { timestamp: start, ...fix(start).coords });
  assert.equal(allFixes.at(-1).timestamp, start + 1799000);
  for (const [i, call] of calls.entries()) {
    assert.equal(call.url, '/api/speedlimit/trips');
    assert.equal(call.body.password, 'correct');
    assert.equal(call.body.chunkIndex, i); assert.equal(call.body.chunkCount, 9);
    assert.equal(call.body.fixCount, 1800);
    assert.match(call.body.tripId, /^2026-11-03T10:00:00\.000Z_/);
  }
  assert.equal(r.pending.length, 0);
  const previousId = calls[0].body.tripId;
  r.start(start); await r.stop(start + 1);
  assert.notEqual(calls.at(-1).body.tripId, previousId);
  assert.deepEqual(calls.at(-1).body.fixes, []);
});

test('failed saves remain retryable with stable trip and chunk identities and no saves while disabled', async () => {
  const { recorder: r, calls, respond, statuses, saved } = await setup();
  await r.enable('correct');
  r.start(1000); r.record(fix(1100));
  respond({ ok: false, status: 503 }); await r.stop(2000);
  assert.equal(r.pending.length, 1);
  assert.equal(statuses.at(-1)[1], true);
  const failed = calls.at(-1).body;
  const reopened = await setup(saved);
  assert.equal(reopened.recorder.pending.length, 1);
  await reopened.recorder.savePending();
  assert.deepEqual(reopened.calls[0].body, failed);
  assert.deepEqual(JSON.parse(saved['speedlimit.record.pending']), []);
  r.disable(); const count = calls.length; await r.savePending(); assert.equal(calls.length, count);
  respond({ ok: true }); await r.enable('correct'); await r.savePending();
  assert.deepEqual(calls.at(-1).body, failed);
  assert.equal(r.pending.length, 0);
});
