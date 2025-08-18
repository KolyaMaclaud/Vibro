// sw.js — Vibro PWA (v3, MapTiler)
// - Кэшируем app shell (html + манифест + иконки + Leaflet)
// - Навигации офлайн отдаем vibro.html
// - CDN (unpkg) — stale-while-revalidate
// - MapTiler — network-first с тихим fallback на кэш
// - Тайлы OSM не используем (мы перешли на MapTiler)

const CACHE = "vibro-v3";
const APP_SHELL = [
  "./vibro.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icon-192.png",
  "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", (event) => {
  // Сразу активируем новый SW и кладем shell в кэш
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  // Чистим старые кэши и берём контроль над клиентами
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Хелпер: stale-while-revalidate для CDN (Leaflet)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((resp) => {
      if (resp && resp.status === 200) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Навигация: офлайн-резерв vibro.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match("./vibro.html");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 2) Наши собственные файлы: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 3) Leaflet с CDN: stale-while-revalidate
  if (url.hostname === "unpkg.com") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 4) MapTiler tiles: network-first c fallback на кэш (если уже был)
  if (url.hostname === "api.maptiler.com") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Не кладем тайлы в SW-кэш специально (их кэширует сам браузер),
          // но можно раскомментировать две строки ниже, если хочешь:
          // const cache = await caches.open(CACHE);
          // cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 5) Прочее: пробуем сеть, иначе — что-нибудь из кэша, если попадалось
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })()
  );
});
