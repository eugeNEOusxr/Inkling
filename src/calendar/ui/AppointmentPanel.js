import {
  getDayById,
  getAppointmentsForDay,
  deleteAppointment,
  deleteReminder,
  deleteAlarm,
  formatTimestamp,
  formatHour,
  persistCalendarState,
  parseDate
} from "../calendarState.js";
import { iconAddAppointment, iconBell, iconHour, iconBack } from "./IconLibrary.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Right-side panel for appointments on a day.
 */
export class AppointmentPanel {
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.onChange = callbacks.onChange ?? (() => {});
    this.onBack = callbacks.onBack ?? (() => {});
    this.onAddAppointment = callbacks.onAddAppointment ?? (() => {});
    this.onEditAppointment = callbacks.onEditAppointment ?? (() => {});
    this.onSetReminder = callbacks.onSetReminder ?? (() => {});
    this.onSetAlarm = callbacks.onSetAlarm ?? (() => {});

    this.el = document.getElementById("appointment-panel");
    this.titleEl = document.getElementById("appointment-day-title");
    this.listEl = document.getElementById("appointment-list");
    this.schedulesEl = document.getElementById("appointment-schedules-list");
    this.statusEl = document.getElementById("appointment-panel-status");
    this.backButton = document.getElementById("btn-appt-back-month");
    this.closeXButton = null;

    this._dayId = null;
    this._actionDropdownEl = null;
    this._onDocPointerDown = null;
    this._onOutsidePanelPointerDown = null;

    // Icon upgrades (monochrome + tintable).
    const btnAddAppointment = document.getElementById("btn-add-appointment");
    if (btnAddAppointment) btnAddAppointment.innerHTML = `${iconAddAppointment} Add Appointment`;

    const btnApptReminder = document.getElementById("btn-appt-set-reminder");
    if (btnApptReminder) btnApptReminder.innerHTML = `${iconBell} Set Reminder`;

    const btnApptAlarm = document.getElementById("btn-appt-set-alarm");
    if (btnApptAlarm) btnApptAlarm.innerHTML = `${iconHour} Set Alarm`;

    const btnApptBack = this.backButton;
    if (btnApptBack) btnApptBack.innerHTML = `${iconBack} Back to month`;
    this._injectCloseXButton();

    this._buildActionDropdown();

    btnAddAppointment?.addEventListener("click", () => {
      if (!this._dayId) return;
      this._toggleActionDropdown();
    });
    document.getElementById("btn-appt-set-reminder")?.addEventListener("click", () => {
      if (this._dayId) this.onSetReminder(this._dayId);
    });
    document.getElementById("btn-appt-set-alarm")?.addEventListener("click", () => {
      if (this._dayId) this.onSetAlarm(this._dayId);
    });
    if (this.backButton) {
      this.backButton.onclick = () => {
        // #region agent log
        fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial',hypothesisId:'H4',location:'AppointmentPanel.js:backButton.onclick',message:'Appointment back button invoked',data:{hasDayId:Boolean(this._dayId),panelHidden:this.el?.classList.contains("hidden")},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        this.hide();
      };
    }
  }

  _buildActionDropdown() {
    if (this._actionDropdownEl) return;

    const el = document.createElement("div");
    el.className = "appointment-action-dropdown hidden";
    el.setAttribute("role", "menu");
    el.setAttribute("aria-hidden", "true");

    el.innerHTML = `
      <div class="appointment-action-dropdown-title">Add / schedule</div>
      <div class="appointment-action-dropdown-items">
        <button type="button" class="appointment-action-item" data-action="appointment">
          ${iconAddAppointment} Add Appointment
        </button>
        <button type="button" class="appointment-action-item" data-action="reminder">
          ${iconBell} Add Reminder
        </button>
        <button type="button" class="appointment-action-item" data-action="alarm">
          ${iconHour} Add Alarm
        </button>
      </div>
    `;

    document.body.appendChild(el);
    this._actionDropdownEl = el;

    el.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!this._dayId) return;
        const action = btn.getAttribute("data-action");
        if (action === "appointment") this.onAddAppointment(this._dayId);
        if (action === "reminder") this.onSetReminder(this._dayId);
        if (action === "alarm") this.onSetAlarm(this._dayId);
        this._closeActionDropdown();
      });
    });
  }

  _injectCloseXButton() {
    if (!this.el) return;
    const headerRow = this.el.querySelector(".thread-header-row");
    if (!headerRow) return;

    const existing = headerRow.querySelector(".appointment-close-x");
    if (existing) {
      this.closeXButton = existing;
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "appointment-close-x";
    btn.setAttribute("aria-label", "Close appointment panel");
    btn.title = "Close";
    btn.textContent = "×";
    btn.onclick = () => {
      // #region agent log
      fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-3',hypothesisId:'H4',location:'AppointmentPanel.js:closeX.onclick',message:'Appointment close X invoked',data:{hasDayId:Boolean(this._dayId),panelHidden:this.el?.classList.contains("hidden")},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      this.hide();
    };

    headerRow.appendChild(btn);
    this.closeXButton = btn;
  }

  _toggleActionDropdown() {
    if (!this._actionDropdownEl) return;
    if (this._actionDropdownEl.classList.contains("hidden")) this._openActionDropdown();
    else this._closeActionDropdown();
  }

  _openActionDropdown() {
    if (!this._actionDropdownEl) return;

    const btn = document.getElementById("btn-add-appointment");
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    this._actionDropdownEl.style.left = `${Math.max(10, rect.left)}px`;
    this._actionDropdownEl.style.top = `${Math.min(window.innerHeight - 80, rect.bottom + 8)}px`;
    this._actionDropdownEl.style.width = `${Math.min(360, window.innerWidth - 20)}px`;

    this._actionDropdownEl.classList.remove("hidden");
    this._actionDropdownEl.setAttribute("aria-hidden", "false");

    if (this._onDocPointerDown) return;
    this._onDocPointerDown = (e) => {
      if (!this._actionDropdownEl) return;
      const target = e.target;
      if (this._actionDropdownEl.contains(target)) return;
      if (btn.contains(target)) return;
      this._closeActionDropdown();
    };
    document.addEventListener("pointerdown", this._onDocPointerDown, { capture: true });
  }

  _closeActionDropdown() {
    if (!this._actionDropdownEl) return;
    this._actionDropdownEl.classList.add("hidden");
    this._actionDropdownEl.setAttribute("aria-hidden", "true");

    if (this._onDocPointerDown) {
      document.removeEventListener("pointerdown", this._onDocPointerDown, { capture: true });
      this._onDocPointerDown = null;
    }
  }

  open(dayId) {
    const day = getDayById(this.state, dayId);
    if (!day) return;

    this._dayId = dayId;
    this._buildActionDropdown();
    const { month, day: dayNum } = parseDate(day.date);
    this.titleEl.textContent = `${MONTH_NAMES[month - 1]} ${dayNum}`;

    this.el.classList.remove("hidden");
    this.el.setAttribute("aria-hidden", "false");
    document.body.classList.add("appointment-panel-open");
    this.el.style.pointerEvents = "auto";
    document.body.dataset.panelOpen = "appointment";
    this._bindOutsidePanelClose();
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial',hypothesisId:'H5',location:'AppointmentPanel.js:open',message:'Appointment panel opened with layering state',data:{panelZ:getComputedStyle(this.el).zIndex,panelPointer:getComputedStyle(this.el).pointerEvents,modalZ:getComputedStyle(document.getElementById("appointment-modal")).zIndex,scheduleZ:getComputedStyle(document.getElementById("schedule-modal")).zIndex},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this._render();
  }

  close() {
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'phase5',hypothesisId:'H16',location:'AppointmentPanel.js:close',message:'Appointment close called',data:{hadDayId:Boolean(this._dayId),hasDropdown:Boolean(this._actionDropdownEl),panelPointer:this.el?.style.pointerEvents||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this._dayId = null;
    this._closeActionDropdown();
    if (this._actionDropdownEl) {
      this._actionDropdownEl.remove();
      this._actionDropdownEl = null;
    }
    this.el.classList.add("hidden");
    this.el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("appointment-panel-open");
    this.el.style.pointerEvents = "none";
    if (document.body.dataset.panelOpen === "appointment") {
      delete document.body.dataset.panelOpen;
    }
    this._unbindOutsidePanelClose();
  }

  /**
   * Hide entrypoint for the panel close/back control.
   * This is the method the UI close button should call.
   */
  hide() {
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial',hypothesisId:'H4',location:'AppointmentPanel.js:hide',message:'Appointment hide called',data:{hadDayId:Boolean(this._dayId),dropdownExists:Boolean(this._actionDropdownEl),classList:this.el?.className||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this.el.classList.add("hidden");
    this.el.setAttribute("aria-hidden", "true");
    this.el.style.pointerEvents = "none";
    if (document.body.dataset.panelOpen === "appointment") {
      delete document.body.dataset.panelOpen;
    }
    this._unbindOutsidePanelClose();

    // Close dropdown if open
    this._closeActionDropdown?.();
    if (this._actionDropdownEl) {
      this._actionDropdownEl.remove();
      this._actionDropdownEl = null;
    }

    // Clear dayId
    this._dayId = null;

    // Notify CalendarApp
    this.onBack?.();
  }

  refresh() {
    if (this._dayId) this._render();
  }

  _handleBack() {
    // Back-compat: older callers may still use the internal handler.
    this.hide();
  }

  _render() {
    const day = getDayById(this.state, this._dayId);
    if (!day) return;

    this._renderAppointments(day);
    this._renderSchedules(day);
  }

  _renderAppointments(day) {
    this.listEl.innerHTML = "";
    const items = getAppointmentsForDay(day);

    if (items.length === 0) {
      this.listEl.innerHTML = `<p class="empty-hint">No appointments yet. Click <strong>Add Appointment</strong>.</p>`;
      return;
    }

    for (const ap of items) {
      const card = document.createElement("article");
      card.className = "appointment-card";
      card.innerHTML = `
        <header class="appointment-card-header">
          <span class="note-hour">${formatHour(ap.hour)}</span>
          <time class="note-time">${formatTimestamp(ap.triggerAt)}</time>
        </header>
        <h4 class="appointment-card-title">${escapeHtml(ap.title)}</h4>
        <p class="appointment-card-desc">${escapeHtml(ap.description || "—")}</p>
        <div class="note-actions">
          <button type="button" class="btn-sm btn-edit-appt">Edit</button>
          <button type="button" class="btn-sm btn-delete-appt">Delete</button>
        </div>
      `;

      card.querySelector(".btn-edit-appt")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onEditAppointment(this._dayId, ap);
      });
      card.addEventListener("click", () => {
        this.onEditAppointment(this._dayId, ap);
      });
      card.querySelector(".btn-delete-appt")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this appointment?")) {
          deleteAppointment(this.state, this._dayId, ap.id);
          persistCalendarState(this.state);
          this._render();
          this.onChange();
          this._showStatus("Appointment deleted.");
        }
      });

      this.listEl.appendChild(card);
    }
  }

  _renderSchedules(day) {
    if (!this.schedulesEl) return;
    const items = [
      ...day.reminders.map((r) => ({ ...r, kind: "reminder" })),
      ...day.alarms.map((a) => ({ ...a, kind: "alarm" }))
    ].sort((a, b) => a.triggerAt - b.triggerAt);

    if (items.length === 0) {
      this.schedulesEl.innerHTML = `<p class="empty-hint">No reminders or alarms.</p>`;
      return;
    }

    this.schedulesEl.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `schedule-row schedule-row--${item.kind}`;
      row.innerHTML = `
        <span class="schedule-kind">${item.kind === "alarm" ? "⏰" : "🔔"}</span>
        <span class="schedule-meta">${formatHour(item.hour)} · ${formatTimestamp(item.triggerAt)}</span>
        <button type="button" class="btn-sm schedule-del">Delete</button>
        <span class="schedule-msg">${escapeHtml(item.message)}</span>
      `;
      row.querySelector(".schedule-del")?.addEventListener("click", () => {
        if (item.kind === "alarm") {
          deleteAlarm(this.state, this._dayId, item.id);
        } else {
          deleteReminder(this.state, this._dayId, item.id);
        }
        persistCalendarState(this.state);
        this._render();
        this.onChange();
      });
      this.schedulesEl.appendChild(row);
    }
  }

  _showStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  _bindOutsidePanelClose() {
    if (this._onOutsidePanelPointerDown || !this.el) return;
    this._onOutsidePanelPointerDown = (event) => {
      if (document.body.dataset.panelOpen !== "appointment") return;
      const target = event.target;
      if (this.el.contains(target)) return;
      if (this._actionDropdownEl?.contains?.(target)) return;
      this.hide();
    };
    document.addEventListener("pointerdown", this._onOutsidePanelPointerDown, {
      capture: true
    });
  }

  _unbindOutsidePanelClose() {
    if (!this._onOutsidePanelPointerDown) return;
    document.removeEventListener("pointerdown", this._onOutsidePanelPointerDown, {
      capture: true
    });
    this._onOutsidePanelPointerDown = null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
