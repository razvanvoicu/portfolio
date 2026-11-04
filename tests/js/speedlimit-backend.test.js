const { test } = require('node:test');
const assert = require('node:assert/strict');

async function setup() {
  const { createSpeedlimitRoutes } = await import('../../backend/src/routes/speedlimit.js');
  const writes = new Map(); let commits = 0, fail = false;
  const ref = path => ({ path, collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = {
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    batch: () => {
      const queued = [];
      return { set: (ref, data, options) => queued.push([ref.path, data, options]), commit: async () => {
        if (fail) throw new Error('offline');
        commits++; for (const [path, data] of queued) writes.set(path, data);
      } };
    },
  };
  const app = createSpeedlimitRoutes({ password: 'correct', getDatabase: () => db });
  const post = (path, body) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { app, post, writes, commits: () => commits, fail: value => fail = value };
}
const trip = () => ({
  password: 'correct', tripId: '2026-11-03T10:00:00.000Z_00000000-0000-4000-8000-000000000001',
  startedAt: Date.parse('2026-11-03T10:00:00Z'), stoppedAt: Date.parse('2026-11-03T10:30:00Z'),
  fixCount: 1, chunkIndex: 0, chunkCount: 1,
  fixes: [{ timestamp: Date.parse('2026-11-03T10:01:00Z'), latitude: 1.345, longitude: 103.774, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: 299, speed: 15 }],
});

test('validation and every trip write require the password; malformed and excessive payloads cannot write', async () => {
  const { post, app, commits } = await setup();
  assert.equal((await post('/validate', { password: 'wrong' })).status, 401);
  assert.equal((await post('/validate', { password: 'correct' })).status, 200);
  const denied = await post('/trips', { ...trip(), password: 'wrong' });
  assert.equal(denied.status, 401); assert.equal(denied.headers.get('Cache-Control'), 'no-store');
  for (const changes of [{ tripId: '../other' }, { startedAt: 'not a time' }, { chunkIndex: 1 }, { fixCount: 2 }, { fixes: [{ ...trip().fixes[0], latitude: 91 }] }]) {
    assert.equal((await post('/trips', { ...trip(), ...changes })).status, 400);
  }
  assert.equal((await app.request('/trips', { method: 'POST', body: 'invalid json' })).status, 400);
  assert.equal((await post('/trips', { ...trip(), padding: 'x'.repeat(513 * 1024) })).status, 413);
  assert.equal(commits(), 0);
});

test('Firestore batches store timestamped trips and raw fixes, omit passwords and safely overwrite retries', async () => {
  const { post, writes, commits, fail } = await setup();
  const body = trip(); body.fixes[0].password = 'must not be stored';
  assert.equal((await post('/trips', body)).status, 200);
  const root = `SpeedLimit/${body.tripId}`;
  assert.equal(writes.get(root).startedAt.toMillis(), body.startedAt);
  assert.equal(writes.get(root).stoppedAt.toMillis(), body.stoppedAt);
  assert.deepEqual(writes.get(root).savedChunks, { 0: true });
  const fix = writes.get(`${root}/fixes/000000`).fixes[0];
  assert.equal(fix.timestamp, body.fixes[0].timestamp);
  assert.equal(fix.longitude, 103.774); assert.equal(fix.altitude, null);
  assert.equal(JSON.stringify([...writes]).includes('password'), false);
  assert.equal((await post('/trips', body)).status, 200);
  assert.equal(writes.size, 2); assert.equal(commits(), 2);
  fail(true); assert.equal((await post('/trips', body)).status, 503);
  assert.equal(commits(), 2);
});

test('per-fix displayed limits and diagnostic fields are validated and saved without extra submitted fields', async () => {
  const { post, writes } = await setup();
  const body = trip();
  body.fixes[0].speedLimitKph = 70;
  body.fixes[0].inference = {
    receivedAt:body.fixes[0].timestamp,processingStatus:'processed',source:'sign',headingDeg:302,
    signId:18019,roadMatchState:'matched',roadCode:'UPT00R',roadName:'UPPER BUKIT TIMAH ROAD',
    roadFeatureId:13316,roadLimitKph:null,roadDistanceM:5,schoolZone:false,manualOverride:false,rejectedSignId:null,
    password:'must not be stored',
  };
  assert.equal((await post('/trips',body)).status,200);
  const stored = writes.get(`SpeedLimit/${body.tripId}/fixes/000000`).fixes[0];
  assert.equal(stored.speedLimitKph,70); assert.equal(stored.inference.signId,18019);
  assert.equal(stored.inference.roadCode,'UPT00R'); assert.equal('password' in stored.inference,false);
  body.fixes[0].speedLimitKph = '70'; assert.equal((await post('/trips',body)).status,400);
  body.fixes[0].speedLimitKph = 70; body.fixes[0].inference.source='invented';
  assert.equal((await post('/trips',body)).status,400);
});
