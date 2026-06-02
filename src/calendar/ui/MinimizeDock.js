/**
 * Left chrome rail — minimized panel restore pills only.
 */
export class MinimizeDock {
  constructor() {
    this.onChange = null;

    this.el = document.getElementById("chrome-rail");
    this.pillsEl = document.getElementById("chrome-rail-pills");
    this.windows = new Map();

    if (!this.el) {
      this.el = document.createElement("aside");
      this.el.id = "chrome-rail";
      this.el.className = "chrome-rail";
      this.el.setAttribute("aria-label", "Restore minimized panels");
      this.el.innerHTML = `<div class="chrome-rail__pills" id="chrome-rail-pills" role="list"></div>`;
      this.pillsEl = this.el.querySelector("#chrome-rail-pills");
    }
  }

  mount(container) {
    const host = container ?? document.getElementById("app");
    if (host && !host.contains(this.el)) host.appendChild(this.el);
  }

  /**
   * @param {string} windowId
   * @param {{ appId?: string, title?: string, onRestore?: () => void }} meta
   */
  addWindow(windowId, meta = {}) {
    this.removeWindow(windowId);
    if (!this.pillsEl) return;

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "chrome-rail__pill";
    const label = meta.title ?? meta.appId ?? "Panel";
    pill.setAttribute("aria-label", `Restore ${label}`);
    pill.title = label;
    pill.textContent = label.length > 10 ? `${label.slice(0, 8)}…` : label;
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        meta.onRestore?.();
      } catch (err) {
        console.error("[MinimizeDock] restore failed", windowId, err);
      }
    });

    this.pillsEl.appendChild(pill);
    this.windows.set(windowId, { pill, meta });
    this.el.classList.add("has-pills");
    this.el.classList.remove("is-collapsed");
    this._notifyChange();
  }

  removeWindow(windowId) {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    entry.pill.remove();
    this.windows.delete(windowId);
    if (this.windows.size === 0) this.el.classList.remove("has-pills");
    this._notifyChange();
  }

  hasWindows() {
    return this.windows.size > 0;
  }

  _notifyChange() {
    this.onChange?.(this.windows.size);
    document.dispatchEvent(new CustomEvent("calendar3d-chrome-change"));
  }
}
