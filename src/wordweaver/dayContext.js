import { segmentFromTime } from "../inkling-core/timelineNode.js";
import { buildDailySummary } from "./wordweaverDailyView.js";

/**
 * Compact day payload for LLM remarks API.
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {string} dateStr
 * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} [wovenNodes]
 */
export function buildDayContext(state, dateStr, wovenNodes = []) {
  const d = new Date(`${dateStr}T12:00:00`);
  const summary = state ? buildDailySummary(state, dateStr) : null;

  const items = wovenNodes
    .filter((n) => n.kind !== "insight")
    .map((n) => ({
      id: n.id,
      time: n.time,
      text: n.text,
      kind: n.kind,
      segment: n.segment || (n.time ? segmentFromTime(n.time) : "afternoon"),
      tags: n.tags,
      dueAt: n.dueAt,
      completed: n.completed
    }));

  return {
    date: dateStr,
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    items,
    summary: summary
      ? {
          appointmentCount: summary.appointments.length,
          reminderCount: summary.reminders.length,
          alarmCount: summary.alarms.length,
          noteCount: summary.noteCount
        }
      : null
  };
}
