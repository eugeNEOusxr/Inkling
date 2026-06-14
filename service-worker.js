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

  // Let cross-origin requests (CDN modules, fonts, images) pass straight through.
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST for everything same-origin (HTML shell, CSS, icons, /src/, /api/)
  // so a new deploy always shows fresh — no stale UI / old icons stuck in cache.
  // The cache is only a fallback for offline use.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Offline navigation fallback to the cached shell.
          if (event.request.mode === "navigate") return caches.match("/index.html");
          return undefined;
        })
      )
  );
});
