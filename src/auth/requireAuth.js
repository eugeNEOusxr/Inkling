import { getSession, clearSession } from "./session.js";
import { apiFetch, pullCloudBundle } from "./cloudSync.js";
import { fetchMe } from "./userAccount.js";
import { applyServerUserToClient } from "./userSettingsSync.js";

/**
 * Sync guard for standalone auth pages (account-settings, etc.).
 * @returns {boolean}
 */
export function requireAuth() {
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
  if (new URLSearchParams(window.location.search).has("embedded")) {
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
