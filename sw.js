// Service Worker: hält die App-Dateien offline bereit. Daten (Google Drive) werden nie zwischengespeichert.
const CACHE = 'gesundheitsakte-0.3.1';
const DATEIEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/konfig.js', 'js/hilfen.js', 'js/modell.js', 'js/beispiel.js', 'js/drive.js', 'js/speicher.js', 'js/ansichten.js', 'js/formulare.js', 'js/import.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netz zuerst (immer die neueste Version), bei fehlendem Netz aus dem Speicher.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(antwort => {
      if (antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
      return antwort;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
