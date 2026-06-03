/**
 * Left calendar sidebar — draggable panel, collapses to vertical rail.
 */
import { renderMiniMonthCalendar } from "./MiniMonthCalendar.js";

const COLLAPSE_KEY = "inkling:sidebarCollapsed";
const FLOAT_KEY = "inkling:sidebarFloat";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
}

function formatShort(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function setSidebarWidth(px) {
  document.documentElement.style.setProperty("--calendar-sidebar-w", `${px}px`);
  document.dispatchEvent(new CustomEvent("calendar-sidebar-change", { detail: { width: px } }));
}

/** Reset sidebar panel to default docked position (module-level so boot never misses it). */
function applyDefaultPanelPosition(sidebar, panel) {
  if (!panel) return;
  sidebar?.classList.remove("is-floating");
  panel.style.left = "";
  panel.style.top = "";
  try {
    localStorage.removeItem(FLOAT_KEY);
  } catch {
    /* ignore */
  }
}

export class NotebookCalendarDock {
  /**
   * @param {object} callbacks
   */
  constructor(callbacks = {}) {
    this.onOpenDay = callbacks.onOpenDay ?? (() => {});
    this.onOpenNotes = callbacks.onOpenNotes ?? callbacks.onOpenDay ?? (() => {});
    this.onOpenWriter = callbacks.onOpenWriter ?? (() => {});
    this.onSyncMonth = callbacks.onSyncMonth ?? (() => {});
    this.onMaximize = callbacks.onMaximize ?? (() => {});
    this.onSidebarChange = callbacks.onSidebarChange ?? (() => {});

    this.sidebar = document.getElementById("calendar-sidebar");
    this.panel = document.getElementById("calendar-sidebar-panel");
    this.rail = this.sidebar?.querySelector("[data-sidebar-rail]");
    this.el = document.getElementById("notebook-calendar-dock");
    this.miniMount = document.getElementById("notebook-calendar-dock-mini");
    this.collapsedDayEl = this.sidebar?.querySelector("[data-collapsed-day]");
    this._date = todayIso();
    this._miniCal = null;
    this._collapsed = false;

    if (!this.el) {
      console.error("[NotebookCalendarDock] #notebook-calendar-dock not found — small calendar unavailable.");
      return;
    }

    if (!this.miniMount) {
      console.error("[NotebookCalendarDock] #notebook-calendar-dock-mini not found.");
    }

    this.el.querySelector('[data-delta="-1"]')?.addEventListener("click", () => this._shift(-1));
    this.el.querySelector('[data-delta="1"]')?.addEventListener("click", () => this._shift(1));
    this.el.querySelector("[data-today]")?.addEventListener("click", () => {
      const today = todayIso();
      this.setDate(today);
      void this.onSyncMonth(today);
    });
    this.el.querySelector("[data-open-notes]")?.addEventListener("click", () => void this._openNotes());
    this.el.querySelector("[data-open-writer]")?.addEventListener("click", () => void this._openWriter());
    this.sidebar?.querySelector("[data-calendar-maximize]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onMaximize();
    });

    this.sidebar?.querySelector("[data-sidebar-collapse]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.collapse();
    });
    this.sidebar?.querySelectorAll("[data-sidebar-expand]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.expand();
      });
    });

    this.rail?.addEventListener("click", (e) => {
      if (e.target.closest("[data-sidebar-expand]")) return;
      if (this._collapsed) this.expand();
    });

    applyDefaultPanelPosition(this.sidebar, this.panel);
    this._bindDrag();

    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") {
        localStorage.removeItem(COLLAPSE_KEY);
      }
      setSidebarWidth(228);
    } catch {
      setSidebarWidth(228);
    }

    this._mountMini();
    this._syncLabel();
    this.show();
    this.onSidebarChange();
  }

  _bindDrag() {
    const handle = this.sidebar?.querySelector("[data-sidebar-drag]");
    if (!handle || !this.panel) return;

    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const rect = this.panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      this.sidebar?.classList.add("is-floating");
    });

    handle.addEventListener("pointermove", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const left = Math.max(4, Math.min(window.innerWidth - 200, originLeft + (e.clientX - startX)));
      const top = Math.max(152, Math.min(window.innerHeight - 120, originTop + (e.clientY - startY)));
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
    });

    handle.addEventListener("pointerup", (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      handle.releasePointerCapture(e.pointerId);
      try {
        localStorage.setItem(
          FLOAT_KEY,
          JSON.stringify({ left: this.panel.style.left, top: this.panel.style.top })
        );
      } catch {
        /* ignore */
      }
    });
  }

  resetPanelPosition() {
    applyDefaultPanelPosition(this.sidebar, this.panel);
  }

  remountMini() {
    this._mountMini();
  }

  _mountMini() {
    if (!this.miniMount) {
      console.error("[NotebookCalendarDock] mini mount missing — cannot render small calendar");
      return;
    }
    try {
      const { year, month } = parseIso(this._date);
      this._miniCal = renderMiniMonthCalendar(this.miniMount, {
      year,
      month,
      selectedDate: this._date,
      onSelect: (iso) => {
        this.setDate(iso);
        void this.onSyncMonth(iso);
      },
      onMonthChange: (y, m) => {
        const d = parseIso(this._date);
        this._date = `${y}-${String(m).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        this._syncLabel();
        void this.onSyncMonth(this._date);
      }
    });
    } catch (err) {
      console.error("[NotebookCalendarDock] mini month render failed", err);
      this.miniMount.textContent = "Calendar failed to load — refresh the page.";
    }
  }

  setDate(iso) {
    this._date = iso;
    this._miniCal?.setSelectedDate(iso);
    this._syncLabel();
  }

  getDate() {
    return this._date;
  }

  isCollapsed() {
    return this._collapsed;
  }

  show() {
    this.sidebar?.classList.remove("hidden");
    this.sidebar?.setAttribute("aria-hidden", "false");
    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
    document.body.classList.add("calendar-sidebar-visible");
  }

  hide() {
    this.sidebar?.classList.add("hidden");
    this.sidebar?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("calendar-sidebar-visible");
  }

  expand(persist = true) {
    this._collapsed = false;
    this.sidebar?.classList.add("is-expanded");
    this.sidebar?.classList.remove("is-collapsed");
    if (this.rail) {
      this.rail.setAttribute("aria-hidden", "true");
    }
    if (this.panel) {
      this.panel.setAttribute("aria-hidden", "false");
    }
    if (persist) {
      try {
        localStorage.setItem(COLLAPSE_KEY, "0");
      } catch {
        /* ignore */
      }
    }
    setSidebarWidth(228);
    this.onSidebarChange();
  }

  collapse(persist = true) {
    this._collapsed = true;
    this.sidebar?.classList.remove("is-expanded");
    this.sidebar?.classList.add("is-collapsed");
    if (this.rail) {
      this.rail.setAttribute("aria-hidden", "false");
    }
    if (this.panel) {
      this.panel.setAttribute("aria-hidden", "true");
    }
    if (persist) {
      try {
        localStorage.setItem(COLLAPSE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setSidebarWidth(56);
    this._syncCollapsedDay();
    this.onSidebarChange();
  }

  _syncCollapsedDay() {
    if (!this.collapsedDayEl) return;
    const d = new Date(`${this._date}T12:00:00`);
    this.collapsedDayEl.textContent = String(d.getDate());
    this.collapsedDayEl.setAttribute("title", formatShort(this._date));
  }

  _syncLabel() {
    this._syncCollapsedDay();
  }

  async _openNotes() {
    await this.onOpenNotes(this._date);
  }

  async _openWriter() {
    await this.onOpenWriter(this._date);
  }

  _shift(delta) {
    this.setDate(addDays(this._date, delta));
    void this.onSyncMonth(this._date);
  }
}
