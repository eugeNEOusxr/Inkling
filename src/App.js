/**
 * Inkling shell boot — WordWeaver opens first; Inkling does not auto-open.
 */
import { openPanel } from "./calendar/ui/AppLauncher.js";

/**
 * Close other panels and surface WordWeaver (after CalendarApp inkling boot).
 */
export function bootWordWeaverFirst() {
  const startTab = new URLSearchParams(window.location.search).get("tab");
  if (startTab && !["wordweaver", "wall"].includes(startTab) && startTab !== "") {
    return;
  }

  const activate = () => {
    const app = window.__inklingApp;
    if (app?._handleBottomNavTab) {
      void app._handleBottomNavTab("wordweaver", { toggle: false });
      return;
    }
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
    openPanel("wordweaver");
  };

  queueMicrotask(activate);
  setTimeout(activate, 150);
}

/**
 * @param {import("./calendar/CalendarApp.js").CalendarApp} app
 */
export function registerInklingApp(app) {
  window.__inklingApp = app;
  bootWordWeaverFirst();
}
