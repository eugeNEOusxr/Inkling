/**
 * Display name for Inkling welcome (optional username, else email local-part).
 */
const USERNAME_KEY = "inkling:username";

export function getUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * @param {string} name
 */
export function setUsername(name) {
  try {
    const v = String(name ?? "").trim();
    if (v) localStorage.setItem(USERNAME_KEY, v);
    else localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} [email]
 */
export function getDisplayName(email) {
  const user = getUsername();
  if (user) return user;
  if (!email) return "friend";
  const local = email.split("@")[0];
  return local || "friend";
}
