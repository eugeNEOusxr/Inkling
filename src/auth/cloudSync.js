import { getSession } from "./session.js";

const SYNC_DEBOUNCE_MS = 900;
let syncTimer = null;
let lastPushAt = 0;

/** Keys mirrored to the user account on the server. */
export const BUNDLE_KEYS = {
  calendar: "calendar3d-state-v2",
  slotNotes: "notebookcalender:notesByDate",
  lastView: "notebookcalender:lastView",
  notificationSettings: "calendar3d-notification-settings-v1",
  notificationHistory: "calendar3d-notification-history-v1"
};

export function collectLocalBundle() {
  const bundle = { version: 1, savedAt: Date.now(), data: {} };
  for (const [field, key] of Object.entries(BUNDLE_KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw != null) bundle.data[field] = raw;
  }
  return bundle;
}

/**
 * @param {object} bundle
 */
export function applyCloudBundle(bundle) {
  if (!bundle?.data) return false;
  for (const [field, key] of Object.entries(BUNDLE_KEYS)) {
    const raw = bundle.data[field];
    if (raw != null) localStorage.setItem(key, raw);
  }
  return true;
}

function apiBase() {
  if (typeof window !== "undefined" && window.__EUGENEOUS_API__) {
    return String(window.__EUGENEOUS_API__).replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function apiFetch(path, init = {}) {
  const session = getSession();
  const { timeoutMs, ...rest } = init;
  const headers = {
    "Content-Type": "application/json",
    "X-Inkling-Client": "Inkling",
    ...(rest.headers || {})
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  // Bound the request so a sleeping free-tier backend can't hang the UI forever
  // (e.g. "Signing in…" stuck). An abort throws a status-less error → callers can
  // retry through the cold start instead of waiting indefinitely.
  let signal = rest.signal;
  let timer = null;
  if (timeoutMs && typeof AbortController !== "undefined") {
    const ac = new AbortController();
    timer = setTimeout(() => ac.abort(), timeoutMs);
    signal = ac.signal;
  }
  try {
    const res = await fetch(`${apiBase()}${path}`, { ...rest, headers, signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || res.statusText || "Request failed");
      err.status = res.status;
      throw err;
    }
    return body;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Pull account data after login (server wins if newer).
 */
export async function pullCloudBundle() {
  const local = collectLocalBundle();
  let remote;
  try {
    remote = (await apiFetch("/api/sync", { timeoutMs: 8000 })).bundle;
  } catch {
    return { ok: false, source: "local" };
  }
  if (!remote?.data || !remote.savedAt) {
    await pushCloudBundle();
    return { ok: true, source: "pushed-local" };
  }
  if (remote.savedAt >= (local.savedAt || 0)) {
    applyCloudBundle(remote);
    return { ok: true, source: "remote" };
  }
  applyCloudBundle(local);
  await pushCloudBundle();
  return { ok: true, source: "pushed-local" };
}

export async function pushCloudBundle() {
  const session = getSession();
  if (!session?.token) return { ok: false };
  const bundle = collectLocalBundle();
  await apiFetch("/api/sync", {
    method: "PUT",
    body: JSON.stringify({ bundle }),
    timeoutMs: 8000
  });
  lastPushAt = Date.now();
  return { ok: true, savedAt: bundle.savedAt };
}

export function scheduleCloudSync() {
  if (!getSession()?.token) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    pushCloudBundle().catch((err) => {
      console.warn("[cloudSync] push failed", err.message);
    });
  }, SYNC_DEBOUNCE_MS);
}

export function getLastCloudPushAt() {
  return lastPushAt;
}
