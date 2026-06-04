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
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));

    const app = window.__inklingApp;
    if (app?.windowManager?.closeAllPanels && app?.windowManager?.openPanel) {
      app.windowManager.closeAllPanels();
      app.windowManager.openPanel("wordweaver");
    } else {
      openPanel("wordweaver");
    }

    const wwBtn = document.querySelector('.inkling-bottom-nav__btn[data-tab="wordweaver"]');
    if (wwBtn && !document.body.classList.contains("inkling-tab-wordweaver")) {
      wwBtn.click();
    }

    const embed = document.getElementById("wordweaver-embed");
    if (embed) {
      embed.classList.remove("hidden", "is-idle");
      embed.style.display = "flex";
      embed.style.zIndex = "10200";
    }

    document.body.classList.add("inkling-tab-wordweaver", "wordweaver-embed-open");
    document.body.classList.remove("inkling-tab-inkling", "inkling-stage-open");
  };

  queueMicrotask(activate);
  setTimeout(activate, 150);
  setTimeout(activate, 450);
}

/**
 * @param {import("./calendar/CalendarApp.js").CalendarApp} app
 */
export function registerInklingApp(app) {
  window.__inklingApp = app;
  bootWordWeaverFirst();
}
