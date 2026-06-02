import { segmentFromTime, createTimelineNode } from "../inkling-core/timelineNode.js";
import { getAllTimelineNodes, saveAllTimelineNodes } from "../inkling-core/timelineStorage.js";
import {
  getDayById,
  editAppointment,
  deleteAppointment,
  deleteReminder,
  deleteAlarm
} from "../calendar/calendarState.js";
import { getNotesForDate } from "../utils/storage.js";

/**
 * @typedef {{ dayId: string, itemType: 'appointment'|'reminder'|'alarm'|'note', itemId: string }} CalendarLink
 */

/**
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {string} dateStr
 * @returns {import('../inkling-core/timelineNode.js').TimelineNode[]}
 */
export function calendarItemsToNodes(state, dateStr) {
  const day = state.days.find((d) => d.date === dateStr);
  if (!day) return [];

  /** @type {import('../inkling-core/timelineNode.js').TimelineNode[]} */
  const nodes = [];

  for (const appt of day.appointments) {
    nodes.push(
      createTimelineNode({
        id: `ww-appt-${appt.id}`,
        date: dateStr,
        time: `${String(appt.hour).padStart(2, "0")}:00`,
        text: appt.title || appt.description || "Appointment",
        kind: "appointment",
        tags: ["work"],
        calendarLink: { dayId: day.id, itemType: "appointment", itemId: appt.id },
        dueAt: appt.triggerAt,
        importance: 0.85
      })
    );
  }

  for (const rem of day.reminders) {
    nodes.push(
      createTimelineNode({
        id: `ww-rem-${rem.id}`,
        date: dateStr,
        time: `${String(rem.hour).padStart(2, "0")}:00`,
        text: rem.message || "Reminder",
        kind: "note",
        tags: ["work"],
        calendarLink: { dayId: day.id, itemType: "reminder", itemId: rem.id },
        dueAt: rem.triggerAt,
        importance: 0.7
      })
    );
  }

  for (const alarm of day.alarms) {
    nodes.push(
      createTimelineNode({
        id: `ww-alarm-${alarm.id}`,
        date: dateStr,
        time: `${String(alarm.hour).padStart(2, "0")}:00`,
        text: alarm.message || "Alarm",
        kind: "note",
        tags: ["work"],
        calendarLink: { dayId: day.id, itemType: "alarm", itemId: alarm.id },
        dueAt: alarm.triggerAt,
        importance: 0.9
      })
    );
  }

  const slotNotes = getNotesForDate(dateStr);
  for (const [time, text] of Object.entries(slotNotes)) {
    if (!text?.trim()) continue;
    nodes.push(
      createTimelineNode({
        id: `ww-note-${dateStr}-${time}`,
        date: dateStr,
        time,
        text: text.trim(),
        kind: "note",
        calendarLink: { dayId: day.id, itemType: "note", itemId: `${dateStr}-${time}` }
      })
    );
  }

  return nodes;
}

/**
 * Merge authoritative calendar data into persisted weave nodes for a date.
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {string} dateStr
 */
export function syncCalendarDayToWeaver(state, dateStr) {
  const fromCalendar = calendarItemsToNodes(state, dateStr);
  const calendarIds = new Set(fromCalendar.map((n) => n.id));

  const all = getAllTimelineNodes();
  const manual = all.filter(
    (n) =>
      n.date === dateStr &&
      !n.calendarLink &&
      n.kind !== "insight"
  );
  const otherDays = all.filter((n) => n.date !== dateStr);
  const insights = all.filter((n) => n.date === dateStr && n.kind === "insight");

  const merged = [...otherDays, ...manual, ...fromCalendar, ...insights];
  const byId = new Map();
  for (const n of merged) {
    if (!byId.has(n.id) || n.calendarLink) byId.set(n.id, n);
  }
  saveAllTimelineNodes([...byId.values()]);
}

/**
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {string} dateStr
 * @param {import('../inkling-core/timelineNode.js').DaySegment} segment
 * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} [extraNodes]
 */
export function getWeaverNodesForSegment(state, dateStr, segment, extraNodes = []) {
  syncCalendarDayToWeaver(state, dateStr);
  const all = getAllTimelineNodes().filter((n) => n.date === dateStr && n.segment === segment);
  const ids = new Set(all.map((n) => n.id));
  for (const n of extraNodes) {
    if (!ids.has(n.id)) all.push(n);
  }
  return all.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

/**
 * Push weave text/time changes back to the calendar.
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 */
export function applyWeaverNodeToCalendar(state, node) {
  const link = node.calendarLink;
  if (!link) return false;

  const day = getDayById(state, link.dayId);
  if (!day) return false;

  const hour = Number(String(node.time || "09:00").split(":")[0]);

  if (link.itemType === "appointment") {
    const appt = day.appointments.find((a) => a.id === link.itemId);
    if (!appt) return false;
    editAppointment(state, link.dayId, link.itemId, {
      title: node.text,
      hour,
      triggerAt: node.dueAt ?? appt.triggerAt
    });
    return true;
  }

  if (link.itemType === "reminder") {
    const rem = day.reminders.find((r) => r.id === link.itemId);
    if (!rem) return false;
    rem.message = node.text;
    rem.hour = hour;
    if (node.dueAt) rem.triggerAt = node.dueAt;
    return true;
  }

  if (link.itemType === "alarm") {
    const alarm = day.alarms.find((a) => a.id === link.itemId);
    if (!alarm) return false;
    alarm.message = node.text;
    alarm.hour = hour;
    if (node.dueAt) alarm.triggerAt = node.dueAt;
    return true;
  }

  return false;
}

/**
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {{ alsoDeleteCalendar?: boolean, alsoDeleteWeaver?: boolean }} opts
 */
export function deleteLinkedRecords(state, node, opts = {}) {
  const link = node.calendarLink;
  const all = getAllTimelineNodes().filter((n) => n.id !== node.id);

  if (opts.alsoDeleteWeaver !== false) {
    saveAllTimelineNodes(all);
  }

  if (!link || opts.alsoDeleteCalendar === false) return;

  const day = getDayById(state, link.dayId);
  if (!day) return;

  if (link.itemType === "appointment") deleteAppointment(state, link.dayId, link.itemId);
  else if (link.itemType === "reminder") deleteReminder(state, link.dayId, link.itemId);
  else if (link.itemType === "alarm") deleteAlarm(state, link.dayId, link.itemId);
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {'calendar'|'weaver'|'both'|'cancel'} choice
 */
export function resolveDeleteChoice(state, node, choice) {
  if (choice === "cancel") return;
  if (choice === "weaver") {
    saveAllTimelineNodes(getAllTimelineNodes().filter((n) => n.id !== node.id));
    return;
  }
  if (choice === "calendar") {
    deleteLinkedRecords(state, node, { alsoDeleteWeaver: false, alsoDeleteCalendar: true });
    saveAllTimelineNodes(getAllTimelineNodes().filter((n) => n.id !== node.id));
    return;
  }
  if (choice === "both") {
    deleteLinkedRecords(state, node, { alsoDeleteWeaver: true, alsoDeleteCalendar: true });
  }
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @returns {Promise<'calendar'|'weaver'|'both'|'cancel'>}
 */
export function promptDeleteLinked(node) {
  if (!node.calendarLink) return Promise.resolve("weaver");
  const label = node.text?.slice(0, 40) || "this item";
  const msg =
    `"${label}" is linked to your calendar.\n\n` +
    `Delete only in WordWeaver, only on the calendar, or both?`;
  if (window.confirm(`${msg}\n\nOK = delete BOTH. Cancel = choose other.`)) {
    return Promise.resolve("both");
  }
  const choice = window.prompt(
    `Type: weaver | calendar | both | cancel`,
    "weaver"
  );
  const c = String(choice || "cancel").toLowerCase();
  if (c === "calendar" || c === "weaver" || c === "both") return Promise.resolve(c);
  return Promise.resolve("cancel");
}
