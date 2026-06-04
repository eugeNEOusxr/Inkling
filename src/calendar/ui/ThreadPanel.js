import {
  getDayById,
  createNoteThread,
  addNoteToThread,
  updateNote,
  deleteNote,
  deleteThread,
  deleteReminder,
  deleteAlarm,
  getAllNotesForDay,
  formatTimestamp,
  formatHour,
  persistCalendarState,
  parseDate
} from "../calendarState.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Threaded notes panel — calendar stays visible behind overlay.
 */
export class ThreadPanel {
  constructor(stateRef, callbacks = {}) {
    this.state = stateRef;
    this.onChange = callbacks.onChange ?? (() => {});
    this.onBack = callbacks.onBack ?? (() => {});
    this.onSetReminder = callbacks.onSetReminder ?? (() => {});
    this.onSetAlarm = callbacks.onSetAlarm ?? (() => {});
    this.onThreadChange = callbacks.onThreadChange ?? (() => {});

    this.el = document.getElementById("thread-panel");
    this.titleEl = document.getElementById("thread-day-title");
    this.threadListEl = document.getElementById("thread-list");
    this.notesListEl = document.getElementById("thread-notes-list");
    this.allNotesEl = document.getElementById("all-notes-list");
    this.allNotesSection = document.getElementById("all-notes-section");
    this.noteHourSelect = document.getElementById("thread-note-hour");
    this.noteInput = document.getElementById("thread-note-input");
    this.remindersListEl = document.getElementById("day-reminders-list");
    this.threadLabelInput = document.getElementById("thread-label-input");
    this.composeStatusEl = document.getElementById("thread-compose-status");
    this.viewAllBtn = document.getElementById("btn-view-all-notes");

    this._dayId = null;
    this._selectedThreadId = null;
    this._viewAllMode = false;
    this._editingNoteId = null;

    this._populateHours();
    this._bindToolbar();
    this._bindKeyboard();
  }

  _bindKeyboard() {
    this.noteInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._addNote();
      }
    });

    this.threadLabelInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._addThread();
      }
    });
  }

  _showComposeStatus(msg, type = "ok") {
    if (!this.composeStatusEl) return;
    this.composeStatusEl.textContent = msg;
    this.composeStatusEl.className = `note-status note-status--${type}`;
  }

  _populateHours() {
    if (!this.noteHourSelect) return;
    this.noteHourSelect.innerHTML = "";
    this.noteHourSelect.classList.add("inkling-hour-select");
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = String(h);
      const h12 = h % 12 || 12;
      const ampm = h < 12 ? "AM" : "PM";
      opt.textContent = `${formatHour(h)} (${h12}:00 ${ampm})`;
      this.noteHourSelect.appendChild(opt);
    }
    this.noteHourSelect.value = String(new Date().getHours());
    this.noteHourSelect.size = 8;
    this.noteHourSelect.setAttribute("aria-label", "Hour — scroll for afternoon and evening times");
  }

  _bindToolbar() {
    document.getElementById("btn-create-thread")?.addEventListener("click", () => this._addThread());
    document.getElementById("btn-enter-note")?.addEventListener("click", () => this._addNote());
    document.getElementById("btn-set-reminder")?.addEventListener("click", () => {
      if (this._dayId) this.onSetReminder(this._dayId);
    });
    document.getElementById("btn-set-alarm")?.addEventListener("click", () => {
      if (this._dayId) this.onSetAlarm(this._dayId);
    });
    this.viewAllBtn?.addEventListener("click", () => this._toggleViewAll());
    document.getElementById("btn-back-month")?.addEventListener("click", () => this._handleBack());
  }

  open(dayId) {
    const day = getDayById(this.state, dayId);
    if (!day) return;

    this._dayId = dayId;
    this._viewAllMode = false;
    this._editingNoteId = null;

    if (day.threads.length === 0) {
      const thread = createNoteThread({ label: "General" });
      day.threads.unshift(thread);
    }
    this._selectedThreadId = day.threads[0]?.id ?? null;

    const { month, day: dayNum } = parseDate(day.date);
    this.titleEl.textContent = `${MONTH_NAMES[month - 1]} ${dayNum}`;

    this.el.classList.remove("hidden");
    this.el.setAttribute("aria-hidden", "false");
    this._render();
    if (this._selectedThreadId) this.onThreadChange(this._selectedThreadId);
  }

  getSelectedThreadId() {
    return this._selectedThreadId;
  }

  /**
   * @param {string} hour
   */
  setComposeHour(hour) {
    if (this.noteHourSelect) this.noteHourSelect.value = hour;
  }

  close() {
    this._dayId = null;
    this._selectedThreadId = null;
    this.el.classList.add("hidden");
    this.el.setAttribute("aria-hidden", "true");
    this.allNotesSection?.classList.add("hidden");
  }

  refresh() {
    if (this._dayId) this._render();
  }

  _handleBack() {
    persistCalendarState(this.state);
    this.close();
    this.onBack();
  }

  _toggleViewAll() {
    this._viewAllMode = !this._viewAllMode;
    this.allNotesSection?.classList.toggle("hidden", !this._viewAllMode);
    this.viewAllBtn?.classList.toggle("is-active", this._viewAllMode);
    this.viewAllBtn?.setAttribute("aria-pressed", String(this._viewAllMode));
    if (this._viewAllMode) this._renderAllNotes();
    this._render();
  }

  _addThread() {
    if (!this._dayId) return;
    const label = this.threadLabelInput?.value?.trim() ?? "";
    const day = getDayById(this.state, this._dayId);
    if (!day) return;

    const thread = createNoteThread({ label });
    day.threads.unshift(thread);
    this._selectedThreadId = thread.id;

    if (this.threadLabelInput) this.threadLabelInput.value = "";
    persistCalendarState(this.state);
    this._render();
    this.onChange();
    this.onThreadChange(thread.id);
    this._showComposeStatus(label ? `Thread “${label}” created.` : "New thread created.");
  }

  _addNote() {
    if (!this._dayId || !this._selectedThreadId) {
      this._showComposeStatus("Select or create a thread first.", "warn");
      return;
    }
    const text = this.noteInput.value.trim();
    if (!text) {
      this.noteInput.focus();
      this._showComposeStatus("Type a note before adding.", "warn");
      return;
    }
    const hour = Number(this.noteHourSelect.value);
    addNoteToThread(this.state, this._dayId, this._selectedThreadId, hour, text);
    this.noteInput.value = "";
    persistCalendarState(this.state);
    this._render();
    this.onChange();
    this._showComposeStatus(`Note added at ${formatHour(hour)}.`);
    window.dispatchEvent(
      new CustomEvent("eugeneous:note-added", { detail: { y: window.innerHeight * 0.5 } })
    );
  }

  _render() {
    const day = getDayById(this.state, this._dayId);
    if (!day) return;

    this._renderThreads(day);
    this._renderNotes(day);
    this._renderSchedules(day);
    if (this._viewAllMode) this._renderAllNotes();
  }

  _renderThreads(day) {
    this.threadListEl.innerHTML = "";
    if (day.threads.length === 0) {
      this.threadListEl.innerHTML = `<p class="empty-hint">No threads yet.</p>`;
      return;
    }

    day.threads.forEach((thread, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `thread-item${thread.id === this._selectedThreadId ? " active" : ""}`;
      const preview =
        thread.notes[thread.notes.length - 1]?.text?.slice(0, 40) || "Empty thread";
      const title =
        thread.label?.trim() || `Thread ${day.threads.length - i}`;
      btn.innerHTML = `
        <span class="thread-item-title">${escapeHtml(title)}</span>
        <span class="thread-item-meta">${formatTimestamp(thread.createdAt)} · ${thread.notes.length} note(s)</span>
        <span class="thread-item-preview">${escapeHtml(preview)}</span>
      `;
      btn.addEventListener("click", () => {
        this._selectedThreadId = thread.id;
        this._editingNoteId = null;
        this._render();
        this.onThreadChange(thread.id);
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "thread-delete";
      del.title = "Delete thread";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this thread and all its notes?")) {
          deleteThread(this.state, this._dayId, thread.id);
          if (this._selectedThreadId === thread.id) {
            this._selectedThreadId = day.threads[0]?.id ?? null;
          }
          persistCalendarState(this.state);
          this._render();
          this.onChange();
        }
      });
      btn.appendChild(del);
      this.threadListEl.appendChild(btn);
    });
  }

  _renderNotes(day) {
    this.notesListEl.innerHTML = "";
    const thread = day.threads.find((t) => t.id === this._selectedThreadId);
    if (!thread) {
      this.notesListEl.innerHTML = `<p class="empty-hint">Select a thread.</p>`;
      return;
    }
    if (thread.notes.length === 0) {
      this.notesListEl.innerHTML = `<p class="empty-hint">No notes in this thread.</p>`;
      return;
    }

    const sorted = [...thread.notes].sort((a, b) => a.createdAt - b.createdAt);
    for (const note of sorted) {
      const card = document.createElement("article");
      card.className = "note-card";
      if (note.id === this._editingNoteId) {
        card.innerHTML = `
          <div class="note-edit">
            <select class="note-edit-hour">${this._hourOptions(note.hour)}</select>
            <textarea class="note-edit-text" rows="3">${escapeHtml(note.text)}</textarea>
            <div class="note-actions">
              <button type="button" class="btn-sm btn-primary note-save-edit">Save</button>
              <button type="button" class="btn-sm note-cancel-edit">Cancel</button>
            </div>
          </div>
        `;
        card.querySelector(".note-save-edit")?.addEventListener("click", () => {
          const hour = Number(card.querySelector(".note-edit-hour").value);
          const text = card.querySelector(".note-edit-text").value;
          updateNote(this.state, this._dayId, thread.id, note.id, { hour, text });
          this._editingNoteId = null;
          persistCalendarState(this.state);
          this._render();
          this.onChange();
        });
        card.querySelector(".note-cancel-edit")?.addEventListener("click", () => {
          this._editingNoteId = null;
          this._render();
        });
      } else {
        card.classList.toggle("note-card--attention", note.needsAttention);
        card.innerHTML = `
          <header class="note-card-header">
            <span class="note-hour">${formatHour(note.hour)}</span>
            <time class="note-time">${formatTimestamp(note.createdAt)}</time>
            ${note.needsAttention ? '<span class="note-attention-badge" title="Needs attention">⚑</span>' : ""}
          </header>
          <p class="note-text">${escapeHtml(note.text)}</p>
          <div class="note-actions">
            <button type="button" class="btn-sm note-attention-btn">${note.needsAttention ? "Clear flag" : "Flag attention"}</button>
            <button type="button" class="btn-sm note-edit-btn">Edit</button>
            <button type="button" class="btn-sm note-delete-btn">Delete</button>
          </div>
        `;
        card.querySelector(".note-attention-btn")?.addEventListener("click", () => {
          updateNote(this.state, this._dayId, thread.id, note.id, {
            needsAttention: !note.needsAttention
          });
          persistCalendarState(this.state);
          this._render();
          this.onChange();
        });
        card.querySelector(".note-edit-btn")?.addEventListener("click", () => {
          this._editingNoteId = note.id;
          this._render();
        });
        card.querySelector(".note-delete-btn")?.addEventListener("click", () => {
          if (confirm("Delete this note?")) {
            deleteNote(this.state, this._dayId, thread.id, note.id);
            persistCalendarState(this.state);
            this._render();
            this.onChange();
          }
        });
      }
      this.notesListEl.appendChild(card);
    }
  }

  _renderSchedules(day) {
    if (!this.remindersListEl) return;
    const items = [
      ...day.reminders.map((r) => ({ ...r, kind: "reminder" })),
      ...day.alarms.map((a) => ({ ...a, kind: "alarm" }))
    ].sort((a, b) => a.triggerAt - b.triggerAt);

    if (items.length === 0) {
      this.remindersListEl.innerHTML = `<p class="empty-hint">No reminders or alarms.</p>`;
      return;
    }

    this.remindersListEl.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `schedule-row schedule-row--${item.kind}`;
      row.innerHTML = `
        <span class="schedule-kind">${item.kind === "alarm" ? "⏰" : "🔔"}</span>
        <span class="schedule-meta">${formatHour(item.hour)} · ${formatTimestamp(item.triggerAt)}</span>
        <span class="schedule-msg">${escapeHtml(item.message)}</span>
        <button type="button" class="btn-sm schedule-del">Delete</button>
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
      this.remindersListEl.appendChild(row);
    }
  }

  _renderAllNotes() {
    const day = getDayById(this.state, this._dayId);
    if (!day || !this.allNotesEl) return;

    const notes = getAllNotesForDay(day);
    this.allNotesEl.innerHTML = "";
    if (notes.length === 0) {
      this.allNotesEl.innerHTML = `<p class="empty-hint">No notes for this day.</p>`;
      return;
    }

    for (const note of notes) {
      const row = document.createElement("div");
      row.className = "all-note-row";
      row.innerHTML = `
        <span class="note-hour">${formatHour(note.hour)}</span>
        <span class="note-time">${formatTimestamp(note.createdAt)}</span>
        <p>${escapeHtml(note.text)}</p>
      `;
      row.addEventListener("click", () => {
        this._viewAllMode = false;
        this.allNotesSection?.classList.add("hidden");
        this._selectedThreadId = note.threadId;
        this._render();
      });
      this.allNotesEl.appendChild(row);
    }
  }

  _hourOptions(selected) {
    let html = "";
    for (let h = 0; h < 24; h++) {
      html += `<option value="${h}"${h === selected ? " selected" : ""}>${formatHour(h)}</option>`;
    }
    return html;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
