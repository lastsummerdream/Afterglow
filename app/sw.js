/* AFTERGLOW: 화면 파일(HTML · CSS · JS · 그림 · 글꼴)을 기기에 저장해 두고 먼저 보여 준 뒤, 뒤에서 새 것을 받아 바꿔 둔다.
   서버 요청(API)과 음악은 건드리지 않는다. */
const V = 'ag-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== V) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), same = u.origin === location.origin, font = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if ((!same && !font) || r.headers.has('range') || /\.mp3$/.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(V), page = same && /\.html$|\/$/.test(u.pathname);
    const hit = await c.match(r, { ignoreSearch: page });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(page ? u.origin + u.pathname : r, res.clone()).catch(() => {}); return res; }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  })());
});
