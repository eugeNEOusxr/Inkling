/* Phase 1 PWA baseline: minimal offline support with safe caching strategy. */
const CACHE_VERSION = "eugeneousxr-v26";
const CACHE_NAME = `${CACHE_VERSION}-core`;
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/style-enhancements.css",
  "/style-enhancements-inkling-nav.css",
  "/style-enhancements-wordweaver.css",
  "/style-enhancements-layers.css",
  "/style-appearance-palettes.css",
  "/account-settings.html",
  "/forgot-password.html",
  "/reset-password.html",
  "/src/main.js",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isApiLike = url.pathname.startsWith("/api/");

  if (isApiLike) {
    // Network-first for dynamic/API-like routes with cache fallback.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const isSourceModule = url.pathname.startsWith("/src/");

  // Network-first for ES modules so code updates are not stuck behind SW cache.
  if (isSourceModule) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static app shell assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
