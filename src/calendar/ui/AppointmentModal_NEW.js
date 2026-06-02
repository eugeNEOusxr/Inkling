import {
  addAppointment,
  editAppointment,
  computeTriggerAt,
  formatHour,
  persistCalendarState
} from "../calendarState.js";

/**
 * Modal to create or edit an appointment with digital clock time picker.
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
    this.saveBtn = document.getElementById("appointment-save");
    this.cancelBtn = document.getElementById("appointment-cancel");
    this.backdrop = this.el?.querySelector(".modal-backdrop");

    // Digital clock elements
    this.hourDisplay = document.getElementById("appointment-hour-display");
    this.minuteDisplay = document.getElementById("appointment-minute-display");
    this.hourGrid = document.getElementById("appointment-hour-grid");
    this.minuteGrid = document.getElementById("appointment-minute-grid");
    this.hourUpBtn = document.getElementById("appointment-hour-up");
    this.hourDownBtn = document.getElementById("appointment-hour-down");
    this.minuteUpBtn = document.getElementById("appointment-minute-up");
    this.minuteDownBtn = document.getElementById("appointment-minute-down");

    this.selectedHour = 0;
    this.selectedMinute = 0;

    this._dayId = null;
    this._date = null;
    this._editId = null;

    this._populateHoursAndMinutes();
    this._setupClockEventListeners();
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

  _populateHoursAndMinutes() {
    if (!this.hourSelect) return;
    
    // Populate hidden select for backward compatibility
    this.hourSelect.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = String(h);
      opt.textContent = formatHour(h);
      this.hourSelect.appendChild(opt);
    }

    // Populate hour grid
    if (this.hourGrid) {
      this.hourGrid.innerHTML = "";
      for (let h = 0; h < 24; h++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-unit-btn";
        btn.textContent = String(h).padStart(2, "0");
        btn.setAttribute("data-hour", String(h));
        btn.addEventListener("click", () => this._setHour(h));
        this.hourGrid.appendChild(btn);
      }
    }

    // Populate minute grid (every 5 minutes)
    if (this.minuteGrid) {
      this.minuteGrid.innerHTML = "";
      for (let m = 0; m < 60; m += 5) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-unit-btn";
        btn.textContent = String(m).padStart(2, "0");
        btn.setAttribute("data-minute", String(m));
        btn.addEventListener("click", () => this._setMinute(m));
        this.minuteGrid.appendChild(btn);
      }
    }
  }

  _setupClockEventListeners() {
    this.hourUpBtn?.addEventListener("click", () => {
      this._setHour((this.selectedHour + 1) % 24);
    });
    this.hourDownBtn?.addEventListener("click", () => {
      this._setHour((this.selectedHour - 1 + 24) % 24);
    });
    this.minuteUpBtn?.addEventListener("click", () => {
      this._setMinute((this.selectedMinute + 5) % 60);
    });
    this.minuteDownBtn?.addEventListener("click", () => {
      this._setMinute((this.selectedMinute - 5 + 60) % 60);
    });
  }

  _setHour(hour) {
    this.selectedHour = hour % 24;
    this._updateDisplay();
  }

  _setMinute(minute) {
    this.selectedMinute = minute % 60;
    this._updateDisplay();
  }

  _updateDisplay() {
    if (this.hourDisplay) {
      this.hourDisplay.textContent = String(this.selectedHour).padStart(2, "0");
    }
    if (this.minuteDisplay) {
      this.minuteDisplay.textContent = String(this.selectedMinute).padStart(2, "0");
    }
    if (this.hourSelect) {
      this.hourSelect.value = String(this.selectedHour);
    }
    this._updateGridSelection();
  }

  _updateGridSelection() {
    // Update hour grid selection
    if (this.hourGrid) {
      this.hourGrid.querySelectorAll(".time-unit-btn").forEach((btn) => {
        if (parseInt(btn.getAttribute("data-hour")) === this.selectedHour) {
          btn.classList.add("selected");
        } else {
          btn.classList.remove("selected");
        }
      });
    }
    // Update minute grid selection
    if (this.minuteGrid) {
      this.minuteGrid.querySelectorAll(".time-unit-btn").forEach((btn) => {
        if (parseInt(btn.getAttribute("data-minute")) === this.selectedMinute) {
          btn.classList.add("selected");
        } else {
          btn.classList.remove("selected");
        }
      });
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
    this._setHour(hour);
    this._setMinute(0);
    this._updateDisplay();

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

    const hour = this.selectedHour;
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
