/* Service worker: lets the installed app open without a connection (static files + the offline site-visit page).
   Business data is never cached: /api/* and customer links (/q/*) always go to the network. */
const CACHE = 'rass-shell-v1';
const PRE = ['/site.html', '/app.css', '/doc.css', '/logo.png', '/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/q/') || u.pathname === '/sw.js') return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match(r).then(m => m || caches.match('/site.html'))));
    return;
  }
  if (/\.(js|css|png|woff2?|webmanifest|html)$/.test(u.pathname) || u.pathname.startsWith('/vendor/')) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; }).catch(() => caches.match(r)));
  }
});
