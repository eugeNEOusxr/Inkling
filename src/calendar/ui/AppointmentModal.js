import {
  addAppointment,
  editAppointment,
  computeTriggerAt,
  formatHour,
  persistCalendarState
} from "../calendarState.js";
import { CircularTimePicker } from "./CircularTimePicker.js";

/**
 * Modal to create or edit an appointment.
 */
export class AppointmentModal {
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.onSaved = callbacks.onSaved ?? (() => {});
    this.requestNotifyPermission =
      callbacks.requestNotifyPermission ?? (async () => "denied");

    this.el = document.getElementById("appointment-modal");
    this.titleEl = document.getElementById("appointment-modal-title");
    this.titleInput = document.getElementById("appointment-title");
    this.descInput = document.getElementById("appointment-description");
    this.hourSelect = document.getElementById("appointment-hour");
    this.clockMount = document.getElementById("appointment-circular-clock");
    this.saveBtn = document.getElementById("appointment-save");
    this.cancelBtn = document.getElementById("appointment-cancel");
    this.backdrop = this.el?.querySelector(".modal-backdrop");

    this._dayId = null;
    this._date = null;
    this._editId = null;

    this._populateHours();
    if (this.clockMount) {
      this.clock = new CircularTimePicker(this.clockMount, {
        variant: "appointment",
        onChange: (hour) => {
          if (this.hourSelect) this.hourSelect.value = String(hour);
        }
      });
    }
    this.saveBtn?.addEventListener("click", () => this._save());
    this.cancelBtn?.addEventListener("click", () => this.hide());
    this.backdrop?.addEventListener("click", () => this.hide());

    const onEnter = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._save();
      }
    };
    this.titleInput?.addEventListener("keydown", onEnter);
    this.descInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
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
   * @param {string} dayId
   * @param {string} date
   * @param {import("../calendarState.js").Appointment|null} [existing]
   */
  open(dayId, date, existing = null) {
    this._dayId = dayId;
    this._date = date;
    this._editId = existing?.id ?? null;

    if (this.titleEl) {
      this.titleEl.textContent = existing ? "Edit appointment" : "Add appointment";
    }
    this.titleInput.value = existing?.title ?? "";
    this.descInput.value = existing?.description ?? "";
    const hour = existing?.hour ?? new Date().getHours();
    this.hourSelect.value = String(hour);
    this.clock?.setHour(hour);

    this.el.classList.remove("hidden");
    this.el.setAttribute("aria-hidden", "false");
    this.titleInput.focus();
  }

  hide() {
    this.el.classList.add("hidden");
    this.el.setAttribute("aria-hidden", "true");
    this._dayId = null;
    this._editId = null;
  }

  async _save() {
    if (!this._dayId || !this._date) return;

    const title = this.titleInput.value.trim();
    if (!title) {
      this.titleInput.focus();
      return;
    }

    const hour = Number(this.hourSelect.value);
    const description = this.descInput.value.trim();
    const triggerAt = computeTriggerAt(this._date, hour);

    await this.requestNotifyPermission();

    if (this._editId) {
      editAppointment(this.state, this._dayId, this._editId, {
        title,
        description,
        hour,
        triggerAt
      });
    } else {
      addAppointment(this.state, this._dayId, {
        title,
        description,
        hour,
        triggerAt
      });
    }

    persistCalendarState(this.state);
    this.onSaved();
    this.hide();
  }
}
