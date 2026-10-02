// Fa aprire l'app anche senza rete: prima prova online, altrimenti usa la copia salvata.
const CACHE = 'rubrica-v2';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon.svg', 'lib/firebase-app-compat.js', 'lib/firebase-auth-compat.js', 'lib/firebase-firestore-compat.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const cacheable = e.request.method === 'GET' && (url.origin === location.origin || url.hostname === 'www.gstatic.com' || url.hostname.endsWith('googleapis.com') && url.pathname.startsWith('/css'));
  if (!cacheable) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
