// Service Worker: hält die App-Dateien offline bereit und nimmt am Handy geteilte Dateien entgegen.
// Daten aus Google Drive werden nie zwischengespeichert.
const CACHE = 'gesundheitsakte-0.7.2';
const GETEILT = 'gesundheitsakte-geteilt';   // geteilte Dateien bis zur Ablage im Eingang
const DATEIEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/konfig.js', 'js/hilfen.js', 'js/modell.js', 'js/beispiel.js', 'js/drive.js', 'js/speicher.js', 'js/ansichten.js', 'js/formulare.js',
  'js/import.js', 'js/kalender.js', 'js/erkennung.js', 'js/auswertung.js', 'js/tk.js', 'lib/pdf.min.mjs', 'lib/pdf.worker.min.mjs',
  'icons/icon-192.png', 'icons/favicon-32.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
// Nur eigene alte Speicher löschen: unter derselben Adresse (mwenzelides-privat.github.io) liegt auch die Finanzen-App,
// deren Speicher („finanzen-…“) bleiben unberührt.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gesundheitsakte-') && k !== CACHE && k !== GETEILT).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Teilen vom Handy (Android): „Teilen“ → „Gesundheit“ schickt die Dateien per POST an ./teilen
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/teilen')) {
    e.respondWith((async () => {
      const formular = await e.request.formData();
      const dateien = formular.getAll('dateien').filter(f => f && f.size);
      const cache = await caches.open(GETEILT);
      let n = 0;
      for (const f of dateien) {
        await cache.put(`./geteilt/${Date.now()}-${n++}`, new Response(f, { headers: {
          'Content-Type': f.type || 'application/octet-stream', 'X-Dateiname': encodeURIComponent(f.name || 'Datei'),
        } }));
      }
      return Response.redirect(`./?geteilt=${n}#dokumente`, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Netz zuerst (immer die neueste Version), bei fehlendem Netz aus dem Speicher.
  // cache: 'no-cache' umgeht den 10-Minuten-Zwischenspeicher von GitHub Pages → neue Versionen sofort
  e.respondWith(
    fetch(new Request(e.request, { cache: 'no-cache' })).then(antwort => {
      if (antwort.ok) { const kopie = antwort.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
      return antwort;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
