const SNOOZE_PREF_KEY = "calendar3d-snooze-pref-v1";

/** @type {Record<string, number>} */
export const SNOOZE_MS = {
  "5m": 5 * 60 * 1000,
  "10m": 10 * 60 * 1000,
  "15m": 15 * 60 * 1000
};

/** @returns {'5m'|'10m'|'15m'} */
export function getPreferredSnoozeDuration() {
  try {
    const v = localStorage.getItem(SNOOZE_PREF_KEY);
    if (v && SNOOZE_MS[v]) return v;
  } catch {
    /* ignore */
  }
  return "10m";
}

/**
 * @param {'5m'|'10m'|'15m'} duration
 */
export function setPreferredSnoozeDuration(duration) {
  if (!SNOOZE_MS[duration]) return;
  try {
    localStorage.setItem(SNOOZE_PREF_KEY, duration);
  } catch {
    /* ignore */
  }
}

/**
 * @param {'5m'|'10m'|'15m'} duration
 */
export function snoozeLabel(duration) {
  const map = { "5m": "5 min", "10m": "10 min", "15m": "15 min" };
  return map[duration] ?? "10 min";
}
