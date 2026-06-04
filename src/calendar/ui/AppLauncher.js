import { AppIcon } from "./AppIcon.js";

/**
 * Open a single Inkling home / layer panel.
 * @param {string} panelId
 * @param {import("./WindowManager.js").WindowManager | null} [windowManager]
 */
export function openPanel(panelId, windowManager = null) {
  if (windowManager && typeof windowManager.openPanel === "function") {
    windowManager.openPanel(panelId);
    return;
  }
  document.dispatchEvent(
    new CustomEvent("inkling:open-panel", { detail: { panelId } })
  );
}

/**
 * Inkling shell launcher — icons for optional satellite apps (WordWeaver, etc.).
 * Rollback: remove this file and CalendarApp launcher bootstrap hook.
 */
export class AppLauncher {
  constructor({ apps, onOpenApp }) {
    this.apps = apps;
    this.onOpenApp = onOpenApp;
    this.el = null;
  }

  mount(container) {
    const launcher = document.createElement("section");
    launcher.className = "os-app-launcher";
    launcher.setAttribute("role", "region");
    launcher.setAttribute("aria-label", "App launcher");

    const title = document.createElement("p");
    title.className = "os-app-launcher__title";
    title.textContent = "Inkling apps";
    launcher.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "os-app-launcher__grid";
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", "Notebook Calendar and WordWeaver");
    launcher.appendChild(grid);

    this.apps.forEach((app) => {
      const icon = new AppIcon(app, {
        onOpen: (appId) => this.onOpenApp(appId)
      });
      icon.mount(grid);
    });

    container.appendChild(launcher);
    this.el = launcher;
  }
}
