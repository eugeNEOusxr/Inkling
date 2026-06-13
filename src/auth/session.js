const SESSION_KEY = "eugeneousxr:session";

/**
 * @returns {{ token: string, email: string, user?: object } | null}
 */
export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Email may live at the top level or inside `user` (login stores {token, user}).
    // Accept either, and backfill the top level so callers can rely on `.email`.
    const email = data?.email ?? data?.user?.email;
    if (!data?.token || !email) return null;
    return { ...data, email };
  } catch {
    return null;
  }
}

/**
 * @param {{ token: string, email: string }} session
 */
export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
  return Boolean(getSession()?.token);
}
