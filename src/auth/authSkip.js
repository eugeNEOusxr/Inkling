const SKIP_KEY = "inkling:auth-skip";

/** Temporary offline bypass — remove when auth/network is fixed. */
export function isAuthSkipped() {
  if (new URLSearchParams(window.location.search).has("skip")) return true;
  try {
    return (
      localStorage.getItem(SKIP_KEY) === "1" ||
      sessionStorage.getItem(SKIP_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function enableAuthSkip() {
  try {
    localStorage.setItem(SKIP_KEY, "1");
    sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearAuthSkip() {
  try {
    localStorage.removeItem(SKIP_KEY);
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    /* ignore */
  }
}
