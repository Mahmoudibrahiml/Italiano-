// Service Worker: يحفظ الصفحة والمكتبات في المتصفح عشان تفتح علطول بدون نت
// (لا يلمس طلبات Firebase نهائياً — البيانات دايماً من السحابة)
const VER = 'italiano-v1';
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.all(CDN_LIBS.map(u => c.add(new Request(u, { mode: 'no-cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function notifyUpdated() {
  const all = await self.clients.matchAll({ includeUncontrolled: true });
  all.forEach(c => c.postMessage({ type: 'html-updated' }));
}

// صفحة المنظومة: تفتح من المحفوظ فوراً، وفي الخلفية بنسأل السيرفر "فيه جديد؟" (طلب شرطي: لو مفيش جديد الرد صغير جداً 304)
async function pageSWR(req, evt) {
  const cache = await caches.open(VER);
  const cached = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req, { cache: 'no-cache' }).then(async res => {
    if (res && res.ok) {
      const oldTag = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
      const newTag = res.headers.get('etag') || res.headers.get('last-modified');
      await cache.put(req, res.clone());
      if (cached && oldTag && newTag && oldTag !== newTag) notifyUpdated();
    }
    return res;
  }).catch(() => null);
  if (cached) { evt.waitUntil(refresh); return cached; }
  const res = await refresh;
  return res || new Response('لا يوجد اتصال بالإنترنت ولا نسخة محفوظة بعد', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// مكتبات CDN: من المحفوظ دايماً (إصداراتها ثابتة)
async function libCacheFirst(req) {
  const cache = await caches.open(VER);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(pageSWR(req, e));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(libCacheFirst(req));
  }
  // أي حاجة تانية (Firebase وغيره): بدون تدخل
});
