export const PASSWORD_MIN_LENGTH = 12;

/**
 * @param {string} password
 * @returns {{ ok: boolean, error?: string }}
 */
export function validatePassword(password) {
  const p = String(password || "");
  if (p.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    };
  }
  if (!/[a-z]/.test(p)) {
    return { ok: false, error: "Password must include a lowercase letter." };
  }
  if (!/[A-Z]/.test(p)) {
    return { ok: false, error: "Password must include an uppercase letter." };
  }
  if (!/[0-9]/.test(p)) {
    return { ok: false, error: "Password must include a number." };
  }
  if (!/[^a-zA-Z0-9]/.test(p)) {
    return { ok: false, error: "Password must include a symbol (e.g. ! @ # $)." };
  }
  return { ok: true };
}
