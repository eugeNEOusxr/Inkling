/**
 * Month-wall hover tooltip: scrollable list of notes (and appointments) by time slot.
 */
import { getDayById } from "./calendarState.js";
import { getNotesForDate } from "../utils/storage.js";

/**
 * @typedef {{ time: string, timeLabel: string, text: string, kind?: string }} HoverEntry
 */

/**
 * @param {import("./calendarState.js").DayNode | null} day
 * @param {string} dateStr YYYY-MM-DD
 * @returns {HoverEntry[]}
 */
export function collectNotebookHoverEntries(day, dateStr) {
  /** @type {Map<string, HoverEntry>} */
  const byTime = new Map();

  if (day) {
    for (const thread of day.threads) {
      for (const note of thread.notes) {
        const text = note.text?.trim();
        if (!text) continue;
        const time = `${String(note.hour).padStart(2, "0")}:00`;
        byTime.set(time, { time, timeLabel: time, text, kind: "note" });
      }
    }
  }

  const slots = getNotesForDate(dateStr);
  for (const [time, text] of Object.entries(slots)) {
    const trimmed = text?.trim();
    if (!trimmed) continue;
    byTime.set(time, { time, timeLabel: time, text: trimmed, kind: "slot-note" });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * @param {import("./calendarState.js").DayNode | null} day
 * @returns {HoverEntry[]}
 */
export function collectAppointmentHoverEntries(day) {
  if (!day) return [];
  const rows = [];
  for (const appt of day.appointments) {
    const title = appt.title?.trim();
    if (!title) continue;
    const time = `${String(appt.hour).padStart(2, "0")}:00`;
    rows.push({ time, timeLabel: time, text: title, kind: "appointment" });
  }
  for (const r of day.reminders) {
    if (!r.message?.trim()) continue;
    const time = `${String(r.hour).padStart(2, "0")}:00`;
    rows.push({ time, timeLabel: time, text: r.message, kind: "reminder" });
  }
  for (const a of day.alarms) {
    if (!a.message?.trim()) continue;
    const time = `${String(a.hour).padStart(2, "0")}:00`;
    rows.push({ time, timeLabel: time, text: a.message, kind: "alarm" });
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * @param {import("./calendarState.js").CalendarState | null} state
 * @param {string | null} dayId
 * @param {"notebook"|"appointments"} wall
 * @returns {HoverEntry[]}
 */
export function getHoverEntriesForDay(state, dayId, wall) {
  if (!state || !dayId) return [];
  const day = getDayById(state, dayId);
  if (!day) return [];
  if (wall === "appointments") return collectAppointmentHoverEntries(day);
  return collectNotebookHoverEntries(day, day.date);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KIND_LABEL = {
  note: "Note",
  "slot-note": "Note",
  appointment: "Appt",
  reminder: "Reminder",
  alarm: "Alarm"
};

/**
 * @param {HTMLElement | null} root
 * @param {import("./calendarState.js").CalendarState | null} state
 * @param {string | null} dayId
 * @param {"notebook"|"appointments"} wall
 */
export function updateDayHoverPreview(root, state, dayId, wall) {
  if (!root) return;

  const listEl = root.querySelector(".day-hover-preview__list");
  const titleEl = root.querySelector(".day-hover-preview__title");
  const emptyEl = root.querySelector(".day-hover-preview__empty");

  if (!dayId || !state) {
    hideDayHoverPreview(root);
    return;
  }

  const day = getDayById(state, dayId);
  if (!day) {
    hideDayHoverPreview(root);
    return;
  }

  const entries = getHoverEntriesForDay(state, dayId, wall);
  if (!entries.length) {
    hideDayHoverPreview(root);
    return;
  }

  const { year, month, day: dayNum } = parseDateParts(day.date);
  const weekday = new Date(year, month - 1, dayNum).toLocaleDateString(undefined, {
    weekday: "short"
  });
  if (titleEl) {
    titleEl.textContent = `${weekday}, ${day.date}`;
  }

  if (listEl) {
    listEl.innerHTML = entries
      .map((entry) => {
        const kind = KIND_LABEL[entry.kind] ?? "Note";
        return `
        <div class="day-hover-preview__row" data-time="${escapeHtml(entry.time)}">
          <span class="day-hover-preview__time">${escapeHtml(entry.timeLabel)}</span>
          <div class="day-hover-preview__note-wrap">
            <span class="day-hover-preview__kind">${escapeHtml(kind)}</span>
            <p class="day-hover-preview__text">${escapeHtml(entry.text)}</p>
          </div>
        </div>`;
      })
      .join("");
  }

  emptyEl?.classList.add("hidden");
  listEl?.classList.remove("hidden");
  root.classList.remove("hidden");
}

export function hideDayHoverPreview(root) {
  if (!root) return;
  root.classList.add("hidden");
  const listEl = root.querySelector(".day-hover-preview__list");
  if (listEl) listEl.innerHTML = "";
}

/**
 * @param {HTMLElement | null} root
 * @param {number} clientX
 * @param {number} clientY
 */
export function positionDayHoverPreview(root, clientX, clientY) {
  if (!root || root.classList.contains("hidden")) return;

  const pad = 14;
  const rect = root.getBoundingClientRect();
  let left = clientX + pad;
  let top = clientY + pad;

  const maxLeft = window.innerWidth - rect.width - 8;
  const maxTop = window.innerHeight - rect.height - 8;
  if (left > maxLeft) left = Math.max(8, clientX - rect.width - pad);
  if (top > maxTop) top = Math.max(8, clientY - rect.height - pad);

  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
}

function parseDateParts(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}
