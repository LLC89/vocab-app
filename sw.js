const VER = 'vb-d7c30d4d44';
const ASSETS = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "data/index.json", "data/d01.json", "data/d02.json", "data/d03.json", "data/d04.json", "data/d05.json", "data/d06.json", "data/d07.json", "data/d08.json", "data/d09.json", "data/d10.json", "data/d11.json", "data/d12.json", "data/d13.json", "data/d14.json", "data/d15.json", "data/d16.json", "data/d17.json", "data/d18.json", "data/d19.json", "data/d20.json", "data/d21.json", "data/d22.json", "data/d23.json", "data/d24.json", "data/d25.json", "data/d26.json", "data/d27.json", "data/d28.json", "data/d29.json", "data/d30.json", "data/d31.json", "data/d32.json", "data/d33.json", "data/d34.json", "data/d35.json", "data/d36.json", "data/d37.json", "data/d38.json", "data/d39.json", "data/d40.json"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // 网络优先（拿到最新内容），断网时用缓存
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
