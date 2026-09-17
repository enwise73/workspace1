// GoNow 서비스워커. 같은 오리진(GitHub Pages 정적 셸: HTML/CSS/JS/아이콘)만 캐싱한다.
// 날씨·버스처럼 실시간이어야 하는 데이터는 다른 오리진(Cloudflare 프록시)이라 여기서 자동으로
// 제외된다 — 그 데이터의 캐시는 이미 worker/proxy.js가 맡고 있고, 여기서 또 캐싱하면 "추정값을
// 사실처럼 보여주지 않는다"(CLAUDE.md §8) 원칙과 충돌할 수 있다.
const CACHE_NAME = 'gonow-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // stale-while-revalidate: 캐시가 있으면 즉시 보여주고, 뒤에서 최신본으로 갱신한다.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
