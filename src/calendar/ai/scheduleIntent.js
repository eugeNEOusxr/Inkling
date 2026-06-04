/**
 * Natural-language scheduling — integration layer (AI parsing comes later).
 *
 * Flow when implemented:
 *   user text → parseNaturalLanguageSchedule() → ScheduleIntent
 *   → applyScheduleIntent() → calendar state + localStorage
 *   → CalendarApp._onDataChange() refreshes walls, reader, notifications
 *
 * Example inputs (future):
 *   "Dentist next Tuesday at 3pm"
 *   "Jot down: call mom tomorrow 9:30"
 */

import {
  addAppointment,
  computeTriggerAt,
  persistCalendarState
} from "../calendarState.js";
import { commitSlotNote, findDayByDateStr } from "../../utils/slotNoteSync.js";

/**
 * @typedef {'note'|'appointment'} ScheduleIntentKind
 */

/**
 * Parsed target for one write action. LLM or rules should output ISO date + HH:MM.
 * @typedef {Object} ScheduleIntent
 * @property {ScheduleIntentKind} kind
 * @property {string} date YYYY-MM-DD
 * @property {string} time HH:MM (24h)
 * @property {string} text title or note body
 * @property {string} [description] appointment description
 */

/**
 * @typedef {Object} ApplyScheduleResult
 * @property {boolean} ok
 * @property {string} [dayId]
 * @property {string} [error]
 * @property {ScheduleIntent} intent
 */

/**
 * Apply a structured intent — single sync path for wall, reader, and calendars.
 * @param {import("../calendarState.js").CalendarState} state
 * @param {ScheduleIntent} intent
 * @returns {ApplyScheduleResult}
 */
export function applyScheduleIntent(state, intent) {
  const date = String(intent.date ?? "").trim();
  const time = normalizeTime(intent.time);
  const text = String(intent.text ?? "").trim();

  if (!date || !text) {
    return { ok: false, error: "date and text required", intent };
  }

  const day = findDayByDateStr(state, date);
  if (!day) {
    return { ok: false, error: `no day in calendar for ${date}`, intent };
  }

  const hour = Number(time.split(":")[0]);

  if (intent.kind === "appointment") {
    const triggerAt = computeTriggerAt(date, hour);
    addAppointment(state, day.id, {
      title: text,
      description: intent.description ?? "",
      hour,
      triggerAt
    });
  } else {
    commitSlotNote(state, date, time, text);
  }

  persistCalendarState(state);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("inkling:schedule-applied", {
        detail: { intent: { ...intent, date, time, text } }
      })
    );
  }

  return { ok: true, dayId: day.id, intent };
}

/**
 * Future: call LLM or local parser; return null if unrecognized.
 * @param {string} _utterance
 * @param {{ referenceDate?: Date, timezone?: string }} [_opts]
 * @returns {Promise<ScheduleIntent|null>}
 */
export async function parseNaturalLanguageSchedule(utterance, opts = {}) {
  const { parseInklingMessage } = await import("./inklingParser.js");
  const intent = parseInklingMessage(utterance, opts.referenceDate ?? new Date());
  if (intent.type !== "propose_schedule" || !intent.proposal) return null;
  const p = intent.proposal;
  return {
    kind: p.kind,
    date: p.date,
    time: p.time,
    text: p.text
  };
}

/**
 * @param {import("../CalendarApp.js").CalendarApp} app
 * @param {ScheduleIntent} intent
 */
export async function applyScheduleIntentAndRefresh(app, intent) {
  const result = applyScheduleIntent(app.state, intent);
  if (!result.ok) return result;

  app._onDataChange?.();

  const hour = String(Number(intent.time.split(":")[0]));
  if (app.activeWall !== "notebook") {
    await app.switchWall?.("notebook");
  }
  if (intent.kind === "appointment") {
    await app.openNotebookWriterPanel?.(result.dayId, hour, "appointments");
  } else {
    await app.openNotebookWriterPanel?.(result.dayId, hour);
  }

  return result;
}

/**
 * @param {string} time
 * @returns {string}
 */
function normalizeTime(time) {
  const raw = String(time ?? "09:00").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
