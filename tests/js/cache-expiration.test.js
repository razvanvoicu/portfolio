const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const site of ['speedlimit', 'qr', 'simplecounter', 'cadencereps']) {
  test(`${site}: cache expires hourly, refreshes before serving, preserves offline access and excludes APIs`, async () => {
    const handlers = {}, scope = 'https://example.test/';
    let now = Date.parse('2026-11-03T10:00:00Z'), requests = 0, offline = false;
    let cached = new Response('old content', { headers: { Date: new Date(now).toUTCString() } });
    const cache = { match: async () => cached?.clone(), put: async (_, response) => { cached = response; } };
    vm.runInNewContext(fs.readFileSync(`sites/${site}/static/sw.js`, 'utf8'), {
      self: { location: { origin: 'https://example.test' }, registration: { scope }, addEventListener: (name, fn) => handlers[name] = fn },
      caches: { open: async () => cache }, URL,
      Date: class extends Date { static now() { return now; } },
      fetch: async () => { requests++; if (offline) throw new Error('offline'); return new Response('new content', { headers: { Date: new Date(now).toUTCString() } }); },
    });
    const get = async (path = '/app.js', method = 'GET') => {
      let result;
      handlers.fetch({ request: { url: scope + path.slice(1), method }, respondWith: promise => result = promise });
      return result === undefined ? undefined : (await result).text();
    };
    assert.equal(await get(), 'old content'); assert.equal(requests, 0);
    now += 3600000;
    assert.equal(await get(), 'new content'); assert.equal(requests, 1);
    assert.equal(await get(), 'new content'); assert.equal(requests, 1);
    now += 3600000; offline = true;
    assert.equal(await get(), 'new content'); assert.equal(requests, 2);
    assert.equal(await get('/api/speedlimit/trips'), undefined);
    assert.equal(await get('/stats/healthz'), undefined);
    assert.equal(await get('/app.js', 'POST'), undefined);
    cached = undefined;
    await assert.rejects(get(), /offline/);
  });
}
