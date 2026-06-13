/**
 * Inkling brain → WordWeaver timeline data (localStorage).
 * Design contract: docs/master_spec_expanded.md (§3 Event model).
 *
 * Authoritative state: in-memory `_events` (§3.3).
 *
 * **Read federation (§3.2, Milestone 1.2):** timeline events live in `_events`;
 * calendar month appointments/notes live in `calendarState` / `loadSavedMonth()`.
 * Day reads merge both sources. Day-nodes are NOT written into `_events` until a
 * future unify — see `FEDERATION_READ_LAYER` below.
 */

import * as canonicalBus from "../utils/EventBus.js";
import { calendarRecordToUnifiedEvent, normalizeCategory } from "./timelineEventContract.js";
import {
  loadSavedMonth,
  createCalendarStateFromSaved,
  createCalendarState
} from "../calendar/calendarState.js";
import {
  getUpcomingAlerts as getAlertsEngineUpcoming,
  isAlertTriggered,
  SCHEDULE_HORIZON_MS
} from "../calendar/alerts/alertsModel.js";

export const STORAGE_KEY = "inkling-timeline-v1";
/** §3.4 — one-way latch: once true, starter never returns. */
export const HAS_USER_NOTES_KEY = "inkling-has-user-notes";
/** Legacy key (pre–Milestone 1.3); migrated once in initTimelineModel. */
export const LEGACY_HAS_USER_NOTES_KEY = "hasUserNotes";
const STARTER_ID_PREFIX = "starter-";

/** Master switch for the demo/sample data. Off → the app always starts blank
 *  (no seeded events) for every new browser/device. The generator below is kept
 *  intact so it can be re-enabled for demos. */
const SEED_STARTER_DATA = false;

/**
 * §9 Starter data & first-run flag (Milestone 1.3)
 * -----------------------------------------------
 * - Seed only when `inkling-timeline-v1` is **absent** and latch is false (not on empty `[]`).
 * - Starter rows use ids `starter-*`; removed explicitly on first real user write.
 * - `_seeding` suppresses latch + removal during bulk starter seed in init().
 * - Emits: `initialized` (once per init), `starterDataCleared` (first real create/import).
 * - Latch key migrated from legacy `"hasUserNotes"` → `inkling-has-user-notes`.
 * - Phase 6 TODO (§9.5): Inkling sample-view copy in `src/calendar/ai/AIBrain.js`.
 * - Future export (§8): filter `starter-*` ids — see TODO near buildStarterEventPartials.
 */
/** Parallel legacy store (src/data/timelineModel.js); reconciled via importLegacyWordweaverStoreIfNeeded. */
export const LEGACY_WORDWEAVER_STORAGE_KEY = "inkling:wordweaver-timeline-v1";

const STORAGE_WARN_BYTES = 4.5 * 1024 * 1024;
const STORAGE_FULL_BYTES = 4.9 * 1024 * 1024;

/** @typedef {import("./timelineEventContract.js").UnifiedTimelineEvent} UnifiedTimelineEvent */
/** @typedef {import("./timelineEventContract.js").EventType} EventType */
/** @typedef {import("./timelineEventContract.js").Category} Category */
/** @typedef {import("./timelineEventContract.js").Priority} Priority */

/**
 * @typedef {Object} WordWeaverRenderMeta
 * @property {string} [label]
 * @property {string} [timeBucket]
 * @property {string} [color]
 * @property {number} [fontSize]
 * @property {"normal"|"bold"} [weight]
 * @property {string} [alertId]
 * @property {string} [date]
 */

/** @typedef {UnifiedTimelineEvent & { _wwRender?: WordWeaverRenderMeta }} StoredTimelineEvent */

/** @type {StoredTimelineEvent[]} */
let _events = [];
let _initialized = false;
let _writing = false;
let _initInProgress = false;
/** True while bulk starter seed runs inside init (exempt from user latch). */
let _seeding = false;
/** In-memory one-way latch (storage cannot be cleared to false). */
let _userNotesLatchedMemory = false;
/** Debounce `storageWarning` until size drops below warn threshold (§3.3 / §13.2). */
let _storageWarningEmitted = false;
/** @type {"ok"|"warn"|"full"|null} Test-only override for storage guard (1.4.6). */
let __testStorageGuardOverride = null;

/** @type {number | null} Test clock override for getUpcomingAlerts. */
let __testNowMs = null;

/** @type {import("../calendar/calendarState.js").SavedMonthSnapshot | null} */
let __testSavedMonthFixture = null;

/** Test instrumentation (1.2.10). */
export const __testReadMetrics = { loadSavedMonthCalls: 0 };

/**
 * Secondary read layer: saved calendar month day-nodes (not in `_events`).
 * @type {"calendarState"}
 */
export const FEDERATION_READ_LAYER = "calendarState";

export class TimelineValidationError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "TimelineValidationError";
  }
}

/** @typedef {{
 *   id: string,
 *   date: string,
 *   time: string,
 *   text: string,
 *   title?: string,
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

/**
 * @param {string | undefined} category
 * @returns {string}
 */
export function getCategoryColor(category) {
  const key = String(category ?? "default").toLowerCase().trim();
  if (key === "errands" || key === "errand") return CategoryColors.errands;
  return CategoryColors[key] ?? CategoryColors.default;
}

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

/**
 * Declarative starter templates (offsets from seed-time "now").
 * @type {Array<{
 *   dayOffset: number,
 *   time: string,
 *   type: EventType,
 *   title: string,
 *   body: string,
 *   category: string,
 *   priority?: Priority,
 *   alertMinutesFromNow?: number
 * }>}
 */
// A deliberately busy, color-varied sample YEAR so the 3D calendar / WordWeaver
// layouts feel alive. Bodies contain category keywords (classifyText) → distinct
// sphere colors: health=red, study=green, work=yellow, personal=blue,
// creative=purple, errand=orange. ~550 events spread across the whole year are
// generated deterministically below; a small curated block keeps today/near-term
// human-readable and seeds the alerts bell.
//
// IMPORTANT: every body must contain a keyword for ITS OWN category and none for
// an earlier-checked one (classifyText order: health→study→work→errand→creative
// →personal). Audited accordingly — do not add stray "call"/"lunch"/"store" etc.

/** @type {Record<string,{ type: EventType, times: string[], items: { title: string, body: string }[] }>} */
const STARTER_CONTENT = {
  health: {
    type: "health",
    times: ["06:30", "07:00", "07:30", "08:00", "12:30", "18:00", "20:30"],
    items: [
      { title: "Morning workout", body: "Morning gym workout session." },
      { title: "Doctor checkup", body: "Doctor checkup appointment." },
      { title: "Healthy breakfast", body: "Healthy breakfast and a stretch." },
      { title: "Midday walk", body: "Lunch and a long walk outside." },
      { title: "Meal prep", body: "Dinner meal prep for the week." },
      { title: "Early night", body: "Wind down for an early sleep." },
      { title: "Yoga", body: "Yoga workout at the gym." },
      { title: "Dentist", body: "Doctor and dentist cleaning." },
      { title: "Evening run", body: "Evening run and a healthy meal." },
      { title: "Physio", body: "Physical therapy workout." }
    ]
  },
  study: {
    type: "study",
    times: ["09:00", "10:00", "11:00", "14:00", "16:00", "19:00", "20:00"],
    items: [
      { title: "Exam study", body: "Study for the final exam." },
      { title: "Reading", body: "Read a chapter for class." },
      { title: "Course module", body: "Online course module." },
      { title: "Homework", body: "Homework and review." },
      { title: "Language", body: "Learn a new language." },
      { title: "Library", body: "Library study session." },
      { title: "Exam prep", body: "Exam prep and notes." },
      { title: "Research", body: "Read research for the course." },
      { title: "Lecture", body: "Class lecture review." },
      { title: "Practice", body: "Practice exam questions." }
    ]
  },
  work: {
    type: "task",
    times: ["09:00", "09:30", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"],
    items: [
      { title: "Standup", body: "Team standup meeting." },
      { title: "Deadline", body: "Project deadline review." },
      { title: "Inbox", body: "Clear the inbox of email." },
      { title: "Client call", body: "Client call follow-up." },
      { title: "Planning", body: "Sprint planning meeting." },
      { title: "Report", body: "Quarterly report deadline." },
      { title: "1:1", body: "One on one at the office." },
      { title: "Proposal", body: "Work on the proposal." },
      { title: "Vendor", body: "Conference call with vendor." },
      { title: "Sync", body: "Project sync meeting." }
    ]
  },
  errand: {
    type: "task",
    times: ["10:00", "11:30", "12:00", "13:30", "15:00", "16:30", "17:30"],
    items: [
      { title: "Groceries", body: "Grocery store run." },
      { title: "Bank", body: "Bank deposit errand." },
      { title: "Pharmacy", body: "Pharmacy pickup." },
      { title: "Post", body: "Mail a package." },
      { title: "Supplies", body: "Shop for supplies." },
      { title: "Dry cleaning", body: "Dry cleaning pickup." },
      { title: "Hardware", body: "Hardware store trip." },
      { title: "Returns", body: "Return an order to the store." },
      { title: "Refill", body: "Grocery and pharmacy run." },
      { title: "Errands", body: "Errand around town." }
    ]
  },
  creative: {
    type: "creative",
    times: ["10:00", "14:00", "15:30", "18:00", "19:30", "21:00"],
    items: [
      { title: "Paint", body: "Paint studio session." },
      { title: "Write", body: "Write a short story." },
      { title: "Music", body: "Music practice." },
      { title: "Artwork", body: "Design new artwork." },
      { title: "Sketch", body: "Sketch and draw ideas." },
      { title: "Demo", body: "Record a music demo." },
      { title: "Journal", body: "Creative journaling." },
      { title: "Concept", body: "Draw concept art." },
      { title: "Story", body: "Write in the journal." },
      { title: "Poster", body: "Design a poster." }
    ]
  },
  personal: {
    type: "note",
    times: ["12:00", "17:00", "18:30", "19:00", "20:00", "21:00"],
    items: [
      { title: "Family", body: "Family time at home." },
      { title: "Coffee", body: "Coffee with a friend." },
      { title: "Birthday", body: "Birthday party." },
      { title: "Unwind", body: "Relax and unwind." },
      { title: "Movie", body: "Movie night at home." },
      { title: "Game night", body: "Game night with friends." },
      { title: "Admin", body: "Personal admin and budget." },
      { title: "Trip", body: "Weekend trip with friends." },
      { title: "Brunch", body: "Brunch with a friend." },
      { title: "Downtime", body: "Relax at home." }
    ]
  }
};

const STARTER_CAT_ORDER = ["health", "study", "work", "errand", "creative", "personal"];

/** Deterministic PRNG (mulberry32) so the demo year is identical every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a full year (~550) of varied starter events spread across day offsets
 * from today. Stable across loads (seeded). Skips offsets -1..1 (curated block).
 * @returns {Array<{ dayOffset:number, time:string, type:EventType, title:string, body:string, category:string, priority?:Priority, alertAtStart?:boolean }>}
 */
function buildStarterYearTemplates() {
  const out = [];
  const rng = mulberry32(0x1357a);
  for (let off = -163; off <= 201; off++) {
    if (off >= -1 && off <= 1) continue; // curated below
    const r = rng();
    const count = r < 0.12 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : r < 0.96 ? 3 : 4;
    for (let k = 0; k < count; k++) {
      const cat = STARTER_CAT_ORDER[Math.floor(rng() * STARTER_CAT_ORDER.length)];
      const pool = STARTER_CONTENT[cat];
      const item = pool.items[Math.floor(rng() * pool.items.length)];
      const time = pool.times[Math.floor(rng() * pool.times.length)];
      const isAlarm = rng() < 0.15;
      out.push({
        dayOffset: off,
        time,
        type: isAlarm ? "alert" : pool.type,
        title: item.title,
        body: item.body,
        category: cat,
        priority: /** @type {Priority} */ (1 + Math.floor(rng() * 3)),
        ...(isAlarm ? { alertAtStart: true } : {})
      });
    }
  }
  return out;
}

const STARTER_EVENT_TEMPLATES = [
  // Today — busy (differentiated notes → colored spheres + connecting lines)
  { dayOffset: 0, time: "07:00", type: "health", title: "Morning workout", body: "Gym session and a healthy breakfast.", category: "health", priority: 1 },
  { dayOffset: 0, time: "10:00", type: "appointment", title: "Team meeting", body: "Project standup meeting at the office.", category: "work", priority: 2 },
  { dayOffset: 0, time: "17:30", type: "task", title: "Grocery run", body: "Grocery store pickup on the way home.", category: "errand", priority: 1 },
  // Tomorrow — busy
  { dayOffset: 1, time: "08:30", type: "study", title: "Exam prep", body: "Study for the course exam, read chapter 4.", category: "study", priority: 2 },
  { dayOffset: 1, time: "13:00", type: "creative", title: "Design draft", body: "Sketch and design the new layout art.", category: "creative", priority: 1 },
  { dayOffset: 1, time: "19:00", type: "note", title: "Family evening", body: "Relax at home with family.", category: "personal", priority: 1 },
  // Yesterday
  { dayOffset: -1, time: "07:30", type: "health", title: "Workout", body: "Gym workout and breakfast.", category: "health", priority: 1 },
  { dayOffset: -1, time: "15:00", type: "task", title: "Project work", body: "Work on the project and email the team.", category: "work", priority: 2 },
  // Alert demo (keep — seeds the alerts bell)
  {
    dayOffset: 0,
    time: "16:00",
    type: "alert",
    title: "Focus check-in",
    body: "Sample reminder — add your own events anytime.",
    category: "reminder",
    priority: 2,
    alertMinutesFromNow: 90
  },
  // The full demo year (~550 events across all 12 months)
  ...buildStarterYearTemplates()
];

/** @deprecated Use buildStarterEventPartials for §3.1 shape; kept for display-only callers. */
export const starterNotes = STARTER_EVENT_TEMPLATES.map((t) => ({
  time: t.time,
  text: t.body,
  category: t.category
}));

/**
 * Build 8–12 validate-passing starter partial Events relative to `now`.
 * @param {number} [now]
 * @returns {Partial<StoredTimelineEvent>[]}
 */
export function buildStarterEventPartials(now = readNowMs()) {
  return STARTER_EVENT_TEMPLATES.map((t, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + t.dayOffset);
    const dateIso = isoFromDate(d);
    const startTime = buildStartTimeIso(dateIso, t.time);
    /** @type {{ time: string, kind: "popup"|"sound" }[]} */
    const alerts = [];
    if (t.alertMinutesFromNow != null) {
      alerts.push({
        time: new Date(now + t.alertMinutesFromNow * 60_000).toISOString(),
        kind: "popup"
      });
    }
    if (t.alertAtStart) {
      alerts.push({ time: startTime, kind: "popup" });
    }
    return {
      id: `${STARTER_ID_PREFIX}${i}`,
      type: t.type,
      title: t.title,
      body: t.body,
      startTime,
      endTime: null,
      category: normalizeCategory(t.category),
      priority: /** @type {Priority} */ (t.priority ?? 1),
      alerts,
      _wwRender: { label: t.title, date: dateIso }
    };
  });
}

// TODO(§8 export): when backup/export exists, strip any remaining `starter-*` events from exports.

/**
 * @param {string} id
 * @returns {boolean}
 */
function isStarterEventId(id) {
  return String(id).startsWith(STARTER_ID_PREFIX);
}

/**
 * @returns {boolean}
 */
function hasStarterEvents() {
  return _events.some((e) => isStarterEventId(e.id));
}

/**
 * @returns {boolean}
 */
function isTimelineStorageAbsent() {
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return true;
  }
}

/**
 * @returns {boolean}
 */
function hasUserNotesLatch() {
  if (_userNotesLatchedMemory) return true;
  try {
    return localStorage.getItem(HAS_USER_NOTES_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * One-time migration: legacy `hasUserNotes` → `inkling-has-user-notes` (before seed check).
 */
function migrateHasUserNotesFlag() {
  try {
    if (localStorage.getItem(HAS_USER_NOTES_KEY) != null) return;
    const legacy = localStorage.getItem(LEGACY_HAS_USER_NOTES_KEY);
    if (legacy === "true") {
      localStorage.setItem(HAS_USER_NOTES_KEY, "true");
    }
    if (legacy != null) {
      localStorage.removeItem(LEGACY_HAS_USER_NOTES_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * If real (non-starter) events exist but the latch is missing, set it (self-heal).
 */
function selfHealUserNotesFlag() {
  if (hasUserNotesLatch()) return;
  if (_events.some((e) => !isStarterEventId(e.id))) {
    markUserNotesStarted();
  }
}

/**
 * @returns {boolean} whether any starter rows were removed
 */
function removeStarterEventsFromStore() {
  const before = _events.length;
  _events = _events.filter((e) => !isStarterEventId(e.id));
  return _events.length < before;
}

/**
 * First real user write: drop starter rows, set latch (one persist with caller's mutation).
 * @returns {boolean}
 */
function applyFirstRealUserWriteSideEffects() {
  if (_seeding || hasUserNotesLatch()) return false;
  const hadStarter = hasStarterEvents();
  if (hadStarter) removeStarterEventsFromStore();
  markUserNotesStarted();
  return hadStarter;
}

/** @returns {boolean} */
export function __testHasUserNotesLatch() {
  return hasUserNotesLatch();
}

// --- Time / ID helpers ---

/**
 * @returns {string}
 */
function newEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tw-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} dateIso YYYY-MM-DD
 * @param {string} timeClock HH:MM or ISO fragment
 * @returns {string}
 */
export function buildStartTimeIso(dateIso, timeClock) {
  const date = String(dateIso ?? todayIsoDate()).trim();
  const raw = String(timeClock ?? "09:00").trim();
  if (raw.includes("T") && Number.isFinite(Date.parse(raw))) {
    return new Date(raw).toISOString();
  }
  const clock = formatTimelineDisplayTime(raw);
  const local = new Date(`${date}T${clock}:00`);
  if (Number.isFinite(local.getTime())) return local.toISOString();
  return new Date(`${date}T09:00:00`).toISOString();
}

/**
 * @param {string} startTimeIso
 * @returns {{ dateIso: string, clock: string }}
 */
function splitStartTime(startTimeIso) {
  const d = new Date(startTimeIso);
  if (!Number.isFinite(d.getTime())) {
    const today = todayIsoDate();
    return { dateIso: today, clock: "09:00" };
  }
  const dateIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { dateIso, clock };
}

/**
 * @param {StoredTimelineEvent[]} events
 * @returns {StoredTimelineEvent[]}
 */
function sortEventsByStartTime(events) {
  return [...events].sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id)
  );
}

// --- Persistence (§3.3 / §3.4 / Milestone 1.4) ---
//
// Storage contract (do not weaken):
// - Thresholds: STORAGE_WARN_BYTES (4.5MB) → `storageWarning { usedBytes }`, write proceeds;
//   STORAGE_FULL_BYTES (4.9MB) → reject before setItem, `storageFull`, rollback (no success emit).
// - Byte estimate: TextEncoder on the same JSON string passed to setItem (no double-serialize).
// - Persist-before-emit: mutations call persistOrRollback() before §13.2 success emits.
// - Rollback: snapshot _events + latch (incl. starter removal / markUserNotesStarted) before any
//   mutation; on failed/blocked save restore both — memory must never hold unpersisted state.
// - QuotaExceededError backstop: try/catch on setItem also returns false + storageFull (no silent warn).
// - `_writing`: while true, saveToStorage() is a no-op (returns true); bulk/seed persist once at end.
// - Single writer for event data key `inkling-timeline-v1` only (§10 / 1.4.8). Federation (own keys):
//   `src/data/timelineModel.js` → inkling:wordweaver-timeline-v1;
//   `src/calendar/alerts/alertsModel.js` → inkling-alerts-v1;
//   `src/inkling-core/timelineStorage.js`; `calendarState` saved-month day-nodes.
//   Other localStorage callers (mode, theme, auth, …) are allowed. CI: scripts/check-inkling-timeline-v1-writer.mjs
//
// Phase 10 TODO (§30): post-persist cloud sync should subscribe to §13.2 mutation emits after a
// successful write here — align with src/auth/cloudSync.js and src/wordweaver/wordweaverCloudSync.js;
// never bypass this model or write inkling-timeline-v1 directly.

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
      console.warn("[timelineModel] corrupt storage, treating as empty", err);
    }
    return null;
  }
}

/**
 * @param {string} json
 * @returns {number}
 */
function measureJsonBytes(json) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  if (typeof Blob !== "undefined") {
    try {
      return new Blob([json]).size;
    } catch {
      /* fall through */
    }
  }
  return json.length * 2;
}

/**
 * @param {unknown[]} events
 * @returns {{ json: string, bytes: number, status: "ok"|"warn"|"full" }}
 */
function serializeForStorage(events) {
  const json = JSON.stringify(events);
  const bytes = measureJsonBytes(json);
  if (__testStorageGuardOverride) {
    return { json, bytes, status: __testStorageGuardOverride };
  }
  let status = /** @type {"ok"|"warn"|"full"} */ ("ok");
  if (bytes >= STORAGE_FULL_BYTES) status = "full";
  else if (bytes >= STORAGE_WARN_BYTES) status = "warn";
  return { json, bytes, status };
}

function isTimelineStorageDevLogEnabled() {
  if (typeof process !== "undefined") {
    const env = process.env?.NODE_ENV;
    if (env === "production" || env === "test") return false;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD) return false;
  return true;
}

/**
 * @param {...unknown} args
 */
function devLogStorage(...args) {
  if (!isTimelineStorageDevLogEnabled()) return;
  console.warn("[timelineModel/storage]", ...args);
}

/**
 * @param {StoredTimelineEvent[]} events
 * @returns {boolean}
 */
function writeStore(events) {
  const { json, bytes, status } = serializeForStorage(events);

  if (status === "warn") {
    if (!_storageWarningEmitted) {
      canonicalBus.emit("storageWarning", { usedBytes: bytes });
      _storageWarningEmitted = true;
      devLogStorage("storageWarning", { usedBytes: bytes });
    }
  } else {
    _storageWarningEmitted = false;
  }

  if (status === "full") {
    canonicalBus.emit("storageFull", { usedBytes: bytes });
    devLogStorage("storageFull (estimate)", { usedBytes: bytes });
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, json);
    devLogStorage("persist ok", { usedBytes: bytes });
    return true;
  } catch (err) {
    canonicalBus.emit("storageFull", { usedBytes: bytes, error: String(err) });
    devLogStorage("storageFull (quota)", { usedBytes: bytes, err });
    return false;
  }
}

/**
 * @typedef {{ events: StoredTimelineEvent[], latchedMemory: boolean, latchInStorage: boolean }} PersistSnapshot
 */

/**
 * @param {StoredTimelineEvent[]} events
 * @returns {StoredTimelineEvent[]}
 */
function cloneEventsForSnapshot(events) {
  return events.map((e) => ({
    ...e,
    alerts: [...(e.alerts ?? [])],
    _wwRender: e._wwRender ? { ...e._wwRender } : undefined
  }));
}

/**
 * @returns {PersistSnapshot}
 */
function capturePersistSnapshot() {
  let latchInStorage = false;
  try {
    latchInStorage = localStorage.getItem(HAS_USER_NOTES_KEY) === "true";
  } catch {
    /* ignore */
  }
  return {
    events: cloneEventsForSnapshot(_events),
    latchedMemory: _userNotesLatchedMemory,
    latchInStorage
  };
}

/**
 * @param {PersistSnapshot} snap
 */
function restorePersistSnapshot(snap) {
  _events = cloneEventsForSnapshot(snap.events);
  _userNotesLatchedMemory = snap.latchedMemory;
  try {
    if (snap.latchInStorage) {
      localStorage.setItem(HAS_USER_NOTES_KEY, "true");
    } else {
      localStorage.removeItem(HAS_USER_NOTES_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {PersistSnapshot} snapshot
 * @returns {boolean}
 */
function persistOrRollback(snapshot) {
  const ok = _writing ? writeStore(_events) : saveToStorage();
  if (!ok) {
    restorePersistSnapshot(snapshot);
    devLogStorage("rollback", { eventCount: snapshot.events.length });
    return false;
  }
  return true;
}

/**
 * @returns {StoredTimelineEvent[]}
 */
function healCorruptStorageIfNeeded() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    JSON.parse(raw);
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, "[]");
    } catch {
      /* ignore */
    }
  }
}

function loadFromStorage() {
  const stored = readStore();
  if (!stored?.length) return [];
  /** @type {StoredTimelineEvent[]} */
  const migrated = [];
  for (let i = 0; i < stored.length; i++) {
    const event = migrateStoredRecord(stored[i], `entry-${i}`);
    if (event) migrated.push(event);
  }
  return sortEventsByStartTime(migrated);
}

/**
 * @returns {boolean}
 */
/**
 * Persist `_events`. When `_writing` is true (bulk/seed), intermediate calls are skipped;
 * the batch performs one explicit persist at the end.
 * @returns {boolean}
 */
function saveToStorage() {
  if (_writing) return true;
  return writeStore(_events);
}

// --- Migration (§3.1 / 1.1.2) ---

/**
 * @param {unknown} raw
 * @param {string} fallbackId
 * @returns {StoredTimelineEvent | null}
 */
function migrateStoredRecord(raw, fallbackId) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);

  if (typeof r.startTime === "string" && typeof r.title === "string") {
    return normalizeStoredEvent(/** @type {Partial<StoredTimelineEvent>} */ (r), String(r.id ?? fallbackId));
  }

  if (typeof r.time === "string" && (typeof r.text === "string" || typeof r.label === "string")) {
    return legacyTimelineEntryToEvent(
      /** @type {Partial<TimelineEntryRecord>} */ ({
        id: String(r.id ?? fallbackId),
        time: r.time,
        label: typeof r.label === "string" ? r.label : "Note",
        text: String(r.text ?? r.label ?? ""),
        category: typeof r.category === "string" ? r.category : "default",
        color: r.color,
        fontSize: r.fontSize,
        weight: r.weight,
        alertId: r.alertId,
        date: r.date,
        timeBucket: r.timeBucket
      }),
      String(r.id ?? fallbackId)
    );
  }

  if (typeof r.text === "string" && (typeof r.time === "string" || typeof r.date === "string")) {
    return calendarRecordToUnifiedEvent(
      /** @type {CalendarEventRecord} */ ({
        id: String(r.id ?? fallbackId),
        date: String(r.date ?? todayIsoDate()),
        time: String(r.time ?? "09:00"),
        text: String(r.text),
        category: String(r.category ?? "personal"),
        kind: String(r.kind ?? "note"),
        alertId: r.alertId ? String(r.alertId) : undefined
      })
    );
  }

  return null;
}

/**
 * @param {Partial<TimelineEntryRecord>} raw
 * @param {string} id
 * @returns {StoredTimelineEvent}
 */
function legacyTimelineEntryToEvent(raw, id) {
  const dateIso = raw.date ? String(raw.date) : todayIsoDate();
  const clock = formatTimelineDisplayTime(raw.time ?? "09:00");
  const startTime = buildStartTimeIso(dateIso, clock);
  const body = String(raw.text ?? "").trim();
  const title = String(raw.label ?? "").trim() || body.slice(0, 120) || "Note";
  const category = normalizeCategory(raw.category);
  const ts = startTime;

  /** @type {{ time: string, kind: "popup"|"sound" }[]} */
  const alerts = [];
  if (raw.alertId) {
    alerts.push({ time: startTime, kind: "popup" });
  }

  return {
    id: String(id),
    type: "note",
    title,
    body,
    startTime,
    endTime: null,
    category,
    priority: 1,
    alerts,
    createdAt: ts,
    updatedAt: ts,
    _wwRender: {
      label: String(raw.label ?? "").trim() || "Note",
      timeBucket: raw.timeBucket ?? classifyTimeBucket(clock),
      color: raw.color ? String(raw.color) : "#e2e8f0",
      fontSize: Number.isFinite(raw.fontSize) ? Number(raw.fontSize) : 0.26,
      weight: raw.weight === "bold" ? "bold" : "normal",
      alertId: raw.alertId ? String(raw.alertId) : undefined,
      date: dateIso
    }
  };
}

/**
 * @param {Partial<StoredTimelineEvent>} partial
 * @param {string} id
 * @returns {StoredTimelineEvent}
 */
function normalizeStoredEvent(partial, id) {
  const startTime = partial.startTime
    ? new Date(partial.startTime).toISOString()
    : buildStartTimeIso(todayIsoDate(), "09:00");
  const body = String(partial.body ?? "").trim();
  const title =
    partial.title !== undefined
      ? String(partial.title).trim()
      : body.slice(0, 120) || "Note";
  const createdAt = partial.createdAt ?? startTime;
  const updatedAt = partial.updatedAt ?? createdAt;

  return {
    id: String(id),
    type: partial.type ?? "note",
    title,
    body,
    startTime,
    endTime: partial.endTime ?? null,
    category: normalizeCategory(partial.category),
    priority: clampPriority(partial.priority),
    alerts: Array.isArray(partial.alerts) ? partial.alerts.map(normalizeAlert) : [],
    createdAt,
    updatedAt,
    aiMetadata: partial.aiMetadata,
    _wwRender: partial._wwRender
  };
}

/**
 * @param {unknown} value
 * @returns {Priority}
 */
function clampPriority(value) {
  const n = Number(value);
  if (n === 0 || n === 1 || n === 2 || n === 3) return /** @type {Priority} */ (n);
  return 1;
}

/**
 * @param {unknown} alert
 * @returns {{ time: string, kind: "popup"|"sound" }}
 */
function normalizeAlert(alert) {
  const a = /** @type {Record<string, unknown>} */ (alert ?? {});
  /** @type {{ time: string, kind: "popup"|"sound", triggered?: boolean, dismissed?: boolean }} */
  const out = {
    time: String(a.time ?? nowIso()),
    kind: a.kind === "sound" ? "sound" : "popup"
  };
  if (a.triggered === true) out.triggered = true;
  if (a.dismissed === true) out.dismissed = true;
  return out;
}

/**
 * @param {StoredTimelineEvent} event
 * @returns {TimelineEntryRecord}
 */
function eventToLegacyEntry(event) {
  const { dateIso, clock } = splitStartTime(event.startTime);
  const render = event._wwRender ?? {};
  return {
    id: event.id,
    time: clock,
    label: render.label ?? event.title,
    text: event.body,
    category: event.category === "personal" ? "default" : event.category,
    timeBucket: render.timeBucket ?? classifyTimeBucket(clock),
    color: render.color ?? "#e2e8f0",
    fontSize: render.fontSize ?? 0.26,
    weight: render.weight ?? "normal",
    alertId: render.alertId,
    date: render.date ?? dateIso
  };
}

/**
 * @param {StoredTimelineEvent} event
 * @returns {CalendarEventRecord}
 */
function eventToCalendarRecord(event) {
  const { dateIso, clock } = splitStartTime(event.startTime);
  const render = event._wwRender ?? {};
  return {
    id: event.id,
    date: render.date ?? dateIso,
    time: clock,
    text: event.body || event.title,
    title: event.title,
    category: event.category,
    kind: "timeline",
    alertId: render.alertId
  };
}

// --- Validation (§3.1 / §10) ---

/**
 * @param {Partial<StoredTimelineEvent>} event
 * @param {{ isCreate?: boolean }} [opts]
 */
function validateEvent(event, opts = {}) {
  const title = String(event.title ?? "").trim();
  if (!title) {
    throw new TimelineValidationError("Event title is required.");
  }
  if (title.length > 120) {
    throw new TimelineValidationError("Event title must be 120 characters or fewer.");
  }

  const startMs = Date.parse(String(event.startTime ?? ""));
  if (!Number.isFinite(startMs)) {
    throw new TimelineValidationError("Event startTime must be a valid ISO datetime.");
  }

  if (event.endTime != null && event.endTime !== "") {
    const endMs = Date.parse(String(event.endTime));
    if (!Number.isFinite(endMs)) {
      throw new TimelineValidationError("Event endTime must be a valid ISO datetime.");
    }
    if (endMs < startMs) {
      throw new TimelineValidationError("Event endTime must be after startTime.");
    }
  }

  const p = Number(event.priority);
  if (event.priority !== undefined && !(p === 0 || p === 1 || p === 2 || p === 3)) {
    throw new TimelineValidationError("Event priority must be 0, 1, 2, or 3.");
  }
}

/**
 * @param {Partial<StoredTimelineEvent>} partial
 * @param {{ isCreate?: boolean }} [opts]
 * @returns {StoredTimelineEvent}
 */
function buildEventFromPartial(partial, opts = {}) {
  const ts = nowIso();
  const dateIso = partial._wwRender?.date ?? todayIsoDate();
  const startTime = partial.startTime
    ? new Date(partial.startTime).toISOString()
    : buildStartTimeIso(dateIso, "09:00");

  const body = String(partial.body ?? "").trim();
  const title =
    partial.title !== undefined
      ? String(partial.title).trim()
      : body.slice(0, 120) || "Note";

  const event = normalizeStoredEvent(
    {
      id: partial.id,
      type: partial.type ?? "note",
      title,
      body,
      startTime: partial.startTime ?? startTime,
      endTime: partial.endTime ?? null,
      category: normalizeCategory(partial.category),
      priority: partial.priority ?? 1,
      alerts: partial.alerts ?? [],
      createdAt: opts.isCreate ? ts : partial.createdAt,
      updatedAt: ts,
      aiMetadata: partial.aiMetadata,
      _wwRender: partial._wwRender
    },
    String(partial.id ?? newEventId())
  );

  if (opts.isCreate) {
    event.createdAt = ts;
    event.updatedAt = ts;
  }

  validateEvent(event, opts);
  return event;
}

// --- Event bus (§13.2 / 1.1.9) ---

/**
 * @param {string} specEvent
 * @param {unknown} payload
 */
function emitMutation(specEvent, payload) {
  canonicalBus.emit(specEvent, payload);
  // TEMP DOM-compat shim (retire in Phase 4): legacy calendar/views/MonthView.js +
  // WeekView.js still re-render on a `document` "timelineUpdated" event. Keep this
  // until they migrate to the canonical bus (onTimelineDataChange). See 2.1.8.
  // Module-bus convergence is unaffected — this is only the DOM event, not wwEmit.
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("timelineUpdated", { detail: payload }));
  }
}

// --- Init (§3.3) ---

function ensureInitialized() {
  if (!_initialized && !_initInProgress) initTimelineModel();
}

/**
 * Bulk-insert starter events during init (no ensureInitialized re-entry).
 * @param {Partial<StoredTimelineEvent>[]} partials
 */
function seedStarterEventsInternal(partials) {
  if (!partials?.length) return;

  const snapshot = capturePersistSnapshot();
  _writing = true;
  try {
    /** @type {StoredTimelineEvent[]} */
    const built = [];
    for (const partial of partials) {
      const event = buildEventFromPartial(
        { ...partial, id: partial.id ?? `${STARTER_ID_PREFIX}${built.length}` },
        { isCreate: true }
      );
      event.createdAt = nowIso();
      event.updatedAt = event.createdAt;
      built.push(event);
    }
    _events = sortEventsByStartTime(built);
    if (!persistOrRollback(snapshot)) {
      throw new TimelineValidationError("Could not persist starter seed (storage full).");
    }
    emitMutation("eventsBulkCreated", { events: built, count: built.length, seed: true });
  } finally {
    _writing = false;
  }
}

/**
 * Idempotent boot: migrate flag → load storage → optional starter seed → emit `initialized`.
 */
export function initTimelineModel() {
  if (_initialized) return;

  _initInProgress = true;
  try {
    healCorruptStorageIfNeeded();
    migrateHasUserNotesFlag();

    const storageAbsent = isTimelineStorageAbsent();
    _events = loadFromStorage();
    selfHealUserNotesFlag();

    if (SEED_STARTER_DATA && storageAbsent && !hasUserNotesLatch()) {
      _seeding = true;
      try {
        seedStarterEventsInternal(buildStarterEventPartials());
      } catch (err) {
        console.warn("[timelineModel] starter seed failed", err);
        _events = [];
      } finally {
        _seeding = false;
      }
    } else {
      _events = sortEventsByStartTime(_events);
    }

    _initialized = true;
    emitMutation("initialized", { eventCount: _events.length });
  } finally {
    _initInProgress = false;
  }
}

/** Spec alias (§3.3). */
export const init = initTimelineModel;

// --- CRUD (§3.3) ---

/**
 * @param {Partial<StoredTimelineEvent>} partial
 * @returns {StoredTimelineEvent}
 */
export function createEvent(partial) {
  ensureInitialized();
  const snapshot = capturePersistSnapshot();
  const clearedStarter = applyFirstRealUserWriteSideEffects();

  const event = buildEventFromPartial(
    { ...partial, id: partial.id ?? newEventId() },
    { isCreate: true }
  );
  event.id = String(event.id);
  event.createdAt = nowIso();
  event.updatedAt = event.createdAt;

  _events = sortEventsByStartTime([..._events, event]);

  if (!persistOrRollback(snapshot)) {
    throw new TimelineValidationError("Could not persist event (storage full).");
  }

  if (clearedStarter) {
    emitMutation("starterDataCleared", { removedStarterIds: true });
  }
  emitMutation("eventCreated", event);
  return event;
}

/**
 * @param {string} id
 * @param {Partial<StoredTimelineEvent>} changes
 * @returns {StoredTimelineEvent}
 */
export function updateEvent(id, changes) {
  ensureInitialized();
  const index = _events.findIndex((e) => e.id === id);
  if (index < 0) {
    throw new TimelineValidationError(`Event not found: ${id}`);
  }

  const existing = _events[index];
  const merged = normalizeStoredEvent(
    {
      ...existing,
      ...changes,
      id: existing.id,
      createdAt: existing.createdAt
    },
    existing.id
  );
  merged.updatedAt = nowIso();

  validateEvent(merged);

  const snapshot = capturePersistSnapshot();
  const next = [..._events];
  next[index] = merged;
  _events = sortEventsByStartTime(next);

  if (!persistOrRollback(snapshot)) {
    throw new TimelineValidationError("Could not persist event update (storage full).");
  }

  emitMutation("eventUpdated", merged);
  return merged;
}

/**
 * @param {string} id
 */
export function deleteEvent(id) {
  ensureInitialized();
  const snapshot = capturePersistSnapshot();
  const before = _events.length;
  _events = _events.filter((e) => e.id !== id);
  if (_events.length === before) return;

  if (!persistOrRollback(snapshot)) return;

  emitMutation("eventDeleted", { id });
}

/**
 * @param {Partial<StoredTimelineEvent>[]} partials
 * @returns {StoredTimelineEvent[]}
 */
export function bulkCreateEvents(partials) {
  ensureInitialized();
  if (!partials?.length) return [];

  const snapshot = capturePersistSnapshot();
  const clearedStarter = applyFirstRealUserWriteSideEffects();

  _writing = true;
  try {
    /** @type {StoredTimelineEvent[]} */
    const built = [];
    for (const partial of partials) {
      built.push(
        buildEventFromPartial({ ...partial, id: partial.id ?? newEventId() }, { isCreate: true })
      );
    }

    for (const e of built) {
      e.createdAt = nowIso();
      e.updatedAt = e.createdAt;
    }

    _events = sortEventsByStartTime([..._events, ...built]);

    if (!persistOrRollback(snapshot)) {
      throw new TimelineValidationError("Bulk create failed (storage full).");
    }

    if (clearedStarter) {
      emitMutation("starterDataCleared", { removedStarterIds: true });
    }
    emitMutation("eventsBulkCreated", { events: built, count: built.length });
    return built;
  } finally {
    _writing = false;
  }
}

/**
 * One-time import from `inkling:wordweaver-timeline-v1` when canonical store is empty.
 */
export function importLegacyWordweaverStoreIfNeeded() {
  ensureInitialized();
  if (_events.length > 0) return;

  try {
    const raw = localStorage.getItem(LEGACY_WORDWEAVER_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return;

    const today = todayIsoDate();
    const partials = parsed.map((entry, i) => {
      const e = /** @type {Record<string, unknown>} */ (entry);
      return {
        type: /** @type {EventType} */ ("note"),
        title: String(e.text ?? "").slice(0, 120) || "Note",
        body: String(e.text ?? ""),
        startTime: buildStartTimeIso(today, String(e.time ?? "09:00")),
        _wwRender: {
          color: e.color,
          fontSize: Number(e.fontSize),
          weight: String(e.fontWeight ?? "").includes("7") ? "bold" : "normal",
          date: today
        }
      };
    });

    bulkCreateEvents(partials);
  } catch (err) {
    console.warn("[timelineModel] legacy wordweaver store import skipped", err);
  }
}

// --- Legacy adapters (keep importers working) ---

/**
 * @param {Partial<TimelineEntryRecord>} raw
 * @param {string} id
 * @returns {TimelineEntryRecord}
 */
function normalizeLegacyEntry(raw, id) {
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

/**
 * @returns {TimelineEntryRecord[]}
 */
export function loadTimeline() {
  ensureInitialized();
  return sortTimelineForDisplay(_events.map(eventToLegacyEntry));
}

/**
 * @param {TimelineEntryRecord[]} entries
 * @returns {TimelineEntryRecord[]}
 */
export function saveTimeline(entries) {
  ensureInitialized();
  const snapshot = capturePersistSnapshot();
  _events = sortEventsByStartTime(
    entries.map((e, i) => legacyTimelineEntryToEvent(normalizeLegacyEntry(e, e.id ?? `entry-${i}`), e.id ?? `entry-${i}`))
  );
  if (!persistOrRollback(snapshot)) {
    throw new TimelineValidationError("Could not persist timeline (storage full).");
  }
  emitMutation("eventsBulkCreated", {
    events: _events.map(eventToLegacyEntry),
    count: _events.length,
    legacyReplace: true
  });
  return loadTimeline();
}

/**
 * @param {{
 *   time: string,
 *   label?: string,
 *   text: string,
 *   color?: string,
 *   fontSize?: number,
 *   weight?: "normal" | "bold",
 *   date?: string,
 *   category?: string
 * }} fields
 * @returns {TimelineEntryRecord}
 */
export function addTimelineEntry(fields) {
  const dateIso = fields.date ?? todayIsoDate();
  const body = String(fields.text ?? "").trim();
  const event = createEvent({
    type: "note",
    title: String(fields.label ?? "").trim() || body.slice(0, 120) || "Note",
    body,
    startTime: buildStartTimeIso(dateIso, fields.time),
    category: normalizeCategory(fields.category),
    _wwRender: {
      label: fields.label,
      color: fields.color,
      fontSize: fields.fontSize,
      weight: fields.weight,
      date: dateIso,
      timeBucket: classifyTimeBucket(fields.time)
    }
  });
  return eventToLegacyEntry(event);
}

/**
 * One-way latch: user has created real content (§3.4 / §9.4). Never cleared.
 */
export function markUserNotesStarted() {
  _userNotesLatchedMemory = true;
  try {
    localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  } catch {
    /* ignore */
  }
}

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
 * @returns {{ time: string, text: string, category: string }[]}
 */
export function getInitialNotes() {
  if (hasUserNotesLatch()) return loadUserNotes();
  return starterNotes.map((n) => ({ ...n }));
}

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
 * @param {{ time: string, text: string, category?: string, date?: string }} payload
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
        emitMutation("eventUpdated", { id: entry.id, alertId: alert.id });
      }
    })
    .catch((err) => console.warn("[timelineModel] alert attach failed", err));

  return entry;
}

export function closeTimeEntryPanel() {
  const input = document.getElementById("noteInput");
  if (input) input.value = "";
  document.dispatchEvent(new CustomEvent("inkling:time-entry-closed"));
}

/**
 * @param {string} id
 * @param {Partial<TimelineEntryRecord>} fields
 * @returns {TimelineEntryRecord | null}
 */
export function updateTimelineEntry(id, fields) {
  ensureInitialized();
  const existing = _events.find((e) => e.id === id);
  if (!existing) return null;

  try {
    const legacy = eventToLegacyEntry(existing);
    const mergedLegacy = normalizeLegacyEntry({ ...legacy, ...fields, id }, id);
    const partial = {
      title: mergedLegacy.label || mergedLegacy.text.slice(0, 120),
      body: mergedLegacy.text,
      startTime: buildStartTimeIso(mergedLegacy.date ?? todayIsoDate(), mergedLegacy.time),
      category: normalizeCategory(mergedLegacy.category),
      _wwRender: {
        ...existing._wwRender,
        label: mergedLegacy.label,
        timeBucket: mergedLegacy.timeBucket,
        color: mergedLegacy.color,
        fontSize: mergedLegacy.fontSize,
        weight: mergedLegacy.weight,
        alertId: mergedLegacy.alertId,
        date: mergedLegacy.date
      }
    };
    const updated = updateEvent(id, partial);
    return eventToLegacyEntry(updated);
  } catch (err) {
    if (err instanceof TimelineValidationError) {
      console.warn("[timelineModel] update rejected", err.message);
      return null;
    }
    throw err;
  }
}

export function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getWeekStartMonday(ref = new Date()) {
  const d = new Date(ref);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return isoFromDate(d);
}

function hourToTimeString(hour) {
  return `${String(Number(hour)).padStart(2, "0")}:00`;
}

/**
 * @param {string} dateIso YYYY-MM-DD
 * @returns {{ startMs: number, endMs: number }}
 */
function localDayBoundsMs(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return {
    startMs: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    endMs: new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
  };
}

/**
 * @param {StoredTimelineEvent} event
 * @returns {number}
 */
function parseEventStartMs(event) {
  return Date.parse(event.startTime);
}

/**
 * @param {StoredTimelineEvent} event
 * @param {string} dateIso
 * @returns {boolean}
 */
function eventInLocalDay(event, dateIso) {
  const ms = parseEventStartMs(event);
  if (!Number.isFinite(ms)) return false;
  const { startMs, endMs } = localDayBoundsMs(dateIso);
  return ms >= startMs && ms <= endMs;
}

/**
 * @param {StoredTimelineEvent} event
 * @param {number} rangeStartMs inclusive
 * @param {number} rangeEndMs inclusive
 * @returns {boolean}
 */
function eventInLocalRange(event, rangeStartMs, rangeEndMs) {
  const ms = parseEventStartMs(event);
  return Number.isFinite(ms) && ms >= rangeStartMs && ms <= rangeEndMs;
}

function readNowMs() {
  return __testNowMs ?? Date.now();
}

/**
 * @returns {import("../calendar/calendarState.js").SavedMonthSnapshot | null}
 */
function federationLoadSavedMonth() {
  __testReadMetrics.loadSavedMonthCalls += 1;
  if (__testSavedMonthFixture !== null) return __testSavedMonthFixture;
  return loadSavedMonth();
}

/**
 * @param {number} year
 * @param {number} month1Based 1–12
 * @param {import("../calendar/calendarState.js").SavedMonthSnapshot | null} [savedSnapshot]
 * @returns {Map<string, import("../calendar/calendarState.js").DayNode>}
 */
function loadFederationDayMap(year, month1Based, savedSnapshot = null) {
  const saved = savedSnapshot ?? federationLoadSavedMonth();
  const state =
    saved?.year === year && saved?.month === month1Based
      ? createCalendarStateFromSaved(year, month1Based, saved.dayDataByDate ?? {})
      : saved && (saved.year !== year || saved.month !== month1Based)
        ? createCalendarState(year, month1Based)
        : saved
          ? createCalendarStateFromSaved(year, month1Based, saved.dayDataByDate ?? {})
          : createCalendarState(year, month1Based);

  /** @type {Map<string, import("../calendar/calendarState.js").DayNode>} */
  const map = new Map();
  for (const day of state.days) {
    map.set(day.date, day);
  }
  return map;
}

/**
 * @param {CalendarEventRecord[]} list
 * @param {string} dateIso
 * @param {Map<string, import("../calendar/calendarState.js").DayNode>} dayMap
 */
function appendDayNodeEvents(list, dateIso, dayMap) {
  const day = dayMap.get(dateIso);
  if (day) list.push(...eventsFromDayNode(dateIso, day));
}

/**
 * @param {CalendarEventRecord[]} list
 * @returns {CalendarEventRecord[]}
 */
function sortCalendarRecords(list) {
  return [...list].sort(
    (a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time) || a.text.localeCompare(b.text)
  );
}

/**
 * @param {import("./timelineEventContract.js").UnifiedTimelineEvent[]} events
 * @returns {import("./timelineEventContract.js").UnifiedTimelineEvent[]}
 */
function sortUnifiedEvents(events) {
  return [...events].sort((a, b) => {
    const byTime = Date.parse(a.startTime) - Date.parse(b.startTime);
    if (byTime !== 0) return byTime;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.title.localeCompare(b.title);
  });
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
 * Timeline-only events for a date (authoritative `_events`; no day-node federation).
 * Uses local-time window over `startTime` (§3.2).
 *
 * @param {string} dateIso `YYYY-MM-DD` (spec §3.2 uses `Date`; callers pass ISO strings)
 * @returns {CalendarEventRecord[]} new array
 */
export function getTimelineEventsForDate(dateIso) {
  ensureInitialized();
  return sortCalendarRecords(
    _events.filter((e) => eventInLocalDay(e, dateIso)).map(eventToCalendarRecord)
  );
}

/**
 * Events for one calendar day (timeline + federated day-nodes).
 *
 * @param {string} dateIso `YYYY-MM-DD` local calendar date
 * @returns {CalendarEventRecord[]} new array
 */
export function getEventsForDate(dateIso) {
  ensureInitialized();
  /** @type {CalendarEventRecord[]} */
  const list = _events.filter((e) => eventInLocalDay(e, dateIso)).map(eventToCalendarRecord);

  const [y, m] = dateIso.split("-").map(Number);
  const dayMap = loadFederationDayMap(y, m);
  appendDayNodeEvents(list, dateIso, dayMap);

  return sortCalendarRecords(list);
}

/**
 * Same day as {@link getEventsForDate} using grid indices.
 *
 * **Month convention:** `monthIndex` is **0-based** (0 = January), matching
 * `WordWeaverScene`, 2D grids, and `Date.getMonth()`. Not 1-based.
 *
 * @param {number} year full year
 * @param {number} monthIndex 0–11
 * @param {number} dayIndex 1–31
 * @returns {CalendarEventRecord[]} new array
 */
export function getEventsForDay(year, monthIndex, dayIndex) {
  const month = monthIndex + 1;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(dayIndex).padStart(2, "0")}`;
  return getEventsForDate(iso);
}

/**
 * Events for the ISO week containing `weekStartDate` (Monday-start data week, §3.2).
 *
 * **Signature note:** spec lists `(year, isoWeek)`; this codebase uses the Monday
 * `YYYY-MM-DD` form produced by {@link getWeekStartMonday} (Week View / WeekGrid2D).
 *
 * @param {string} weekStartDate ISO date of Monday
 * @returns {CalendarEventRecord[]} new array
 */
export function getEventsForWeek(weekStartDate) {
  ensureInitialized();
  const start = parseIsoDate(weekStartDate);
  /** @type {string[]} */
  const dateIsos = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dateIsos.push(isoFromDate(d));
  }

  const rangeStartMs = localDayBoundsMs(dateIsos[0]).startMs;
  const rangeEndMs = localDayBoundsMs(dateIsos[6]).endMs;

  /** @type {CalendarEventRecord[]} */
  let list = _events
    .filter((e) => eventInLocalRange(e, rangeStartMs, rangeEndMs))
    .map(eventToCalendarRecord);

  /** @type {Map<string, Map<string, import("../calendar/calendarState.js").DayNode>>} */
  const dayMapsByMonth = new Map();
  for (const iso of dateIsos) {
    const [y, m] = iso.split("-").map(Number);
    const key = `${y}-${m}`;
    if (!dayMapsByMonth.has(key)) {
      dayMapsByMonth.set(key, loadFederationDayMap(y, m));
    }
    appendDayNodeEvents(list, iso, dayMapsByMonth.get(key));
  }

  return sortCalendarRecords(list);
}

/**
 * Events in a calendar month (1-based month, §3.2).
 *
 * @param {number} year
 * @param {number} month 1–12
 * @returns {CalendarEventRecord[]} new array
 */
export function getEventsForMonth(year, month) {
  ensureInitialized();
  const monthStartMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
  const monthEndMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();

  /** @type {CalendarEventRecord[]} */
  let list = _events
    .filter((e) => eventInLocalRange(e, monthStartMs, monthEndMs))
    .map(eventToCalendarRecord);

  const dayMap = loadFederationDayMap(year, month);
  const last = new Date(year, month, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    appendDayNodeEvents(list, iso, dayMap);
  }

  return sortCalendarRecords(list);
}

/**
 * Events in a calendar year (§3.2). Single pass over `_events` — not per-day.
 *
 * Federation: day-node data is only merged for the month currently in
 * `loadSavedMonth()` when that month is in the requested year.
 *
 * @param {number} year
 * @returns {CalendarEventRecord[]} new array
 */
export function getEventsForYear(year) {
  ensureInitialized();
  const yearStartMs = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const yearEndMs = new Date(year, 11, 31, 23, 59, 59, 999).getTime();

  /** @type {CalendarEventRecord[]} */
  let list = _events
    .filter((e) => eventInLocalRange(e, yearStartMs, yearEndMs))
    .map(eventToCalendarRecord);

  const saved = federationLoadSavedMonth();
  if (saved?.year === year) {
    const dayMap = loadFederationDayMap(year, saved.month, saved);
    for (const dateIso of dayMap.keys()) {
      appendDayNodeEvents(list, dateIso, dayMap);
    }
  }

  return sortCalendarRecords(list);
}

/**
 * Per-month + per-day note density for a year, computed in one pass over the
 * year's events. This is the data seam the 3D WordWeaver Calendar reads to drive
 * level-of-detail zoom, per-day glow/heat, and the golden "busy month" atom —
 * so the renderer never has to query the model per cell. Built on the tested
 * {@link getEventsForYear} (same federation behaviour: saved month merged).
 *
 * @param {number} year
 * @returns {{
 *   year: number,
 *   total: number,
 *   monthCounts: number[],
 *   dayCounts: Record<string, number>,
 *   busiestMonthIndex: number,
 *   maxMonthCount: number,
 *   maxDayCount: number
 * }} monthCounts is length 12 (index 0 = January); dayCounts keyed by ISO
 *    "YYYY-MM-DD"; busiestMonthIndex is 0-based (-1 when the year is empty).
 */
export function getYearTopology(year) {
  ensureInitialized();
  const records = getEventsForYear(year);

  const monthCounts = new Array(12).fill(0);
  /** @type {Record<string, number>} */
  const dayCounts = {};
  let maxDayCount = 0;

  for (const r of records) {
    const iso = r.date;
    if (typeof iso !== "string" || iso.length < 7) continue;
    const monthIndex = Number(iso.slice(5, 7)) - 1;
    if (monthIndex >= 0 && monthIndex < 12) monthCounts[monthIndex] += 1;
    const next = (dayCounts[iso] ?? 0) + 1;
    dayCounts[iso] = next;
    if (next > maxDayCount) maxDayCount = next;
  }

  let busiestMonthIndex = -1;
  let maxMonthCount = 0;
  for (let m = 0; m < 12; m++) {
    if (monthCounts[m] > maxMonthCount) {
      maxMonthCount = monthCounts[m];
      busiestMonthIndex = m;
    }
  }

  return {
    year,
    total: records.length,
    monthCounts,
    dayCounts,
    busiestMonthIndex,
    maxMonthCount,
    maxDayCount
  };
}

/**
 * @param {string} id
 * @returns {StoredTimelineEvent | null}
 */
export function getEventById(id) {
  ensureInitialized();
  const event = _events.find((e) => e.id === id);
  if (!event) return null;
  return {
    ...event,
    alerts: [...(event.alerts ?? [])],
    _wwRender: event._wwRender ? { ...event._wwRender } : undefined
  };
}

/**
 * Upcoming alerts — delegates to authoritative `alertsModel` (§7.2 / 2.2.2).
 * `Event.alerts[]` is optional; `inkling-alerts-v1` linked by `timelineEntryId` is canonical.
 *
 * @param {number} [withinMinutes=10080] window from `now` (default 7 days)
 * @param {number} [now] override clock (tests)
 * @returns {{ event: StoredTimelineEvent, alert: { time: string, kind: "popup"|"sound", triggered?: boolean, dismissed?: boolean }, triggerAt: number }[]} new array
 */
export function getUpcomingAlerts(withinMinutes = 7 * 24 * 60, now = readNowMs()) {
  ensureInitialized();
  const withinMs = Math.min(withinMinutes * 60 * 1000, SCHEDULE_HORIZON_MS);
  const rows = getAlertsEngineUpcoming(now, { withinMs });

  return rows.map(({ alert, triggerAt }) => {
    const linked = alert.timelineEntryId ? getEventById(alert.timelineEntryId) : null;
    const event =
      linked ??
      /** @type {StoredTimelineEvent} */ ({
        id: alert.timelineEntryId ?? alert.id,
        type: "note",
        title: alert.text,
        body: alert.text,
        startTime: new Date(triggerAt).toISOString(),
        endTime: null,
        category: alert.category,
        priority: alert.priority,
        alerts: [],
        createdAt: new Date(alert.createdAt).toISOString(),
        updatedAt: new Date(alert.createdAt).toISOString()
      });

    return {
      event,
      alert: {
        time: new Date(triggerAt).toISOString(),
        kind: alert.kind,
        triggered: isAlertTriggered(alert),
        dismissed: alert.dismissed
      },
      triggerAt
    };
  });
}

/**
 * Shared 2D/3D day read (§3.2 / §18) with stable ordering.
 *
 * @param {string} dateIso `YYYY-MM-DD`
 * @returns {import("./timelineEventContract.js").UnifiedTimelineEvent[]} new array
 */
export function getUnifiedEventsForDate(dateIso) {
  return sortUnifiedEvents(getEventsForDate(dateIso).map(calendarRecordToUnifiedEvent));
}

/**
 * @param {number} year
 * @param {number} monthIndex 0–11 (see {@link getEventsForDay})
 * @param {number} dayIndex 1–31
 * @returns {import("./timelineEventContract.js").UnifiedTimelineEvent[]} new array
 */
export function getUnifiedEventsForDay(year, monthIndex, dayIndex) {
  return sortUnifiedEvents(
    getEventsForDay(year, monthIndex, dayIndex).map(calendarRecordToUnifiedEvent)
  );
}

/**
 * Test-only reset (§1.1.10).
 */
export function __testResetTimelineModel() {
  _events = [];
  _initialized = false;
  _writing = false;
  _initInProgress = false;
  _seeding = false;
  _userNotesLatchedMemory = false;
  _storageWarningEmitted = false;
  __testStorageGuardOverride = null;
  __testNowMs = null;
  __testSavedMonthFixture = null;
  __testReadMetrics.loadSavedMonthCalls = 0;
}

/**
 * @param {"ok"|"warn"|"full"|null} status
 */
export function __testSetStorageGuardOverride(status) {
  __testStorageGuardOverride = status;
}

/**
 * @param {number | null} ms
 */
export function __testSetNowMs(ms) {
  __testNowMs = ms;
}

/**
 * @param {import("../calendar/calendarState.js").SavedMonthSnapshot | null} fixture
 */
export function __testSetSavedMonthFixture(fixture) {
  __testSavedMonthFixture = fixture;
}

/** @param {unknown} raw @param {string} fallbackId */
export function __testMigrateStoredRecord(raw, fallbackId) {
  return migrateStoredRecord(raw, fallbackId);
}

export { calendarRecordToUnifiedEvent } from "./timelineEventContract.js";
