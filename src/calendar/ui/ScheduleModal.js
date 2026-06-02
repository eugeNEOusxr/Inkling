import {
  addReminder,
  addAlarm,
  computeTriggerAt,
  formatHour,
  persistCalendarState
} from "../calendarState.js";
import { CircularTimePicker } from "./CircularTimePicker.js";

/**
 * Modal for setting reminders or alarms on a day.
 */
export class ScheduleModal {
  /**
   * @param {import("../calendarState.js").CalendarState} stateRef
   * @param {{ onSaved?: () => void, requestNotifyPermission?: () => Promise<string> }} callbacks
   */
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.onSaved = callbacks.onSaved ?? (() => {});
    this.requestNotifyPermission =
      callbacks.requestNotifyPermission ?? (async () => "denied");

    this.el = document.getElementById("schedule-modal");
    this.titleEl = document.getElementById("schedule-modal-title");
    this.hourSelect = document.getElementById("schedule-hour");
    this.clockMount = document.getElementById("schedule-circular-clock");
    this.messageInput = document.getElementById("schedule-message");
    this.saveBtn = document.getElementById("schedule-save");
    this.cancelBtn = document.getElementById("schedule-cancel");
    this.backdrop = this.el?.querySelector(".modal-backdrop");

    this._dayId = null;
    this._date = null;
    this._mode = "reminder";

    this._populateHours();
    if (this.clockMount) {
      this.clock = new CircularTimePicker(this.clockMount, {
        variant: "reminder",
        onChange: (hour) => {
          if (this.hourSelect) this.hourSelect.value = String(hour);
        }
      });
    }
    this.saveBtn?.addEventListener("click", () => this._save());
    this.cancelBtn?.addEventListener("click", () => this.hide());
    this.backdrop?.addEventListener("click", () => this.hide());
    this.messageInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._save();
      }
    });
  }

  _populateHours() {
    if (!this.hourSelect) return;
    this.hourSelect.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = String(h);
      opt.textContent = formatHour(h);
      this.hourSelect.appendChild(opt);
    }
  }

  /**
   * @param {'reminder'|'alarm'} mode
   * @param {string} dayId
   * @param {string} date
   */
  open(mode, dayId, date) {
    this._mode = mode;
    this._dayId = dayId;
    this._date = date;

    if (this.titleEl) {
      this.titleEl.textContent =
        mode === "alarm" ? "Set alarm" : "Set reminder";
    }
    this.clock?.setVariant(mode === "alarm" ? "alarm" : "reminder");
    this.messageInput.value = "";
    const hour = new Date().getHours();
    this.hourSelect.value = String(hour);
    this.clock?.setHour(hour);

    this.el.classList.remove("hidden");
    this.el.setAttribute("aria-hidden", "false");
  }

  hide() {
    this.el.classList.add("hidden");
    this.el.setAttribute("aria-hidden", "true");
    this._dayId = null;
  }

  async _save() {
    if (!this._dayId || !this._date) return;

    const hour = Number(this.hourSelect.value);
    const message = this.messageInput.value.trim();
    if (!message) {
      this.messageInput.focus();
      return;
    }

    await this.requestNotifyPermission();

    const triggerAt = computeTriggerAt(this._date, hour);
    if (this._mode === "alarm") {
      addAlarm(this.state, this._dayId, hour, message, triggerAt);
    } else {
      addReminder(this.state, this._dayId, hour, message, triggerAt);
    }

    persistCalendarState(this.state);
    this.onSaved();
    this.hide();
  }
}
