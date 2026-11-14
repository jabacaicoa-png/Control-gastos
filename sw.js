// Service worker de Control de Gastos: permite abrir la app sin internet.
// - La planilla (HTML) se pide primero a internet, así siempre tenés la última versión;
//   si no hay conexión, se usa la copia guardada.
// - Íconos, fuentes y la librería de Excel se sirven desde la copia guardada.
// - Google Drive y el inicio de sesión de Google nunca pasan por acá.
const CACHE = 'control-gastos-v1';
const LOCALES = [
  './control-gastos.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
const EXTERNOS = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];
const CACHEABLES = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(LOCALES);
    await Promise.all(EXTERNOS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('control-gastos-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mismoOrigen = url.origin === self.location.origin;

  // Planilla: primero internet, si falla la copia guardada
  if (req.mode === 'navigate' || (mismoOrigen && url.pathname.endsWith('.html'))) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) { const c = await caches.open(CACHE); c.put('./control-gastos.html', r.clone()); }
        return r;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true })) || (await c.match('./control-gastos.html'));
      }
    })());
    return;
  }

  // Archivos propios y librerías: copia guardada y se actualiza en segundo plano
  if (mismoOrigen || CACHEABLES.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req, { ignoreSearch: mismoOrigen });
      const red = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
      return guardado || (await red) || Response.error();
    })());
  }
  // Todo lo demás (Google Drive, login de Google) va directo a internet.
});
