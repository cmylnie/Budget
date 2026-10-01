// Service worker : l'appli s'ouvre même sans réseau.
// Stratégie « réseau d'abord » : dès qu'il y a du réseau, on récupère la dernière version
// (les mises à jour arrivent toutes seules), sinon on sert la copie gardée en cache.
const CACHE = 'mes-enveloppes-v10';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/model.js', 'js/actions.js', 'js/store.js', 'js/dates.js', 'js/defaults.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    // no-cache : on redemande au serveur s'il y a plus récent (le cache HTTP de GitHub Pages garde
    // sinon les fichiers 10 minutes et la mise à jour semble ne pas arriver).
    fetch(req, new URL(req.url).origin === self.location.origin ? { cache: 'no-cache' } : {})
      .then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
