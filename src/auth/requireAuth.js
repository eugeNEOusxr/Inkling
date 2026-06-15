import { getSession, clearSession } from "./session.js";
import { apiFetch, pullCloudBundle } from "./cloudSync.js";
import { fetchMe } from "./userAccount.js";
import { applyServerUserToClient } from "./userSettingsSync.js";

const SKIP_LOGIN_KEY = "inklingSkipLogin";

function isLoginSkipped() {
  try {
    return localStorage.getItem(SKIP_LOGIN_KEY) === "true";
  } catch {
    return false;
  }
}

/** Clear the "skip login" flag so the next load runs the real auth flow. */
export function clearLoginSkip() {
  try {
    localStorage.removeItem(SKIP_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Sync guard for standalone auth pages (account-settings, etc.).
 * @returns {boolean}
 */
export function requireAuth() {
  if (isLoginSkipped()) {
    return true;
  }
  if (!getSession()?.token) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

/**
 * Ensure user is signed in; pull cloud data into localStorage.
 * Redirects to login.html when not authenticated.
 * @returns {Promise<boolean>}
 */
export async function requireAuthForApp() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("embedded")) {
    return true;
  }

  // Public/guest deep-link: ?skip or ?guest enters offline guest mode (no account)
  // and remembers it, so a shared link lands straight in the app with no login wall.
  if (params.has("skip") || params.has("guest")) {
    try {
      localStorage.setItem(SKIP_LOGIN_KEY, "true");
    } catch {
      /* ignore */
    }
    return true;
  }

  if (isLoginSkipped()) {
    return true;
  }

  const session = getSession();
  if (!session?.token) {
    window.location.href = "/login.html";
    return false;
  }

  // Validate the token — but ONLY log out + bounce to login if the server
  // genuinely REJECTS it (401). A network hiccup, cold start, or timeout must
  // NOT wipe the session and kick the user back to a blank login (that was the
  // "loads then reverts to login" loop). Stay signed in; sync catches up later.
  try {
    const user = await Promise.race([
      fetchMe(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000))
    ]);
    applyServerUserToClient(user);
  } catch (err) {
    if (err && err.status === 401) {
      clearSession();
      window.location.href = "/login.html";
      return false;
    }
    // transient failure → keep the session and enter the app anyway
  }
  // Pull cloud data in the background; never block (or trap) entry on it.
  pullCloudBundle().catch(() => {});
  return true;
}

export function signOut() {
  clearSession();
  window.location.href = "/login.html";
}
