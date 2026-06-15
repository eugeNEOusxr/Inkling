/**
 * Remote API URL detection — Tauri/Android use http://tauri.localhost (not a real backend).
 */

/**
 * @param {string} [origin]
 */
export function isBundledShellOrigin(origin) {
  if (!origin || origin === "null") return true;
  const o = origin.toLowerCase();
  return (
    o.startsWith("tauri:") ||
    o.includes("tauri.localhost") ||
    o.includes("asset.localhost") ||
    o === "file://"
  );
}

/**
 * True when the app can reach a Node API (dev server or INKLING_API_URL).
 */
export function hasRemoteApi() {
  const runtime = typeof window !== "undefined" ? window.__INKLING_RUNTIME__ : null;
  const fromRuntime = runtime?.apiUrl?.trim?.();
  if (fromRuntime) return true;
  if (typeof window !== "undefined" && window.__EUGENEOUS_API__) {
    return Boolean(String(window.__EUGENEOUS_API__).trim());
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return !isBundledShellOrigin(window.location.origin);
  }
  return false;
}

/**
 * Tauri desktop or mobile shell (assets bundled, no same-origin API).
 */
export function isNativeShell() {
  if (typeof window === "undefined") return false;
  if (window.__TAURI__) return true;
  const platform = window.__INKLING_RUNTIME__?.platform;
  if (platform === "android" || platform === "ios" || platform === "desktop") return true;
  return isBundledShellOrigin(window.location?.origin);
}

/**
 * Resolved API origin, or "" when offline / bundled-only.
 */
export function getApiBase() {
  const runtime = typeof window !== "undefined" ? window.__INKLING_RUNTIME__ : null;
  const fromRuntime = runtime?.apiUrl?.trim?.();
  if (fromRuntime) return fromRuntime.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.__EUGENEOUS_API__) {
    return String(window.__EUGENEOUS_API__).replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const o = window.location.origin;
    if (!isBundledShellOrigin(o)) return o;
  }
  return "";
}
