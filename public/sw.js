// Minimal service worker: only here so phones offer "Add to Home Screen".
// It caches nothing, so the family always sees live data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
