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

  try {
    const user = await fetchMe();
    applyServerUserToClient(user);
    await pullCloudBundle();
    return true;
  } catch {
    clearSession();
    window.location.href = "/login.html";
    return false;
  }
}

export function signOut() {
  clearSession();
  window.location.href = "/login.html";
}
