/**
 * WordWeaver 2D / 3D calendar mode (default: 3D).
 */

/** @type {{ calendarMode: "2d" | "3d" }} */
export const state = {
  calendarMode: "3d"
};

const STORAGE_KEY = "inkling:wordweaverCalendarMode";

function loadPersistedMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "2d" || v === "3d") state.calendarMode = v;
  } catch {
    /* ignore */
  }
}

function persistMode() {
  try {
    localStorage.setItem(STORAGE_KEY, state.calendarMode);
  } catch {
    /* ignore */
  }
}

loadPersistedMode();

/**
 * @returns {"2d" | "3d"}
 */
export function getCalendarMode() {
  return state.calendarMode;
}

/**
 * @param {"2d" | "3d"} mode
 */
export function setCalendarMode(mode) {
  if (mode !== "2d" && mode !== "3d") return;
  if (state.calendarMode === mode) return;
  state.calendarMode = mode;
  persistMode();
  window.dispatchEvent(
    new CustomEvent("wordweaver:calendar-mode-changed", {
      detail: { mode: state.calendarMode }
    })
  );
}

/**
 * @returns {"2d" | "3d"}
 */
export function toggleCalendarMode() {
  setCalendarMode(state.calendarMode === "3d" ? "2d" : "3d");
  return state.calendarMode;
}

/**
 * @param {(mode: "2d" | "3d") => void} fn
 */
export function onCalendarModeChange(fn) {
  const handler = (e) => fn(e.detail?.mode ?? state.calendarMode);
  window.addEventListener("wordweaver:calendar-mode-changed", handler);
  return () => window.removeEventListener("wordweaver:calendar-mode-changed", handler);
}
