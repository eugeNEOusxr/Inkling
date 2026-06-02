/**
 * Shared schedulable events for feed, escalations, and notification wall.
 */
import { parseDate } from "../calendarState.js";
import { getAllNotesByDate } from "../../utils/storage.js";

/**
 * @param {string} dateStr
 * @param {string} time HH:MM
 */
export function triggerAtFromDateTime(dateStr, time) {
  const { year, month, day } = parseDate(dateStr);
  const [h, m] = String(time).split(":").map(Number);
  return new Date(year, month - 1, day, h, Number.isFinite(m) ? m : 0, 0, 0).getTime();
}

/**
 * @param {import("../calendarState.js").CalendarState} state
 * @returns {Array<{ id: string, kind: string, day: import("../calendarState.js").DayNode, triggerAt: number, hour: number, message: string, title: string, wall: string }>}
 */
export function collectSchedulableEvents(state) {
  const events = [];
  const slotNotesByDate = getAllNotesByDate();

  for (const day of state.days) {
    for (const r of day.reminders) {
      events.push({
        id: r.id,
        kind: "reminder",
        day,
        triggerAt: r.triggerAt,
        hour: r.hour,
        message: r.message,
        title: r.message || "Reminder",
        wall: "notebook"
      });
    }
    for (const a of day.alarms) {
      events.push({
        id: a.id,
        kind: "alarm",
        day,
        triggerAt: a.triggerAt,
        hour: a.hour,
        message: a.message,
        title: a.message || "Alarm",
        wall: "notebook"
      });
    }
    for (const appt of day.appointments) {
      events.push({
        id: appt.id,
        kind: "appointment",
        day,
        triggerAt: appt.triggerAt,
        hour: appt.hour,
        message: appt.title,
        title: appt.title || "Appointment",
        wall: "appointments"
      });
    }
    for (const thread of day.threads) {
      for (const note of thread.notes) {
        if (!note.needsAttention || !note.text?.trim()) continue;
        events.push({
          id: note.id,
          kind: "note",
          day,
          triggerAt: triggerAtFromDateTime(day.date, `${String(note.hour).padStart(2, "0")}:00`),
          hour: note.hour,
          message: note.text,
          title: "Note needs attention",
          wall: "notebook"
        });
      }
    }
    const slots = slotNotesByDate[day.date] ?? {};
    for (const [time, text] of Object.entries(slots)) {
      if (!text?.trim()) continue;
      const [h] = time.split(":").map(Number);
      events.push({
        id: `slot-${day.date}-${time}`,
        kind: "note",
        day,
        triggerAt: triggerAtFromDateTime(day.date, time),
        hour: Number.isFinite(h) ? h : 0,
        message: text.trim(),
        title: `Notebook ${time}`,
        wall: "notebook"
      });
    }
  }

  return events;
}
