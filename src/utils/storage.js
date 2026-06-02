/**
 * Debounced localStorage helpers for NotebookCalender UI state.
 * Rollback: delete this file and remove imports from notebook-calendar/index.js
 */
import { scheduleCloudSync } from "../auth/cloudSync.js";

const PREFIX = "notebookcalender:";
const NOTES_KEY = `${PREFIX}notesByDate`;
const LAST_VIEW_KEY = `${PREFIX}lastView`;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const debounceTimers = new Map();

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string} key
 * @param {() => void} fn
 * @param {number} [ms]
 */
export function debouncedSave(key, fn, ms = 320) {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, ms)
  );
}

/**
 * @returns {Record<string, Record<string, string>>}
 */
export function getAllNotesByDate() {
  return readJson(NOTES_KEY, {});
}

/**
 * @param {string} date YYYY-MM-DD
 * @returns {Record<string, string>}
 */
export function getNotesForDate(date) {
  const all = getAllNotesByDate();
  return all[date] ?? {};
}

/**
 * @param {string} date
 * @param {Record<string, string>} slotNotes keyed by HH:MM
 */
export function saveNotesForDate(date, slotNotes) {
  debouncedSave(`notes:${date}`, () => {
    const all = getAllNotesByDate();
    all[date] = { ...slotNotes };
    writeJson(NOTES_KEY, all);
    scheduleCloudSync();
  });
}

/**
 * @param {string} date
 * @param {string} time HH:MM
 * @param {string} text
 */
export function saveNoteSlot(date, time, text) {
  const notes = getNotesForDate(date);
  if (text.trim()) notes[time] = text.trim();
  else delete notes[time];
  saveNotesForDate(date, notes);
}

/**
 * @returns {{ date?: string, time?: string, slotIndex?: number } | null}
 */
export function getLastView() {
  return readJson(LAST_VIEW_KEY, null);
}

/**
 * @param {{ date: string, time?: string, slotIndex?: number }} view
 */
export function saveLastView(view) {
  debouncedSave("lastView", () => writeJson(LAST_VIEW_KEY, view));
}
