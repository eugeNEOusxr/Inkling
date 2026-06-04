/**
 * Shell app panel host — optional floating windows for registry apps (not the calendar itself).
 * Rollback: remove MinimizeDock import and restore MinimizeBar wiring.
 */
import { MinimizeDock } from "./MinimizeDock.js";

export class WindowManager {
  /**
   * @param {{ apps: object[], calendarApp?: import("../CalendarApp.js").CalendarApp }} opts
   */
  constructor({ apps, calendarApp = null }) {
    this.apps = apps;
    this.calendarApp = calendarApp;
    this.windows = new Map();
    this.root = null;
    this.nextZ = 10130;
    this.nextId = 1;
    this.minimizeDock = new MinimizeDock();
    this._focusedCalendarWindows = new Set();
  }

  mount(container) {
    const root = document.createElement("section");
    root.className = "os-window-manager";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Open app windows");
    container.appendChild(root);
    this.root = root;
    const appRoot = document.getElementById("app");
    this.minimizeDock.mount(appRoot ?? container);
    this._bindEscapeToClose();
  }

  /**
   * Hide all shell windows and in-page panels so only one surface is active.
   */
  closeAllPanels() {
    for (const id of [...this.windows.keys()]) {
      this.closeWindow(id);
    }
    this.nextZ = 10130;
    this.windows.forEach((win) => {
      win.el.classList.remove("is-focused");
      win.el.style.zIndex = "";
    });
    this._hideDomPanels();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
  }

  /** @type {readonly string[]} */
  static PANEL_IDS = [
    "inkling-panel",
    "alerts-panel",
    "week-view-panel",
    "month-view-panel",
    "notebook-writer-panel",
    "thread-panel",
    "notification-wall-panel"
  ];

  /** @type {Record<string, string>} */
  static PANEL_NAME_MAP = {
    inkling: "inkling-panel",
    alerts: "alerts-panel",
    weekView: "week-view-panel",
    monthView: "month-view-panel",
    wordweaver: "wordweaver-embed"
  };

  _hideDomPanels() {
    for (const id of WindowManager.PANEL_IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.add("hidden");
      el.style.display = "none";
      el.style.zIndex = "0";
    }
    const ww = document.getElementById("wordweaver-embed");
    if (ww) {
      ww.style.zIndex = "0";
    }
    this.calendarApp?.wordWeaverEmbed?.exitImmersive?.();
    this.calendarApp?.wordWeaverEmbed?.hide?.();
  }

  /**
   * Show a single in-page panel (Inkling home, alerts, etc.).
   * @param {string} name e.g. "inkling", "wordweaver", "alerts"
   */
  openPanel(name) {
    this.closeAllPanels();

    if (name === "alerts") {
      void import("../alerts/AlertsDropdown.js").then((m) => m.openAlertsDropdown());
      document.dispatchEvent(
        new CustomEvent("inkling:open-panel", { detail: { panelId: name } })
      );
      return;
    }

    const targetId =
      WindowManager.PANEL_NAME_MAP[name] ??
      (name === "wordweaver" ? "wordweaver-embed" : `${name}-panel`);

    for (const id of WindowManager.PANEL_IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const isTarget = id === targetId;
      if (isTarget) {
        el.classList.remove("hidden");
        el.style.display = id.includes("view") ? "flex" : "block";
        el.style.zIndex = name === "inkling" ? "10350" : "10340";
      } else {
        el.classList.add("hidden");
        el.style.display = "none";
        el.style.zIndex = "0";
      }
    }

    const ww = document.getElementById("wordweaver-embed");
    if (ww) {
      if (name === "wordweaver") {
        ww.classList.remove("hidden");
        ww.style.display = "flex";
        ww.style.zIndex = "10200";
      } else {
        ww.style.zIndex = "900";
        this.calendarApp?.wordWeaverEmbed?.exitImmersive?.();
        this.calendarApp?.wordWeaverEmbed?.hide?.();
      }
    }

    document.dispatchEvent(
      new CustomEvent("inkling:open-panel", { detail: { panelId: name } })
    );
  }

  /**
   * @param {string} appId
   * @param {{ initialView?: string, dayId?: string }} [opts]
   */
  async openApp(appId, opts = {}) {
    const app = this.apps.find((item) => item.id === appId);
    if (!app || !this.root) return;

    this.closeAllPanels();

    const id = `window-${this.nextId++}`;
    const win = this._createWindowShell(id, app);
    this.windows.set(id, win);
    this.root.appendChild(win.el);
    this.focusWindow(id);

    if (appId === "notebook-calendar") {
      this._focusedCalendarWindows.add(id);
    }

    try {
      const mod = await app.loader();
      if (typeof mod?.mount !== "function") {
        throw new Error(`App "${appId}" did not export mount(container, opts).`);
      }
      win.unmount = mod.mount(win.body, {
        windowId: id,
        app,
        initialView: opts.initialView ?? "today",
        dayId: opts.dayId,
        getState: () => this.calendarApp?.state ?? null,
        onFocusCalendar: (date) => this.calendarApp?.focusNotebookCalendarMonth?.(date),
        onOpenDay: (date) => this.calendarApp?.openNotebookDayByDate?.(date),
        onOpenNotes: (date) => this.calendarApp?.openDayNotesByDate?.(date),
        onCloseWindow: () => this.closeWindow(id)
      });
    } catch (error) {
      console.error("[WindowManager] Failed to load app", appId, error);
      win.body.innerHTML = `<p class="os-window-error">Failed to load app: ${String(error.message || error)}</p>`;
    }
    this.calendarApp?._syncChromeLayerState?.();
  }

  focusWindow(id) {
    const win = this.windows.get(id);
    if (!win || win.minimized) return;
    win.el.style.zIndex = String(++this.nextZ);
    this.windows.forEach((entry) => {
      entry.el.classList.toggle("is-focused", entry.id === id);
    });
  }

  minimizeWindow(id) {
    const win = this.windows.get(id);
    if (!win || win.minimized) return;

    win.minimized = true;
    win.el.classList.add("is-minimized");
    win.el.style.pointerEvents = "none";
    win.el.setAttribute("aria-hidden", "true");
    win.el.remove();

    const winId = id;
    this.minimizeDock.addWindow(winId, {
      appId: win.appId,
      title: win.title,
      onRestore: () => this.restoreWindow(winId)
    });
    this.calendarApp?._syncChromeLayerState?.();
  }

  restoreWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.minimized = false;
    win.el.classList.remove("is-minimized");
    win.el.style.display = "";
    win.el.style.pointerEvents = "";
    win.el.setAttribute("aria-hidden", "false");
    this.minimizeDock.removeWindow(id);

    if (this.root) {
      if (!win.el.isConnected) {
        this.root.appendChild(win.el);
      }
      requestAnimationFrame(() => {
        this.focusWindow(id);
        this.calendarApp?._syncChromeLayerState?.();
      });
    }
    this.calendarApp?._syncChromeLayerState?.();
  }

  closeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    const focusedCalendar = this._focusedCalendarWindows.has(id);

    try {
      if (typeof win.unmount === "function") win.unmount();
    } catch {
      /* app cleanup errors should not block close */
    }

    win.el.remove();
    this.windows.delete(id);
    this.minimizeDock.removeWindow(id);
    this._focusedCalendarWindows.delete(id);

    if (focusedCalendar) {
      this.calendarApp?.resetView?.();
    }
    this.calendarApp?._syncChromeLayerState?.();
  }

  _createWindowShell(id, app) {
    const el = document.createElement("article");
    el.className = "os-window";
    if (app.id === "notebook-calendar") {
      el.classList.add("os-window--notebook-compact");
      el.style.left = "auto";
      el.style.right = "calc(min(38%, 440px) + 8px)";
      el.style.top = "92px";
    } else if (app.id === "wordweaver") {
      el.classList.add("os-window--wordweaver");
      el.style.width = "min(520px, 92vw)";
      el.style.left = "50%";
      el.style.top = "72px";
      el.style.transform = "translateX(-50%)";
    } else {
      el.style.left = `${80 + this.windows.size * 24}px`;
      el.style.top = `${80 + this.windows.size * 20}px`;
    }
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `${app.title} window`);

    const titlebar = document.createElement("header");
    titlebar.className = "os-window__titlebar";

    const title = document.createElement("span");
    title.className = "os-window__title";
    title.textContent = app.title;

    const actions = document.createElement("div");
    actions.className = "os-window__actions";

    const minimize = document.createElement("button");
    minimize.type = "button";
    minimize.className = "os-window__btn";
    minimize.setAttribute("aria-label", `Minimize ${app.title}`);
    minimize.textContent = "–";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "os-window__btn os-window__btn--close";
    close.setAttribute("aria-label", `Close ${app.title}`);
    close.title = "Close";
    close.textContent = "×";
    const stopTitlebarBubble = (event) => event.stopPropagation();
    close.addEventListener("pointerdown", stopTitlebarBubble);
    minimize.addEventListener("pointerdown", stopTitlebarBubble);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeWindow(id);
    });
    minimize.addEventListener("click", (event) => {
      event.stopPropagation();
      this.minimizeWindow(id);
    });

    actions.append(minimize, close);
    titlebar.append(title, actions);

    const body = document.createElement("div");
    body.className = "os-window__body";

    el.append(titlebar, body);
    el.addEventListener("pointerdown", () => this.focusWindow(id));
    this._makeDraggable(el, titlebar, id);

    return {
      id,
      appId: app.id,
      title: app.title,
      el,
      body,
      minimized: false,
      unmount: null
    };
  }

  _makeDraggable(el, dragHandle, id) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".os-window__btn, .os-window__actions")) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      dragHandle.setPointerCapture(event.pointerId);
      this.focusWindow(id);
    });

    dragHandle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      el.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
      el.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
    });

    const stopDrag = () => {
      dragging = false;
    };

    dragHandle.addEventListener("pointerup", stopDrag);
    dragHandle.addEventListener("pointercancel", stopDrag);
  }

  _bindEscapeToClose() {
    if (this._escapeBound) return;
    this._escapeBound = true;
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const focused = [...this.windows.entries()].find(
        ([, win]) => !win.minimized && win.el.classList.contains("is-focused")
      );
      if (!focused) return;
      event.preventDefault();
      this.closeWindow(focused[0]);
    });
  }
}
