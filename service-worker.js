/* Phase 1 PWA baseline: minimal offline support with safe caching strategy. */
const CACHE_VERSION = "eugeneousxr-v28";
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
  // Do NOT skipWaiting here: a new worker installs and WAITS so the app can show
  // an "Update available" banner. The page triggers activation via SKIP_WAITING.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

// The page posts this when the user taps "Update" (or to auto-apply on first
// install where there's no controller yet).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
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

/* ===================================================================
 * Web Push alarms — fire even when the app/tab is fully closed.
 * The backend sends an encrypted push (RFC 8291/8292); the OS wakes this
 * worker, which shows the notification. No page needs to be open.
 * =================================================================== */

self.addEventListener("push", (event) => {
  /** @type {{title?:string,body?:string,tag?:string,url?:string,requireInteraction?:boolean,renotify?:boolean,kind?:string}} */
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Inkling", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Inkling alarm";
  const options = {
    body: data.body || "",
    tag: data.tag || `inkling-${data.kind || "alarm"}`,
    // Alarms should persist until the user acts; reminders can auto-dismiss.
    requireInteraction: data.requireInteraction ?? data.kind === "alarm",
    renotify: data.renotify ?? true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/index.html", kind: data.kind || "alarm" },
    // 8.4 vibrate where supported (Android) — short alarm pattern.
    vibrate: data.kind === "alarm" ? [200, 100, 200, 100, 400] : [120]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/index.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      // Focus an existing tab if one is already open, else open a new one.
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});

// Re-subscribe transparently if the push service rotates the subscription.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        client.postMessage({ type: "inkling-pushsubscriptionchange" });
      }
    })
  );
});
