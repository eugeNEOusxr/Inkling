/**
 * Web Push client: subscribe the browser to the backend's push service so
 * alarms fire even when the app/tab is fully closed. Pairs with the `push`
 * handler in service-worker.js and the /api/push/* routes on the server.
 */
import { apiFetch } from "../../auth/cloudSync.js";
import { getSession } from "../../auth/session.js";

const SUB_FLAG_KEY = "inkling-push-enabled-v1";

/** Base64url VAPID public key → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function vapidPublicKey() {
  return (typeof window !== "undefined" && window.__INKLING_VAPID__) || "";
}

/**
 * Show a REAL OS notification (the heads-up banner + entry in the pull-down
 * notification shade). On Android the `new Notification()` constructor is a
 * no-op for installed PWAs — only the service worker's showNotification works —
 * so always go through the SW registration, falling back to the constructor
 * only on desktop where the SW isn't ready.
 * @param {string} title
 * @param {{body?:string, kind?:string, url?:string, requireInteraction?:boolean, requestPermission?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function showLocalNotification(title, opts = {}) {
  if (!("Notification" in window)) return { ok: false, reason: "unsupported" };
  let permission = Notification.permission;
  if (permission === "default" && opts.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "default" };

  const options = {
    body: opts.body || "",
    tag: `inkling-${opts.kind || "alarm"}`,
    renotify: true,
    requireInteraction: opts.requireInteraction ?? opts.kind === "alarm",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: opts.kind === "alarm" ? [200, 100, 200, 100, 400] : [120],
    data: { url: opts.url || "/index.html", kind: opts.kind || "alarm" }
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return { ok: true };
    }
  } catch {
    /* fall through to constructor */
  }
  try {
    new Notification(title, options);
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Web Push needs SW + PushManager + Notification, an account, and a VAPID key. */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(vapidPublicKey())
  );
}

export function isPushEnabledLocally() {
  return localStorage.getItem(SUB_FLAG_KEY) === "1";
}

async function getRegistration() {
  // Wait for whatever service-worker.js already registered to be ready.
  return navigator.serviceWorker.ready;
}

/**
 * Ask for permission (if needed), subscribe, and upload the subscription.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function enablePush() {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!getSession()?.token) return { ok: false, reason: "signed-out" };

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey())
      });
    }
    await uploadSubscription(sub);
    localStorage.setItem(SUB_FLAG_KEY, "1");
    return { ok: true };
  } catch (err) {
    console.warn("[webPush] subscribe failed:", err?.message || err);
    return { ok: false, reason: "error" };
  }
}

/** Remove the subscription locally and on the server. */
export async function disablePush() {
  localStorage.removeItem(SUB_FLAG_KEY);
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await apiFetch("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
        timeoutMs: 8000
      }).catch(() => {});
    }
    return { ok: true };
  } catch (err) {
    console.warn("[webPush] unsubscribe failed:", err?.message || err);
    return { ok: false };
  }
}

/** POST a PushSubscription (as plain JSON) to the backend. */
async function uploadSubscription(sub) {
  const json = sub.toJSON();
  await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
        expirationTime: json.expirationTime ?? null
      },
      userAgent: navigator.userAgent
    }),
    timeoutMs: 8000
  });
}

/** Fire a server-sent test push to confirm the round trip works. */
export async function sendTestPush() {
  if (!getSession()?.token) return { ok: false, reason: "signed-out" };
  try {
    await apiFetch("/api/push/test", { method: "POST", body: "{}", timeoutMs: 12000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "error" };
  }
}

/**
 * Re-subscribe after a `pushsubscriptionchange` (the push service rotated keys),
 * and refresh the subscription on the server on every app start so it stays live
 * across the free-tier backend's ephemeral restarts.
 */
export function initPushLifecycle() {
  if (!isPushSupported()) return;
  navigator.serviceWorker?.addEventListener?.("message", (event) => {
    if (event.data?.type === "inkling-pushsubscriptionchange") {
      enablePush().catch(() => {});
    }
  });
  // If the user previously enabled push, make sure the server has a current
  // subscription (it may have been wiped by a backend restart).
  if (isPushEnabledLocally() && getSession()?.token) {
    enablePush().catch(() => {});
  }
}
