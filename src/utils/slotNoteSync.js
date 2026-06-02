/**
 * Commit timeline slot notes into calendar state + localStorage.
 */
import {
  addThread,
  upsertNoteInThread,
  updateNote
} from "../calendar/calendarState.js";
import { saveNoteSlot } from "./storage.js";

/**
 * @param {import("../calendar/calendarState.js").CalendarState} state
 * @param {string} dateStr YYYY-MM-DD
 */
export function findDayByDateStr(state, dateStr) {
  return state?.days?.find((d) => d.date === dateStr) ?? null;
}

/**
 * @param {import("../calendar/calendarState.js").CalendarState} state
 * @param {string} dateStr
 * @param {string} time HH:MM
 * @param {string} text
 * @param {string} [threadId]
 */
export function commitSlotNote(state, dateStr, time, text, threadId) {
  const trimmed = String(text).trim();
  saveNoteSlot(dateStr, time, trimmed);

  const day = findDayByDateStr(state, dateStr);
  if (!day) {
    return { dayId: null, committed: Boolean(trimmed) };
  }

  let tid = threadId;
  if (!tid) {
    if (!day.threads.length) addThread(state, day.id);
    tid = day.threads[0]?.id ?? null;
  }
  if (!tid) return { dayId: day.id, committed: Boolean(trimmed) };

  const hour = Number(time.split(":")[0]);
  const label = time.endsWith(":30") ? `[${time}] ` : "";
  const body = trimmed ? `${label}${trimmed}` : "";

  const note = upsertNoteInThread(state, day.id, tid, hour, body);
  if (note) {
    updateNote(state, day.id, tid, note.id, { needsAttention: Boolean(trimmed) });
  }

  return { dayId: day.id, committed: Boolean(trimmed), note };
}
