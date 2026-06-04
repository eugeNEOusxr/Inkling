/**
 * Inkling brain → WordWeaver timeline data (localStorage).
 */

import { emit } from "./EventBus.js";

const STORAGE_KEY = "inkling-timeline-v1";

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
 *   alertId?: string
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
  return CATEGORY_COLORS[key] ?? CATEGORY_COLORS.default;
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

/** @type {TimelineEntryRecord[]} */
const DEFAULT_ENTRIES = [
  {
    id: "sample-1",
    time: "08:00",
    label: "Morning",
    category: "personal",
    text: "Wake up and plan the day",
    color: "#e2e8f0",
    fontSize: 0.26,
    weight: "bold"
  },
  {
    id: "sample-2",
    time: "09:30",
    label: "Focus",
    category: "work",
    text: "Deep work block",
    color: "#4ade80",
    fontSize: 0.26,
    weight: "bold"
  },
  {
    id: "sample-3",
    time: "12:00",
    label: "Midday",
    category: "health",
    text: "Lunch and reset",
    color: "#fbbf24",
    fontSize: 0.24,
    weight: "normal"
  },
  {
    id: "sample-4",
    time: "15:00",
    label: "Afternoon",
    category: "work",
    text: "Meetings and notes",
    color: "#38bdf8",
    fontSize: 0.25,
    weight: "normal"
  },
  {
    id: "sample-5",
    time: "21:00",
    label: "Evening",
    category: "personal",
    text: "Reflect and wind down",
    color: "#c4b5fd",
    fontSize: 0.24,
    weight: "normal"
  }
];

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
    alertId: raw.alertId ? String(raw.alertId) : undefined
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
  return sortTimelineForDisplay(DEFAULT_ENTRIES.map((e) => normalizeEntry(e, e.id)));
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
    category
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
