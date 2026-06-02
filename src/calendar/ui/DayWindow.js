import { getDayById, parseDate } from "../calendarState.js";
import { getNotesForDate } from "../../utils/storage.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Unified day popup: date header, 3D hour strip, scrollable note/reminder layers.
 * Rollback: remove this file and CalendarApp dayWindow wiring.
 */
export class DayWindow {
  /**
   * @param {object} callbacks
   */
  constructor(callbacks = {}) {
    this.onBack = callbacks.onBack ?? (() => {});
    this.onMinimize = callbacks.onMinimize ?? (() => {});
    this.onHourSelect = callbacks.onHourSelect ?? (() => {});
    this.onSetReminder = callbacks.onSetReminder ?? (() => {});
    this.onSetAlarm = callbacks.onSetAlarm ?? (() => {});
    this.onCommitNote = callbacks.onCommitNote ?? (() => {});

    this.el = document.getElementById("day-window");
    this.frame = this.el?.querySelector(".day-window__frame");
    this.scrollEl = document.getElementById("day-window-scroll");
    this.titleEl = document.getElementById("day-window-title");
    this.subtitleEl = document.getElementById("day-window-subtitle");
    this.hourScrollerMount = document.getElementById("day-window-hour-scroller");
    this.previewEl = this.el?.querySelector(".day-window__preview");
    /** @type {import("./DayScroller.js").default | null} */
    this._dayScroller = null;

    this.threadPanel = document.getElementById("thread-panel");
    this.hourEditor = document.getElementById("hour-editor-panel");
    this.notebookWriterPanel = document.getElementById("notebook-writer-panel");

    this._dayId = null;
    this._mode = "notebook";
    this._selectedHour = "0";
    this._minimized = false;
    this._anchors = new Map();

    document.getElementById("day-window-back")?.addEventListener("click", () => {
      this.close();
      this.onBack();
    });

    document.getElementById("day-window-minimize")?.addEventListener("click", () => {
      this.minimize();
    });

    this.el?.querySelector(".day-window__backdrop")?.addEventListener("click", () => {
      this.close();
      this.onBack();
    });

    document.getElementById("day-window-set-reminder")?.addEventListener("click", () => {
      if (this._dayId) this.onSetReminder(this._dayId);
    });

    document.getElementById("day-window-set-alarm")?.addEventListener("click", () => {
      if (this._dayId) this.onSetAlarm(this._dayId);
    });
  }

  /**
   * @param {string} dayId
   * @param {"notebook"|"appointments"} [mode]
   */
  open(dayId, mode = "notebook") {
    const state = this._getState?.() ?? null;
    const dayData = state ? getDayById(state, dayId) : null;
    if (!dayData) return;

    this._dayId = dayId;
    this._mode = mode;
    this._minimized = false;

    const { year, month, day: dayNum } = parseDate(dayData.date);
    const weekday = new Date(year, month - 1, dayNum).toLocaleDateString(undefined, {
      weekday: "long"
    });

    if (this.titleEl) {
      this.titleEl.textContent = `${weekday}, ${MONTH_NAMES[month - 1]} ${dayNum}`;
    }
    if (this.subtitleEl) {
      this.subtitleEl.textContent =
        mode === "appointments" ? "Appointments · timeline" : "NotebookWriter · timeline";
    }

    this._mountPanels(mode);
    if (mode === "notebook") {
      this._destroyHourScroller();
      this.previewEl?.classList.add("hidden");
    } else {
      this._destroyHourScroller();
      this.previewEl?.classList.add("hidden");
    }

    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
    document.body.classList.add("day-window-open");
    document.body.dataset.dayWindowMode = mode;
  }

  /** @param {() => import("../calendarState.js").CalendarState | null} fn */
  setStateAccessor(fn) {
    this._getState = fn;
  }

  _mountPanels(mode) {
    if (!this.scrollEl) return;

    this._restoreToOverlay(this.hourEditor, "hour-editor");
    this._restoreToOverlay(this.threadPanel, "thread-panel");
    this._reparent(this.notebookWriterPanel, "notebook-writer");
    this.notebookWriterPanel?.classList.remove("hidden");
    this.notebookWriterPanel?.setAttribute("aria-hidden", "false");
  }

  _reparent(node, key) {
    if (!node || !this.scrollEl) return;
    if (!this._anchors.has(key)) {
      this._anchors.set(key, {
        parent: node.parentNode,
        next: node.nextSibling
      });
    }
    node.classList.add("day-window__layer");
    this.scrollEl.appendChild(node);
  }

  _restoreToOverlay(node, key) {
    const anchor = this._anchors.get(key);
    if (!node || !anchor?.parent) return;
    node.classList.remove("day-window__layer");
    if (anchor.next && anchor.next.parentNode === anchor.parent) {
      anchor.parent.insertBefore(node, anchor.next);
    } else {
      anchor.parent.appendChild(node);
    }
  }

  async _mountHourScroller(dayData) {
    if (!this.hourScrollerMount) return;
    this._destroyHourScroller();
    this.hourScrollerMount.innerHTML = "";

    const { default: DayScroller } = await import("./DayScroller.js");
    const initialTime = `${String(this._selectedHour).padStart(2, "0")}:00`;

    this._dayScroller = new DayScroller(this.hourScrollerMount, {
      date: dayData.date,
      time: initialTime,
      showDateNav: false,
      orientation: "vertical",
      inlineNotes: true,
      slotNotes: getNotesForDate(dayData.date),
      onSelect: (payload) => {
        const hour = String(Number(payload.time.split(":")[0]));
        this._selectedHour = hour;
        this.onHourSelect(hour);
      },
      onCommit: (payload) => {
        const hour = String(Number(payload.time.split(":")[0]));
        this._selectedHour = hour;
        this.onCommitNote(payload);
        this.onHourSelect(hour);
      }
    });
  }

  _destroyHourScroller() {
    if (this._dayScroller) {
      this._dayScroller.destroy();
      this._dayScroller = null;
    }
    if (this.hourScrollerMount) this.hourScrollerMount.innerHTML = "";
  }

  /**
   * @param {string} hour
   * @param {boolean} [notify] call onHourSelect (default false when syncing from 3D)
   */
  setSelectedHour(hour, notify = false) {
    this._selectedHour = hour;
    if (notify) this.onHourSelect(hour);
  }

  minimize() {
    if (!this._dayId) return;
    this._minimized = true;
    this.el?.classList.add("is-minimized");
    document.body.classList.remove("day-window-open");
    const label = this.titleEl?.textContent ?? "Day";
    this.onMinimize(this._dayId, label, this._mode);
  }

  restore() {
    if (!this._dayId) return;
    this._minimized = false;
    const dayId = this._dayId;
    const mode = this._mode;
    this.el?.classList.remove("is-minimized", "hidden");
    this.el?.setAttribute("aria-hidden", "false");
    document.body.classList.add("day-window-open");
    document.body.dataset.dayWindowMode = mode;
    this._mountPanels(mode);
    if (mode === "notebook" || mode === "appointments") {
      document.dispatchEvent(
        new CustomEvent("calendar3d-writer-restore", {
          detail: {
            dayId,
            hour: this._selectedHour,
            mode: mode === "appointments" ? "appointments" : "notebook"
          }
        })
      );
    }
  }

  close() {
    this._destroyHourScroller();
    this._restoreAllPanels();
    this._dayId = null;
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("day-window-open");
    delete document.body.dataset.dayWindowMode;
  }

  _restoreAllPanels() {
    for (const key of ["hour-editor", "thread-panel", "notebook-writer"]) {
      const node =
        key === "hour-editor"
          ? this.hourEditor
          : key === "thread-panel"
            ? this.threadPanel
            : this.notebookWriterPanel;
      this._restoreToOverlay(node, key);
    }
  }

  isOpen() {
    return Boolean(this._dayId && !this._minimized);
  }
}
