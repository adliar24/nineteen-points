const CACHE_NAME = "nineteen-points-v3";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (!e.request.url.startsWith("http")) return;

  // Skip API requests to Supabase and non-GET requests
  if (e.request.url.includes("supabase.co") || e.request.method !== "GET") {
    return;
  }

  const isHtmlRequest =
    e.request.mode === "navigate" ||
    e.request.headers.get("accept")?.includes("text/html") ||
    e.request.url.endsWith(".html");

  if (isHtmlRequest) {
    // Network-only for HTML to ensure latest app bundle index is always loaded
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => {
          return caches.match(e.request).then((cached) => cached || caches.match("/"));
        })
    );
    return;
  }

  // Network-first for other assets, fallback to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
