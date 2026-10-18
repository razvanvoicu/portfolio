const CACHE = 'speedlimit-1.9.6';
const SHELL = ['./', './index.html', './style.css', './app.js', './core.mjs', './config.mjs', './road-data.js', './roads.mjs', './network.mjs', './manifest.json', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // Activate updates on next launch, not in the middle of an active drive.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('speedlimit-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (!SHELL.some(path => new URL(path, self.registration.scope).href === event.request.url)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
