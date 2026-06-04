/**
 * Inkling brain → WordWeaver timeline data (localStorage).
 */

import { emit } from "./EventBus.js";
import {
  loadSavedMonth,
  createCalendarStateFromSaved,
  createCalendarState
} from "../calendar/calendarState.js";

const STORAGE_KEY = "inkling-timeline-v1";

/** @typedef {{
 *   id: string,
 *   date: string,
 *   time: string,
 *   text: string,
 *   category: string,
 *   kind: string,
 *   alertId?: string,
 *   dayId?: string
 * }} CalendarEventRecord */

export const CategoryColors = {
  health: "#FF4D4D",
  study: "#4DFF88",
  work: "#FFD24D",
  personal: "#4DA6FF",
  creative: "#B84DFF",
  errands: "#FF884D",
  errand: "#FF884D",
  finance: "#4DFFD2",
  appointment: "#FF4DA6",
  deadline: "#FF3333",
  reminder: "#66CCFF",
  alarm: "#FF66AA",
  default: "#94A3B8"
};

/** @typedef {{
 *   id: string,
 *   time: string,
 *   label: string,
 *   text: string,
 *   category?: string,
 *   timeBucket?: string,
 *   color?: string,
 *   fontSize?: number,
 *   weight?: "normal" | "bold",
 *   alertId?: string,
 *   date?: string
 * }} TimelineEntryRecord */

const CATEGORY_COLORS = {
  health: "#FF7070",
  study: "#6DFFB0",
  work: "#FFE566",
  personal: "#C87AFF",
  creative: "#7DE8FF",
  errand: "#FFFFFF",
  default: "#F5FAFF"
};

/**
 * @param {string | undefined} category
 * @returns {string}
 */
export function getCategoryColor(category) {
  const key = String(category ?? "default").toLowerCase().trim();
  if (key === "errands" || key === "errand") return CategoryColors.errands;
  return CategoryColors[key] ?? CategoryColors.default;
}

/** Chronological bucket order for the Depth Staircase (9 / 12 / 3 day rhythm). */
export const BUCKET_ORDER = [
  "Late Night",
  "Dawn",
  "Morning",
  "Noon",
  "Afternoon",
  "Evening",
  "Night"
];

/**
 * Clock time for 3D timestamp labels (e.g. "09:30"), never bucket names.
 * @param {string} timeString
 * @returns {string}
 */
export function formatTimelineDisplayTime(timeString) {
  const raw = String(timeString ?? "").trim();
  if (raw.includes("T")) {
    const part = raw.split("T")[1]?.slice(0, 5);
    if (part && /^\d{1,2}:\d{2}/.test(part)) return part;
  }
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  }
  return raw || "00:00";
}

export function parseTimeMinutes(timeString) {
  const raw = String(timeString ?? "").trim();
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return 0;
}

/**
 * @param {string} timeString
 * @returns {"Morning"|"Noon"|"Afternoon"|"Evening"|"Night"|"Late Night"|"Dawn"}
 */
export function classifyTimeBucket(timeString) {
  const minutes = parseTimeMinutes(timeString);
  if (minutes >= 0 && minutes <= 179) return "Late Night";
  if (minutes >= 180 && minutes <= 359) return "Dawn";
  if (minutes >= 360 && minutes <= 719) return "Morning";
  if (minutes === 720) return "Noon";
  if (minutes >= 721 && minutes <= 1079) return "Afternoon";
  if (minutes >= 1080 && minutes <= 1259) return "Evening";
  if (minutes >= 1260 && minutes <= 1439) return "Night";
  return "Morning";
}

/**
 * @param {TimelineEntryRecord[]} entries
 * @returns {TimelineEntryRecord[]}
 */
export function sortTimelineForDisplay(entries) {
  const bucketIndex = (entry) => {
    const bucket = entry.timeBucket ?? classifyTimeBucket(entry.time);
    const idx = BUCKET_ORDER.indexOf(bucket);
    return idx >= 0 ? idx : BUCKET_ORDER.length;
  };
  return [...entries].sort((a, b) => {
    const ba = bucketIndex(a);
    const bb = bucketIndex(b);
    if (ba !== bb) return ba - bb;
    return parseTimeMinutes(a.time) - parseTimeMinutes(b.time);
  });
}

const HAS_USER_NOTES_KEY = "hasUserNotes";

export const starterNotes = [
  { time: "08:00", text: "Wake up and plan the day", category: "personal" },
  { time: "09:30", text: "Deep work block", category: "work" },
  { time: "12:00", text: "Lunch and reset", category: "personal" },
  { time: "15:00", text: "Meetings and notes", category: "work" },
  { time: "21:00", text: "Reflect and wind down", category: "health" }
];

/**
 * @returns {{ time: string, text: string, category: string, date?: string }[]}
 */
export function loadUserNotes() {
  return loadTimeline().map((e) => ({
    time: e.time,
    text: e.text,
    category: e.category === "default" ? "personal" : e.category,
    date: e.date
  }));
}

/**
 * Starter samples until the user saves their first note.
 * @returns {{ time: string, text: string, category: string }[]}
 */
export function getInitialNotes() {
  try {
    if (localStorage.getItem(HAS_USER_NOTES_KEY)) return loadUserNotes();
  } catch {
    /* ignore */
  }
  return [...starterNotes];
}

/**
 * @returns {TimelineEntryRecord[]}
 */
function buildStarterTimelineEntries() {
  const today = todayIsoDate();
  return starterNotes.map((n, i) =>
    normalizeEntry(
      {
        id: `starter-${i}`,
        time: n.time,
        text: n.text,
        category: n.category,
        label: "Note",
        date: today
      },
      `starter-${i}`
    )
  );
}

export function markUserNotesStarted() {
  try {
    localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  } catch {
    /* ignore */
  }
}

/**
 * @param {Partial<TimelineEntryRecord>} raw
 * @param {string} id
 * @returns {TimelineEntryRecord}
 */
function normalizeEntry(raw, id) {
  const time = String(raw.time ?? "09:00");
  const timeBucket = classifyTimeBucket(time);
  const label = String(raw.label ?? "").trim() || "Note";
  const category = String(raw.category ?? "default").toLowerCase().trim() || "default";
  return {
    id: String(id),
    time,
    label,
    text: String(raw.text ?? "").trim(),
    category,
    timeBucket,
    color: raw.color ? String(raw.color) : "#e2e8f0",
    fontSize: Number.isFinite(raw.fontSize) ? Number(raw.fontSize) : 0.26,
    weight: raw.weight === "bold" ? "bold" : "normal",
    alertId: raw.alertId ? String(raw.alertId) : undefined,
    date: raw.date ? String(raw.date) : undefined
  };
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStore(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn("[timelineModel] save failed", err);
  }
}

/**
 * @returns {TimelineEntryRecord[]}
 */
export function loadTimeline() {
  const stored = readStore();
  if (stored?.length) {
    return sortTimelineForDisplay(
      stored.map((e, i) => normalizeEntry(e, e.id ?? `entry-${i}`))
    );
  }
  try {
    if (localStorage.getItem(HAS_USER_NOTES_KEY)) return [];
  } catch {
    /* ignore */
  }
  return sortTimelineForDisplay(buildStarterTimelineEntries());
}

/**
 * @param {TimelineEntryRecord[]} entries
 * @returns {TimelineEntryRecord[]}
 */
export function saveTimeline(entries) {
  const normalized = sortTimelineForDisplay(
    entries.map((e, i) => normalizeEntry(e, e.id ?? `entry-${i}`))
  );
  writeStore(normalized);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("timelineUpdated"));
  }
  return normalized;
}

function nextId() {
  return `tw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {{
 *   time: string,
 *   label?: string,
 *   text: string,
 *   color?: string,
 *   fontSize?: number,
 *   weight?: "normal" | "bold"
 * }} fields
 * @returns {TimelineEntryRecord}
 */
export function addTimelineEntry(fields) {
  const entries = loadTimeline();
  const id = nextId();
  const entry = normalizeEntry(
    {
      id,
      ...fields
    },
    id
  );
  entries.push(entry);
  markUserNotesStarted();
  saveTimeline(entries);
  return entry;
}

/**
 * Lightweight category guess from note text (optional NLP).
 * @param {string} text
 * @returns {string}
 */
export function classifyText(text) {
  const s = String(text ?? "").toLowerCase();
  if (/gym|doctor|health|workout|sleep|meal|lunch|dinner|breakfast/.test(s)) return "health";
  if (/study|class|homework|learn|exam|read|course/.test(s)) return "study";
  if (/work|meeting|office|project|deadline|email|call/.test(s)) return "work";
  if (/shop|errand|store|pickup|grocer|bank|mail/.test(s)) return "errand";
  if (/paint|write|music|design|creative|art|draw/.test(s)) return "creative";
  if (/family|friend|party|home|personal|relax/.test(s)) return "personal";
  return "default";
}

/**
 * Save a timed note to the WordWeaver timeline and refresh the 3D view.
 * @param {{ time: string, text: string, category?: string }} payload
 */
export function saveNoteToTimeline(payload) {
  const text = String(payload?.text ?? "").trim();
  const time = formatTimelineDisplayTime(payload?.time ?? "09:00");
  if (!text) return null;

  const category = payload?.category ?? classifyText(text);
  const entry = addTimelineEntry({
    time,
    text,
    category,
    date: payload?.date ?? todayIsoDate()
  });

  void import("../calendar/alerts/alertsModel.js")
    .then(({ createAlertFromTimelineEntry }) => createAlertFromTimelineEntry(entry))
    .then((alert) => {
      if (alert?.id) {
        updateTimelineEntry(entry.id, { alertId: alert.id });
        emit("timelineUpdated", { entry: loadTimeline().find((e) => e.id === entry.id), entries: loadTimeline() });
      }
    })
    .catch((err) => console.warn("[timelineModel] alert attach failed", err));

  emit("timelineUpdated", { entry, entries: loadTimeline() });
  return entry;
}

/** Clear the time-entry note field after save. */
export function closeTimeEntryPanel() {
  const input = document.getElementById("noteInput");
  if (input) input.value = "";
  document.dispatchEvent(new CustomEvent("inkling:time-entry-closed"));
}

if (typeof document !== "undefined") {
  void import("../calendar/ui/TimePicker.js");
}


/**
 * @param {string} id
 * @param {Partial<TimelineEntryRecord>} fields
 * @returns {TimelineEntryRecord | null}
 */
export function updateTimelineEntry(id, fields) {
  const entries = loadTimeline();
  const index = entries.findIndex((e) => e.id === id);
  if (index < 0) return null;
  entries[index] = normalizeEntry({ ...entries[index], ...fields, id }, id);
  saveTimeline(entries);
  return entries[index];
}

/**
 * @returns {string}
 */
export function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * @param {string} iso
 * @returns {Date}
 */
export function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * @param {Date} d
 * @returns {string}
 */
export function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Monday 00:00 of the week containing ref.
 * @param {Date} [ref]
 * @returns {string}
 */
export function getWeekStartMonday(ref = new Date()) {
  const d = new Date(ref);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return isoFromDate(d);
}

/**
 * @param {number} hour
 * @returns {string}
 */
function hourToTimeString(hour) {
  return `${String(Number(hour)).padStart(2, "0")}:00`;
}

/**
 * @param {string} dateIso
 * @param {import("../calendar/calendarState.js").DayNode} day
 * @returns {CalendarEventRecord[]}
 */
function eventsFromDayNode(dateIso, day) {
  /** @type {CalendarEventRecord[]} */
  const list = [];

  for (const ap of day.appointments ?? []) {
    list.push({
      id: ap.id,
      date: dateIso,
      time: hourToTimeString(ap.hour),
      text: ap.title + (ap.description ? ` — ${ap.description}` : ""),
      category: "appointment",
      kind: "appointment",
      dayId: day.id
    });
  }
  for (const r of day.reminders ?? []) {
    list.push({
      id: r.id,
      date: dateIso,
      time: hourToTimeString(r.hour),
      text: r.message,
      category: "reminder",
      kind: "reminder",
      dayId: day.id
    });
  }
  for (const a of day.alarms ?? []) {
    list.push({
      id: a.id,
      date: dateIso,
      time: hourToTimeString(a.hour),
      text: a.message,
      category: "alarm",
      kind: "alarm",
      dayId: day.id
    });
  }
  for (const thread of day.threads ?? []) {
    for (const note of thread.notes ?? []) {
      list.push({
        id: note.id,
        date: dateIso,
        time: hourToTimeString(note.hour),
        text: note.text,
        category: classifyText(note.text),
        kind: "note",
        dayId: day.id
      });
    }
  }
  return list;
}

/**
 * @param {string} dateIso
 * @returns {CalendarEventRecord[]}
 */
function getEventsForDate(dateIso) {
  /** @type {CalendarEventRecord[]} */
  const list = [];
  const today = todayIsoDate();

  for (const entry of loadTimeline()) {
    const entryDate = entry.date ?? today;
    if (entryDate !== dateIso) continue;
    list.push({
      id: entry.id,
      date: entryDate,
      time: formatTimelineDisplayTime(entry.time),
      text: entry.text || entry.label,
      category: entry.category === "default" ? "personal" : entry.category,
      kind: "timeline",
      alertId: entry.alertId
    });
  }

  const [y, m] = dateIso.split("-").map(Number);
  const saved = loadSavedMonth();
  const year = saved?.year ?? y;
  const month = saved?.month ?? m;
  const state =
    saved && (saved.year !== y || saved.month !== m)
      ? createCalendarState(y, m)
      : createCalendarStateFromSaved(year, month, saved?.dayDataByDate ?? {});

  const day = state.days.find((d) => d.date === dateIso);
  if (day) list.push(...eventsFromDayNode(dateIso, day));

  return list.sort(
    (a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time) || a.text.localeCompare(b.text)
  );
}

/**
 * @param {string} weekStartDate ISO Monday
 * @returns {CalendarEventRecord[]}
 */
export function getEventsForWeek(weekStartDate) {
  const start = parseIsoDate(weekStartDate);
  /** @type {CalendarEventRecord[]} */
  const all = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    all.push(...getEventsForDate(isoFromDate(d)));
  }
  return all;
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @returns {CalendarEventRecord[]}
 */
export function getEventsForMonth(year, month) {
  const last = new Date(year, month, 0).getDate();
  /** @type {CalendarEventRecord[]} */
  const all = [];
  for (let day = 1; day <= last; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    all.push(...getEventsForDate(iso));
  }
  return all;
}
