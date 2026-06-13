/**
 * Shell surface routing (Milestone 3.1 B) — one active app tab + idle cosmos backdrop.
 */

import { getCosmosBackdrop } from "./CosmosBackdrop.js";

/** @typedef {"idle"|"calendar"|"writer"|"wordweaver"|"alerts"|"inkling"} ShellSurface */

const TAB_CLASS = {
  calendar: "inkling-tab-calendar",
  writer: "inkling-tab-writer",
  wordweaver: "inkling-tab-wordweaver",
  constellation: "inkling-tab-constellation",
  alerts: "inkling-tab-alerts",
  inkling: "inkling-tab-inkling"
};

const TAB_CLASSES = Object.values(TAB_CLASS);

/**
 * @returns {ShellSurface}
 */
export function getActiveShellSurface() {
  const raw = document.body.dataset.inklingShellSurface;
  if (raw === "calendar" || raw === "writer" || raw === "wordweaver" || raw === "alerts" || raw === "inkling") {
    return raw;
  }
  return "idle";
}

/**
 * @param {ShellSurface} surface
 */
export function setShellSurface(surface) {
  document.body.dataset.inklingShellSurface = surface;
  document.body.classList.toggle("inkling-surface-idle", surface === "idle");
  document.dispatchEvent(
    new CustomEvent("inkling:shell-surface", { detail: { surface } })
  );
}

/**
 * @returns {boolean}
 */
export function isWordWeaverTabActive() {
  return document.body.classList.contains("inkling-tab-wordweaver");
}

/**
 * @returns {boolean}
 */
export function isNotebookCanvasSurfaceActive() {
  return document.body.classList.contains("inkling-tab-calendar");
}

/**
 * Idle cosmos backdrop — re-tap default (not Inkling).
 */
export function showIdleSurface() {
  document.body.classList.remove("inkling-stage-open", ...TAB_CLASSES);
  setShellSurface("idle");
  getCosmosBackdrop().show();
}

/**
 * @param {string} tab
 */
export function beginAppTabSurface(tab) {
  getCosmosBackdrop().hide();
  document.body.classList.remove("inkling-surface-idle");
  document.body.classList.remove(...TAB_CLASSES);
  const cls = TAB_CLASS[tab];
  if (cls) document.body.classList.add(cls);
  if (
    tab === "calendar" || tab === "writer" || tab === "wordweaver" ||
    tab === "constellation" || tab === "alerts" || tab === "inkling"
  ) {
    setShellSurface(/** @type {ShellSurface} */ (tab === "constellation" ? "wordweaver" : tab));
  }
}
