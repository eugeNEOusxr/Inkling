import { parseDate } from "./calendarState.js";
import { getAllNotesByDate } from "../utils/storage.js";
import { formatNotificationTime, getTypeIcon } from "./notifications/notificationFeed.js";

/**
 * @typedef {Object} ReaderItem
 * @property {string} id
 * @property {'note'|'reminder'|'alarm'|'appointment'|'slot-note'} kind
 * @property {string} date
 * @property {string} dayId
 * @property {string} timeLabel
 * @property {number} triggerAt
 * @property {string} title
 * @property {string} message
 * @property {'notebook'|'appointments'} wall
 * @property {'upcoming'|'past'} status
 */

/**
 * All notes, slot notes, reminders, alarms, and appointments — sorted by time.
 * Reader UI only shows dates and time slots that have at least one entry.
 * @param {import("./calendarState.js").CalendarState} state
 * @param {number} [now]
 * @returns {ReaderItem[]}
 */
export function buildNotebookReaderItems(state, now = Date.now()) {
  const items = [];
  const persisted = getAllNotesByDate();

  for (const day of state.days) {
    const { year, month, day: d } = parseDate(day.date);

    for (const thread of day.threads) {
      for (const note of thread.notes) {
        if (!note.text?.trim()) continue;
        const triggerAt = new Date(year, month - 1, d, note.hour, 0, 0).getTime();
        items.push({
          id: `reader-note-${note.id}`,
          kind: "note",
          date: day.date,
          dayId: day.id,
          timeLabel: `${String(note.hour).padStart(2, "0")}:00`,
          triggerAt,
          title: thread.label || "Notebook note",
          message: note.text,
          wall: "notebook",
          status: triggerAt < now ? "past" : "upcoming"
        });
      }
    }

    const slotNotes = persisted[day.date] ?? {};
    for (const [time, text] of Object.entries(slotNotes)) {
      if (!text?.trim()) continue;
      const [h, m] = time.split(":").map(Number);
      const triggerAt = new Date(year, month - 1, d, h, m || 0, 0).getTime();
      items.push({
        id: `reader-slot-${day.date}-${time}`,
        kind: "slot-note",
        date: day.date,
        dayId: day.id,
        timeLabel: time,
        triggerAt,
        title: "Timeline note",
        message: text.trim(),
        wall: "notebook",
        status: triggerAt < now ? "past" : "upcoming"
      });
    }

    for (const r of day.reminders) {
      items.push({
        id: `reader-reminder-${r.id}`,
        kind: "reminder",
        date: day.date,
        dayId: day.id,
        timeLabel: `${String(r.hour).padStart(2, "0")}:00`,
        triggerAt: r.triggerAt,
        title: "Reminder",
        message: r.message,
        wall: "notebook",
        status: r.triggerAt < now ? "past" : "upcoming"
      });
    }

    for (const a of day.alarms) {
      items.push({
        id: `reader-alarm-${a.id}`,
        kind: "alarm",
        date: day.date,
        dayId: day.id,
        timeLabel: `${String(a.hour).padStart(2, "0")}:00`,
        triggerAt: a.triggerAt,
        title: "Alarm",
        message: a.message,
        wall: "notebook",
        status: a.triggerAt < now ? "past" : "upcoming"
      });
    }

    for (const appt of day.appointments) {
      items.push({
        id: `reader-appt-${appt.id}`,
        kind: "appointment",
        date: day.date,
        dayId: day.id,
        timeLabel: `${String(appt.hour).padStart(2, "0")}:00`,
        triggerAt: appt.triggerAt,
        title: appt.title || "Appointment",
        message: appt.title || "",
        wall: "appointments",
        status: appt.triggerAt < now ? "past" : "upcoming"
      });
    }
  }

  return items.sort((a, b) => a.triggerAt - b.triggerAt || a.date.localeCompare(b.date));
}

/**
 * @param {ReaderItem} item
 */
export function formatReaderRowMeta(item) {
  const icon = getTypeIcon(item.kind === "slot-note" ? "note" : item.kind);
  const when = formatNotificationTime(item.triggerAt);
  return { icon, when };
}
