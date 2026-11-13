/* AFTERGLOW: 화면 파일(HTML · CSS · JS · 그림 · 글꼴)을 기기에 저장해 두고 먼저 보여 준 뒤, 뒤에서 새 것을 받아 바꿔 둔다.
   서버 요청(API)과 음악은 건드리지 않는다. */
const V = 'ag-v3';
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

/* 푸시 알림: 서버가 보낸 새 메시지를 알림으로 띄우고, 누르면 그 화면을 연다 */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'AFTERGLOW', {
    body: d.body || '새 메시지가 왔어요', tag: d.tag || 'ag', renotify: true,
    icon: 'assets/icon-192.png', badge: 'assets/badge-96.png', data: { url: d.url || 'main.html' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || 'main.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url).catch(() => clients.openWindow(url)); }
    return clients.openWindow(url);
  })());
});
