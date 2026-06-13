import {
  getDayById,
  formatHour,
  formatTimestamp,
  parseDate,
  deleteReminder,
  deleteAlarm
} from "../calendarState.js";
import { getNotesForDate } from "../../utils/storage.js";
import { iconBack, iconBell, iconHour } from "./IconLibrary.js";
import { CircularTimePicker } from "./CircularTimePicker.js";
import { VerticalTimeWheel } from "./VerticalTimeWheel.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * @param {import("../calendarState.js").DayNode} day
 */
function buildAppointmentSlotMap(day) {
  const map = {};
  for (const appt of day.appointments) {
    // Snap to one 30-min slot (so :15/:45 land in a single row, not two).
    const minute = Number(appt.minute ?? 0);
    const slotMin = minute >= 30 ? "30" : "00";
    const key = `${String(appt.hour).padStart(2, "0")}:${slotMin}`;
    if (!map[key]) map[key] = [];
    map[key].push({ id: appt.id, title: appt.title });
  }
  return map;
}

/**
 * Day timeline writer — notes (Notebook Calendar) or appointments (Appointments Calendar).
 */
export class NotebookWriterPanel {
  /**
   * @param {import("../calendarState.js").CalendarState} stateRef
   * @param {object} callbacks
   */
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.onChange = callbacks.onChange ?? (() => {});
    this.onBack = callbacks.onBack ?? (() => {});
    this.onSetReminder = callbacks.onSetReminder ?? (() => {});
    this.onSetAlarm = callbacks.onSetAlarm ?? (() => {});
    this.onHourSelect = callbacks.onHourSelect ?? (() => {});
    this.onCommitNote = callbacks.onCommitNote ?? (() => {});
    this.onCommitAppointment = callbacks.onCommitAppointment ?? (() => {});
    this.onDeleteAppointment = callbacks.onDeleteAppointment ?? (() => {});
    this.onMinimize = callbacks.onMinimize ?? (() => {});
    this.onPickDate = callbacks.onPickDate ?? (() => {});

    this.el = document.getElementById("notebook-writer-panel");
    this.titleEl = document.getElementById("notebook-writer-day-title");
    this.subtitleEl = document.getElementById("notebook-writer-day-subtitle");
    this.scrollerMount = document.getElementById("notebook-writer-scroller-mount");
    this.remindersEl = document.getElementById("notebook-writer-reminders");
    this.hourStripEl = document.getElementById("notebook-writer-hour-strip");
    this.hintEl = document.getElementById("notebook-writer-hint");
    this.schedulesTitleEl = document.getElementById("notebook-writer-schedules-title");
    this.backButton = document.getElementById("btn-writer-back-month");
    this.datePicker = document.getElementById("notebook-writer-date-picker");
    this.clockMount = document.getElementById("notebook-writer-clock");
    this.wheelMount = document.getElementById("notebook-writer-wheel-mount");
    this.timeToggleBtn = document.getElementById("btn-writer-time-toggle");
    this.modeTabsEl = this.el?.querySelector(".notebook-writer-mode-tabs");
    /** @type {CircularTimePicker | null} */
    this._clock = null;
    /** @type {VerticalTimeWheel | null} */
    this._wheel = null;
    this._timeUi = "clock";

    this._dayId = null;
    this._savedDayId = null;
    this._minimized = false;
    this._selectedHour = "0";
    /** @type {'notebook'|'appointments'|'alarm'} */
    this._mode = "notebook";
    /** @type {import("./DayScroller.js").default | null} */
    this._dayScroller = null;

    if (this.backButton) this.backButton.innerHTML = `${iconBack} Back to month`;

    this._injectChromeButtons();
    // Hour-strip chips (12a/1a…) retired — the clock + scrolling the timeline
    // are the only time pickers now.
    if (this.hourStripEl) this.hourStripEl.style.display = "none";
    this._bindModeTabs();
    this._mountClock();
    this._mountWheel();

    this.timeToggleBtn?.addEventListener("click", () => this._toggleTimeUi());
    this.backButton?.addEventListener("click", () => this.hide());
    // Date chooser → loads that day and syncs the Calendar (formerly WordWeaver).
    this.datePicker?.addEventListener("change", () => {
      const iso = this.datePicker.value;
      if (iso) this.onPickDate(iso);
    });
  }

  _bindModeTabs() {
    this.modeTabsEl?.querySelectorAll("[data-writer-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-writer-mode");
        if (mode !== "notebook" && mode !== "appointments" && mode !== "alarm") return;
        if (!this._dayId) return;
        this.setMode(mode);
      });
    });
  }

  /**
   * @param {'notebook'|'appointments'|'alarm'} mode
   */
  setMode(mode) {
    if (!this._dayId) return;
    const day = getDayById(this.state, this._dayId);
    if (!day) return;
    this._mode = mode;
    this.modeTabsEl?.querySelectorAll("[data-writer-mode]").forEach((btn) => {
      const active = btn.getAttribute("data-writer-mode") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const scrollerMode = mode === "appointments" ? "appointments" : "notebook";
    void this._mountScroller(day, scrollerMode);
    this._applyModeChrome(mode);
    this._renderReminders(day);
  }

  /**
   * @param {'notebook'|'appointments'|'alarm'} mode
   */
  _applyModeChrome(mode) {
    this.el?.classList.toggle("notebook-writer-panel--appointments", mode === "appointments");
    this.el?.classList.toggle("notebook-writer-panel--notebook", mode === "notebook" || mode === "alarm");
    this.el?.classList.toggle("notebook-writer-panel--alarm", mode === "alarm");

    const clockVariant =
      mode === "appointments" ? "appointment" : mode === "alarm" ? "alarm" : "reminder";
    this._clock?.setVariant(clockVariant);

    if (this.hintEl) {
      if (mode === "appointments") {
        this.hintEl.textContent =
          "Pick a time · scroll the timeline · Enter saves each appointment";
      } else if (mode === "alarm") {
        this.hintEl.textContent =
          "Pick a time for the alarm · Enter saves in the slot · notifications sync automatically";
      } else {
        this.hintEl.textContent =
          "Pick a time on the clock · scroll the timeline · Enter saves the note (reminders sync from the slot)";
      }
    }
    if (this.schedulesTitleEl) {
      this.schedulesTitleEl.textContent =
        mode === "appointments" ? "Reminders & alarms for this day" : "Upcoming from your slots";
    }

    const bodyClass =
      mode === "appointments" ? "appointment-writer-panel-open" : "notebook-writer-panel-open";
    document.body.classList.remove("notebook-writer-panel-open", "appointment-writer-panel-open");
    document.body.classList.add(bodyClass);
    document.body.dataset.panelOpen =
      mode === "appointments" ? "appointment-writer" : "notebook-writer";
  }

  _toggleTimeUi() {
    this._timeUi = this._timeUi === "clock" ? "wheel" : "clock";
    this.clockMount?.classList.toggle("hidden", this._timeUi !== "clock");
    this.wheelMount?.classList.toggle("hidden", this._timeUi !== "wheel");
    this.wheelMount?.setAttribute("aria-hidden", String(this._timeUi !== "wheel"));
    if (this.timeToggleBtn) {
      this.timeToggleBtn.textContent = this._timeUi === "clock" ? "Wheel" : "Clock";
    }
    if (this._timeUi === "wheel") {
      this._wheel?.setHour(Number(this._selectedHour));
    } else {
      this._clock?.setHour(Number(this._selectedHour));
    }
  }

  _injectChromeButtons() {
    const headerRow = this.el?.querySelector(".thread-header-row");
    if (!headerRow || headerRow.querySelector(".notebook-writer-minimize-btn")) return;

    const minimize = document.createElement("button");
    minimize.type = "button";
    minimize.className = "notebook-writer-minimize-btn";
    minimize.setAttribute("aria-label", "Minimize writer");
    minimize.title = "Minimize";
    minimize.textContent = "–";
    minimize.addEventListener("click", () => this.minimize());

    const close = document.createElement("button");
    close.type = "button";
    close.className = "notebook-writer-close-x";
    close.setAttribute("aria-label", "Close writer");
    close.title = "Close";
    close.textContent = "×";
    close.addEventListener("click", () => this.hide());

    headerRow.append(minimize, close);
  }

  _mountClock() {
    if (!this.clockMount || this._clock) return;
    this._clock = new CircularTimePicker(this.clockMount, {
      variant: "reminder",
      onChange: (hour24) => {
        this.selectHour(String(hour24), true);
        this.onHourSelect(String(hour24));
      }
    });
    this.clockMount.classList.add("notebook-writer-clock-mount");
  }

  _mountWheel() {
    if (!this.wheelMount || this._wheel) return;
    this._wheel = new VerticalTimeWheel(this.wheelMount, {
      onChange: (hour24, timeLabel) => {
        // Navigate to the exact slot the wheel landed on (incl :30) and focus
        // its note field — same behavior as picking a time on the clock.
        const time = timeLabel || `${String(hour24).padStart(2, "0")}:00`;
        this._selectedHour = String(hour24);
        this._clock?.setHour(Number(hour24));
        this._dayScroller?.selectTime(time, true);
        this._dayScroller?.focusSlotAtTime(time);
        this._highlightHourChip(hour24);
        this.onHourSelect(String(hour24));
      }
    });
  }

  _buildHourStrip() {
    if (!this.hourStripEl) return;
    this.hourStripEl.innerHTML = "";
    this.hourStripEl.setAttribute("aria-label", "Jump to hour — scroll for noon through midnight");
    for (let h = 0; h < 24; h++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notebook-writer-hour-chip";
      btn.dataset.hour = String(h);
      const h12 = h % 12 || 12;
      const ampm = h < 12 ? "a" : "p";
      btn.textContent = `${h12}${ampm}`;
      btn.title = formatHour(h);
      btn.setAttribute("aria-label", `Jump to ${formatHour(h)}`);
      btn.addEventListener("click", () => {
        this.selectHour(String(h), true);
        this.onHourSelect(String(h));
      });
      this.hourStripEl.appendChild(btn);
    }
  }

  /**
   * @param {string} dayId
   * @param {string} [initialHour]
   * @param {'notebook'|'appointments'|'alarm'} [mode]
   */
  open(dayId, initialHour = "0", mode = "notebook") {
    const day = getDayById(this.state, dayId);
    if (!day) return;

    this._dayId = dayId;
    this._savedDayId = dayId;
    this._minimized = false;
    this._selectedHour = String(initialHour);
    this._mode = mode;

    const { month, day: dayNum } = parseDate(day.date);
    const weekday = new Date(day.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
    if (this.titleEl) {
      this.titleEl.textContent =
        mode === "appointments" ? "Appointment Writer" : mode === "alarm" ? "Alarm Writer" : "Notebook Writer";
    }
    if (this.subtitleEl) {
      this.subtitleEl.textContent = `${weekday}, ${MONTH_NAMES[month - 1]} ${dayNum}`;
    }
    if (this.datePicker) this.datePicker.value = day.date;

    this.modeTabsEl?.querySelectorAll("[data-writer-mode]").forEach((btn) => {
      const active = btn.getAttribute("data-writer-mode") === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    this._applyModeChrome(mode);

    this.el?.classList.remove("hidden", "is-minimized-panel");
    this.el?.setAttribute("aria-hidden", "false");
    this.el.style.pointerEvents = "auto";
    document.body.classList.add("inkling-stage-open", "inkling-tab-writer");

    if (!this._clock) this._mountClock();
    if (!this._wheel) this._mountWheel();

    const scrollerMode = mode === "appointments" ? "appointments" : "notebook";
    void this._mountScroller(day, scrollerMode);
    this._clock?.setHour(Number(this._selectedHour));
    this._wheel?.setHour(Number(this._selectedHour));
    this.selectHour(this._selectedHour, false);
    this._renderReminders(day);
    this._highlightHourChip(this._selectedHour);
  }

  close() {
    this._destroyScroller();
    this._dayId = null;
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
    this.el.style.pointerEvents = "none";
    document.body.classList.remove(
      "notebook-writer-panel-open",
      "appointment-writer-panel-open",
      "inkling-stage-open",
      "inkling-tab-writer"
    );
    if (document.body.dataset.panelOpen === "notebook-writer" || document.body.dataset.panelOpen === "appointment-writer") {
      delete document.body.dataset.panelOpen;
    }
  }

  hide() {
    this.close();
    this.onBack();
  }

  minimize() {
    const dayId = this._dayId ?? this._savedDayId;
    if (!dayId) return;
    this._savedDayId = dayId;
    this._dayId = dayId;
    this._minimized = true;
    this.el?.classList.add("is-minimized-panel", "hidden");
    this.el.style.pointerEvents = "none";
    document.body.classList.remove("notebook-writer-panel-open", "appointment-writer-panel-open");
    this.onMinimize();
  }

  restore() {
    if (!this._savedDayId) return;
    this._minimized = false;
    this.el?.classList.remove("is-minimized-panel", "hidden");
    this.el.style.pointerEvents = "auto";
    const dayId = this._savedDayId;
    const hour = this._selectedHour;
    const mode = this._mode;
    window.dispatchEvent(
      new CustomEvent("calendar3d-writer-restore", {
        detail: { dayId, hour, mode }
      })
    );
  }

  refresh() {
    if (!this._dayId) return;
    const day = getDayById(this.state, this._dayId);
    if (!day) return;
    const scrollerMode = this._mode === "appointments" ? "appointments" : "notebook";
    if (this._mode === "appointments") {
      this._dayScroller?.setSlotAppointments(buildAppointmentSlotMap(day));
    } else {
      this._dayScroller?.setSlotNotes(getNotesForDate(day.date));
    }
    this._renderReminders(day);
    this._highlightHourChip(this._selectedHour);
  }

  getMode() {
    return this._mode;
  }

  getSavedDayId() {
    return this._savedDayId ?? this._dayId;
  }

  getSavedHour() {
    return String(this._selectedHour ?? "0");
  }

  /**
   * @param {string} hour 0–23
   * @param {boolean} [notify]
   */
  selectHour(hour, notify = false) {
    this._selectedHour = String(hour);
    const time = `${String(hour).padStart(2, "0")}:00`;
    this._clock?.setHour(Number(hour));
    this._wheel?.setHour(Number(hour));
    this._dayScroller?.selectTime(time, true);
    // Only pull focus into the slot's text field on an explicit user pick.
    // On the silent open() call this would yank the page down to the times
    // (and pop the mobile keyboard), hiding the clock the user just zoomed to.
    if (notify) this._dayScroller?.focusSlotAtTime(time);
    this._highlightHourChip(hour);
    if (notify) this.onHourSelect(hour);
  }

  _highlightHourChip(hour) {
    this.hourStripEl?.querySelectorAll(".notebook-writer-hour-chip").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.hour === String(hour));
    });
  }

  async _mountScroller(day, mode = "notebook") {
    if (!this.scrollerMount) return;
    this._destroyScroller();
    this.scrollerMount.innerHTML = "";

    let DayScroller;
    try {
      ({ default: DayScroller } = await import("./DayScroller.js"));
    } catch (err) {
      console.error("[NotebookWriterPanel] DayScroller failed to load:", err);
      this.scrollerMount.innerHTML =
        '<p class="notebook-writer-reminders-empty">Timeline failed to load. Refresh the page.</p>';
      return;
    }
    const scrollerMode = mode === "appointments" ? "appointments" : "notebook";
    const time = `${String(this._selectedHour).padStart(2, "0")}:00`;
    const isAppointments = scrollerMode === "appointments";

    this._dayScroller = new DayScroller(this.scrollerMount, {
      date: day.date,
      time,
      showDateNav: false,
      orientation: "vertical",
      inlineNotes: true,
      timelineKind: isAppointments ? "appointments" : "notes",
      slotNotes: isAppointments ? {} : getNotesForDate(day.date),
      slotAppointments: isAppointments ? buildAppointmentSlotMap(day) : {},
      onSelect: (payload) => {
        const hour = String(Number(payload.time.split(":")[0]));
        this._selectedHour = hour;
        // Clock follows the chosen slot (setHour is programmatic — no onChange loop).
        this._clock?.setHour(Number(hour));
        this._wheel?.setHour(Number(hour));
        this._highlightHourChip(hour);
        this.onHourSelect(hour);
      },
      onCommit: (payload) => {
        const hour = String(Number(payload.time.split(":")[0]));
        this._selectedHour = hour;
        if (this._mode === "alarm" && this._dayId) {
          this.onSetAlarm(this._dayId);
        }
        this.onCommitNote(payload);
        this._dayScroller?.setSlotNotes(getNotesForDate(payload.date));
        this._renderReminders(getDayById(this.state, this._dayId));
        this.onChange();
      },
      onCommitAppointment: (payload) => {
        const hour = String(Number(payload.time.split(":")[0]));
        this._selectedHour = hour;
        this.onCommitAppointment({ ...payload, dayId: this._dayId });
        this._dayScroller?.setSlotAppointments(
          buildAppointmentSlotMap(getDayById(this.state, this._dayId))
        );
        this.onChange();
      },
      onDeleteAppointment: (payload) => {
        this.onDeleteAppointment({ ...payload, dayId: this._dayId });
        this._dayScroller?.setSlotAppointments(
          buildAppointmentSlotMap(getDayById(this.state, this._dayId))
        );
        this.onChange();
      }
    });
    this._armMobileScroll();
  }

  _armMobileScroll() {
    const track = this.scrollerMount?.querySelector(".day-scroller__track");
    const wrap = this.scrollerMount?.querySelector(".day-scroller__track-wrap");
    if (!track) return;

    const scrollToSelected = () => {
      const idx = this._dayScroller?.selectedIndex ?? 0;
      const row = track.querySelector(`[data-slot="${idx}"]`);
      if (row?.scrollIntoView) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        track.scrollTop = Math.max(0, idx * 56 - track.clientHeight * 0.35);
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToSelected);
    });

    const stop = (e) => e.stopPropagation();
    for (const el of [track, wrap, this.scrollerMount]) {
      if (!el || el.dataset.writerTouchBound) continue;
      el.dataset.writerTouchBound = "1";
      el.addEventListener("touchstart", stop, { passive: true });
      el.addEventListener("touchmove", stop, { passive: true });
      el.addEventListener("pointerdown", stop);
    }

    if (track && !track.dataset.wheelBound) {
      track.dataset.wheelBound = "1";
      track.addEventListener(
        "wheel",
        (e) => {
          if (track.scrollHeight <= track.clientHeight) return;
          e.preventDefault();
          e.stopPropagation();
          track.scrollTop += e.deltaY;
        },
        { passive: false }
      );
    }

    // Scroll to pick: the clock follows whichever slot is centered in the track.
    if (track && !track.dataset.clockSyncBound) {
      track.dataset.clockSyncBound = "1";
      let raf = 0;
      track.addEventListener(
        "scroll",
        () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const trackRect = track.getBoundingClientRect();
            const centerY = trackRect.top + track.clientHeight / 2;
            let bestHour = null;
            let bestDist = Infinity;
            track.querySelectorAll(".day-scroller__row").forEach((row) => {
              const r = row.getBoundingClientRect();
              const dist = Math.abs(r.top + r.height / 2 - centerY);
              if (dist < bestDist) {
                bestDist = dist;
                bestHour = Number((row.getAttribute("data-time") || "0:0").split(":")[0]);
              }
            });
            if (bestHour != null && String(bestHour) !== this._selectedHour) {
              this._selectedHour = String(bestHour);
              this._clock?.setHour(bestHour);
              this._wheel?.setHour(bestHour);
            }
          });
        },
        { passive: true }
      );
    }

    if (!this._writerResizeObserver && typeof ResizeObserver !== "undefined") {
      this._writerResizeObserver = new ResizeObserver(() => scrollToSelected());
      this._writerResizeObserver.observe(this.scrollerMount);
    }
  }

  _destroyScroller() {
    this._writerResizeObserver?.disconnect();
    this._writerResizeObserver = null;
    if (this._dayScroller) {
      this._dayScroller.destroy();
      this._dayScroller = null;
    }
    if (this.scrollerMount) this.scrollerMount.innerHTML = "";
  }

  _renderReminders(day) {
    if (!this.remindersEl) return;
    const rows = [
      ...day.reminders.map((r) => ({
        kind: "reminder",
        id: r.id,
        hour: r.hour,
        label: r.message,
        at: r.triggerAt
      })),
      ...day.alarms.map((a) => ({
        kind: "alarm",
        id: a.id,
        hour: a.hour,
        label: a.message,
        at: a.triggerAt
      }))
    ].sort((a, b) => a.hour - b.hour);

    if (!rows.length) {
      this.remindersEl.innerHTML = `<p class="notebook-writer-reminders-empty">No reminders or alarms for this day.</p>`;
      return;
    }

    this.remindersEl.innerHTML = rows
      .map(
        (row) => `
      <div class="notebook-writer-reminder-row notebook-writer-reminder-row--${row.kind}">
        <button type="button" class="notebook-writer-reminder-jump" data-hour="${row.hour}">
          <span class="notebook-writer-reminder-time">${formatHour(row.hour)}</span>
          <span class="notebook-writer-reminder-label">${escapeHtml(row.label)}</span>
          <span class="notebook-writer-reminder-when">${formatTimestamp(row.at)}</span>
        </button>
        <button type="button" class="btn-ghost btn-ghost--sm notebook-writer-reminder-delete" data-kind="${row.kind}" data-id="${row.id}" aria-label="Remove">×</button>
      </div>`
      )
      .join("");

    this.remindersEl.querySelectorAll(".notebook-writer-reminder-jump").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hour = btn.getAttribute("data-hour");
        if (hour != null) {
          this.selectHour(hour, true);
          this.onHourSelect(hour);
        }
      });
    });

    this.remindersEl.querySelectorAll(".notebook-writer-reminder-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-kind");
        const id = btn.getAttribute("data-id");
        if (!id || !this._dayId) return;
        if (kind === "reminder") deleteReminder(this.state, this._dayId, id);
        else deleteAlarm(this.state, this._dayId, id);
        this.onChange();
        this._renderReminders(getDayById(this.state, this._dayId));
      });
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
