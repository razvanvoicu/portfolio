const CACHE = 'speedlimit-1.12.1';
const SHELL = ['./', './index.html', './style.css', './app.js', './core.mjs', './config.mjs', './recording.mjs', './road-data.js', './roads.mjs', './network.mjs', './manifest.json', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // Activate updates on next launch, not in the middle of an active drive.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('speedlimit-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
const MAX_AGE_MS = 60 * 60 * 1000;
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stats/')) return;
  if (!SHELL.some(path => new URL(path, self.registration.scope).href === event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) {
      const date = Date.parse(cached.headers.get('Date'));
      const age = Math.max(Date.now() - date, Number(cached.headers.get('Age') || 0) * 1000);
      if (Number.isFinite(age) && age < MAX_AGE_MS) return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
