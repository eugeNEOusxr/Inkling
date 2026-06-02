import {
  getDayById,
  upsertNoteInThread,
  getNoteInThreadForHour,
  formatHour,
  persistCalendarState
} from "./calendarState.js";

/**
 * Hour-focused editor synced with 3D grid — uses selected thread from ThreadPanel.
 */
export class UIOverlay {
  /**
   * @param {import("./calendarState.js").CalendarState} stateRef
   * @param {object} callbacks
   */
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.getSelectedThreadId = callbacks.getSelectedThreadId ?? (() => null);
    this.onHourChange = callbacks.onHourChange ?? (() => {});
    this.onSaved = callbacks.onSaved ?? (() => {});

    this.el = document.getElementById("hour-editor-panel");
    this.hourSelect = document.getElementById("overlay-hour");
    this.noteInput = document.getElementById("overlay-note");
    this.insertInput = document.getElementById("overlay-insert-input");
    this.insertBtn = document.getElementById("overlay-insert-btn");
    this.saveBtn = document.getElementById("overlay-save");
    this.statusEl = document.getElementById("overlay-status");

    this._dayId = null;
    this._pendingHour = null;

    this._populateHours();
    this.hourSelect?.addEventListener("change", () => this._onHourChanged());
    this.saveBtn?.addEventListener("click", () => this.save());
    this.insertBtn?.addEventListener("click", () => this.insertText());
    this.insertInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.insertText();
      }
    });
    this.noteInput?.addEventListener("input", () => this._clearStatus());
    this.noteInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.save();
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
   * @param {string} [hour]
   */
  open(dayId, hour = "0") {
    this._dayId = dayId;
    this.setHour(hour, false);
    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
  }

  close() {
    if (this._dayId) this._flushPending();
    this._dayId = null;
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
  }

  /**
   * @param {string} hour
   * @param {boolean} [notify]
   */
  setHour(hour, notify = true) {
    if (!this._dayId) return;
    this._flushPending();
    this.hourSelect.value = hour;
    this._pendingHour = hour;
    this._loadNoteForHour(hour);
    if (notify) this.onHourChange(hour);
  }

  _onHourChanged() {
    const hour = this.hourSelect.value;
    this.setHour(hour, true);
  }

  _loadNoteForHour(hour) {
    const threadId = this.getSelectedThreadId();
    const day = getDayById(this.state, this._dayId);
    if (!day || !threadId) {
      this.noteInput.value = "";
      return;
    }
    const note = getNoteInThreadForHour(day, threadId, hour);
    this.noteInput.value = note?.text ?? "";
    this._pendingHour = hour;
  }

  reload() {
    if (this._pendingHour != null) this._loadNoteForHour(this._pendingHour);
  }

  _flushPending() {
    if (!this._dayId || this._pendingHour == null) return;
    const threadId = this.getSelectedThreadId();
    if (!threadId) return;
    upsertNoteInThread(
      this.state,
      this._dayId,
      threadId,
      this._pendingHour,
      this.noteInput.value
    );
  }

  save() {
    if (!this._dayId) return;
    const threadId = this.getSelectedThreadId();
    if (!threadId) {
      this._showStatus("Select a thread first.", "warn");
      return;
    }
    const hour = this.hourSelect.value;
    upsertNoteInThread(this.state, this._dayId, threadId, hour, this.noteInput.value);
    this._pendingHour = hour;
    persistCalendarState(this.state);
    this.onSaved();
    this._showStatus("Saved.", "ok");
  }

  insertText() {
    const snippet = this.insertInput?.value?.trim();
    if (!snippet) {
      this._showStatus("Type text to insert.", "warn");
      return;
    }
    const ta = this.noteInput;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const spacer = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    ta.value = before + spacer + snippet + after;
    const cursor = start + spacer.length + snippet.length;
    ta.focus();
    ta.setSelectionRange(cursor, cursor);
    this.insertInput.value = "";
    this._showStatus("Inserted.", "ok");
  }

  _showStatus(msg, type) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.className = `note-status note-status--${type}`;
  }

  _clearStatus() {
    if (this.statusEl) {
      this.statusEl.textContent = "";
      this.statusEl.className = "note-status";
    }
  }
}
