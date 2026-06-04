/**
 * Design-contract types and adapters for the unified Event model
 * (see docs/master_spec_expanded.md §3).
 */

/**
 * @param {string} timeString
 * @returns {string}
 */
function formatTimelineDisplayTime(timeString) {
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

/** @typedef {"note"|"appointment"|"task"|"alert"} EventType */

/** @typedef {
 *   "study"|"work"|"health"|"finance"|"errands"|"creative"|"personal"|
 *   "appointment"|"deadline"|"reminder"
 * } Category */

/** @typedef {0|1|2|3} Priority */

/**
 * @typedef {Object} UnifiedTimelineEvent
 * @property {string} id
 * @property {EventType} type
 * @property {string} title
 * @property {string} body
 * @property {string} startTime ISO-8601
 * @property {string|null} endTime
 * @property {Category} category
 * @property {Priority} priority
 * @property {{ time: string, kind: "popup"|"sound" }[]} alerts
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {Object} [aiMetadata]
 */

/**
 * @param {string} category
 * @returns {Category}
 */
export function normalizeCategory(category) {
  const c = String(category ?? "personal").toLowerCase().trim();
  if (c === "errand") return "errands";
  if (c === "alarm") return "reminder";
  if (c === "default") return "personal";
  return /** @type {Category} */ (c);
}

/**
 * @param {string} kind
 * @returns {EventType}
 */
export function kindToEventType(kind) {
  const k = String(kind ?? "").toLowerCase();
  if (k === "appointment") return "appointment";
  if (k === "alarm" || k === "reminder") return "alert";
  if (k === "task") return "task";
  return "note";
}

/**
 * @param {string} priorityLabel
 * @returns {Priority}
 */
export function priorityLabelToNumber(priorityLabel) {
  if (priorityLabel === "high") return 3;
  if (priorityLabel === "medium") return 2;
  if (priorityLabel === "low") return 0;
  return 1;
}

/**
 * @param {import("./timelineModel.js").CalendarEventRecord & { title?: string }} rec
 * @returns {UnifiedTimelineEvent}
 */
export function calendarRecordToUnifiedEvent(rec) {
  const date = rec.date ?? "";
  const time = formatTimelineDisplayTime(rec.time ?? "09:00");
  const startTime = date.includes("T") ? date : `${date}T${time}:00`;
  const body = String(rec.text ?? "").trim();
  const title =
    String(rec.title ?? "").trim() || body.slice(0, 120) || "Event";
  const category = normalizeCategory(rec.category);

  /** @type {{ time: string, kind: "popup"|"sound" }[]} */
  const alerts = [];
  if (rec.alertId) {
    alerts.push({ time: startTime, kind: "popup" });
  }

  return {
    id: rec.id,
    type: kindToEventType(rec.kind),
    title,
    body,
    startTime,
    endTime: null,
    category,
    priority: 1,
    alerts,
    createdAt: startTime,
    updatedAt: startTime
  };
}
