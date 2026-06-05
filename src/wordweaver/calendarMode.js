/**
 * WordWeaver 2D / 3D calendar mode — §3.4 `inkling-calendar-mode`, canonical bus §13.2.
 */

import * as bus from "../utils/EventBus.js";
import { isWebGLAvailable } from "../utils/webglProbe.js";

/** @type {{ calendarMode: "2d" | "3d" }} */
export const state = {
  calendarMode: "3d"
};

/** §3.4 canonical key */
export const CANONICAL_STORAGE_KEY = "inkling-calendar-mode";
/** Legacy key (migrate on read) */
const LEGACY_STORAGE_KEY = "inkling:wordweaverCalendarMode";

let webglFallbackNoticePending = false;
let initialModeResolved = false;

function migrateStorageKey() {
  if (typeof localStorage === "undefined") return;
  try {
    const canonical = localStorage.getItem(CANONICAL_STORAGE_KEY);
    if (canonical === "2d" || canonical === "3d") {
      state.calendarMode = canonical;
      return;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "2d" || legacy === "3d") {
      state.calendarMode = legacy;
      localStorage.setItem(CANONICAL_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function persistMode() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CANONICAL_STORAGE_KEY, state.calendarMode);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Apply stored mode + WebGL fallback before first paint (§1.5 / §3.4).
 */
export function resolveInitialCalendarMode() {
  if (initialModeResolved) return state.calendarMode;
  initialModeResolved = true;
  migrateStorageKey();
  if (!isWebGLAvailable() && state.calendarMode === "3d") {
    state.calendarMode = "2d";
    webglFallbackNoticePending = true;
    persistMode();
  }
  return state.calendarMode;
}

/**
 * @returns {boolean}
 */
export function consumeWebGLFallbackNotice() {
  const pending = webglFallbackNoticePending;
  webglFallbackNoticePending = false;
  return pending;
}

resolveInitialCalendarMode();

/**
 * @returns {"2d" | "3d"}
 */
export function getCalendarMode() {
  return state.calendarMode;
}

/**
 * @param {"2d" | "3d"} mode
 * @param {{ emit?: boolean, persist?: boolean }} [opts]
 */
export function setCalendarMode(mode, opts = {}) {
  const emit = opts.emit !== false;
  const persist = opts.persist !== false;
  if (mode !== "2d" && mode !== "3d") return;
  if (mode === "3d" && !isWebGLAvailable()) {
    mode = "2d";
    webglFallbackNoticePending = true;
  }
  if (state.calendarMode === mode) return;
  state.calendarMode = mode;
  if (persist) persistMode();
  if (emit) bus.emit("modeChanged", { mode: state.calendarMode });
}

/**
 * @returns {"2d" | "3d"}
 */
export function toggleCalendarMode() {
  setCalendarMode(state.calendarMode === "3d" ? "2d" : "3d");
  return state.calendarMode;
}

/**
 * Subscribe to mode changes (canonical bus).
 * @param {(mode: "2d" | "3d") => void} fn
 * @returns {() => void}
 */
export function onCalendarModeChange(fn) {
  return bus.on("modeChanged", (payload) => {
    const mode = payload?.mode;
    if (mode === "2d" || mode === "3d") fn(mode);
    else fn(state.calendarMode);
  });
}
