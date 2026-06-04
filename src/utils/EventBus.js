/**
 * Canonical application event bus (§13.1). Live path: `src/utils/EventBus.js`.
 * §28 Key File Map reconciled here (not `src/core/eventBus.js` — do not add that file).
 *
 * Topology (§2.4): UI → bus → core → bus → renderers. This module is a **leaf** (no imports).
 *
 * §13.3 subscription lifecycle — subscribe on mount, unsubscribe on unmount:
 * ```js
 * const dispose = on("eventCreated", handler);
 * // unmount: dispose();  // or off("eventCreated", handler) with the same fn reference
 * ```
 * Anonymous inline handlers cannot be `off`'d by reference — use the dispose return value.
 *
 * §13.2 naming (2.1.9):
 * - Past tense for facts: `eventCreated`, `initialized`, `starterDataCleared`
 * - Imperative for requests: `navigateTo`
 * - Use `initialized` (not roadmap `timelineInitialized`)
 * - `timelineUpdated` was a transitional shim (retired 2.1.8); not in the §13.2 catalog
 * - Extension: `eventsBulkCreated` (batch persist, Milestone 1.1.8)
 * - Catalog gap (Phase 3.3): `preferenceChanged` not yet in §13.2 — add when UIShell prefs land
 *
 * @typedef {Object} InitializedPayload
 * @property {number} eventCount
 *
 * @typedef {Object} EventDeletedPayload
 * @property {string} id
 *
 * @typedef {Object} StorageBytesPayload
 * @property {number} usedBytes
 *
 * @typedef {Object} DayFocusedPayload
 * @property {string} date ISO date
 *
 * @typedef {Object} WeekFocusedPayload
 * @property {string} weekStart ISO Monday week start
 *
 * @typedef {Object} MonthFocusedPayload
 * @property {number} year
 * @property {number} month 1–12
 *
 * @typedef {Object} ModeChangedPayload
 * @property {"2d"|"3d"} mode
 *
 * @typedef {Object} NavigateToPayload
 * @property {string} date
 * @property {"day"|"week"|"month"} level
 *
 * @typedef {Object} AlertTriggeredPayload
 * @property {unknown} event
 * @property {unknown} alert
 *
 * @typedef {Object} EventsBulkCreatedPayload
 * @property {unknown[]} events
 * @property {number} count
 * @property {boolean} [seed]
 * @property {boolean} [legacyReplace]
 *
 * §13.2 event catalog (payload shapes):
 * | Event | Payload |
 * |-------|---------|
 * | `initialized` | `{ eventCount }` |
 * | `eventCreated` | `Event` (timeline model record) |
 * | `eventUpdated` | `Event` |
 * | `eventDeleted` | `{ id }` |
 * | `starterDataCleared` | — (optional `{ removedStarterIds }`) |
 * | `storageWarning` | `{ usedBytes }` |
 * | `storageFull` | `{ usedBytes, error? }` |
 * | `dayFocused` | `{ date }` |
 * | `weekFocused` | `{ weekStart }` |
 * | `monthFocused` | `{ year, month }` |
 * | `modeChanged` | `{ mode }` |
 * | `navigateTo` | `{ date, level }` |
 * | `alertTriggered` | `{ event, alert }` |
 * | `alertsOpened` | — |
 * | `inklingOpened` | — |
 * | `inklingClosed` | — |
 * | `eventsBulkCreated` | `{ events, count, seed? }` (extension) |
 */

/** @type {Map<string, Set<(payload: unknown) => void>>} */
const listeners = new Map();

/** §19.5 silent internal error tracker (stub; telemetry may replace). */
/** @type {Array<{ event: string, message: string, at: number }>} */
const internalHandlerErrors = [];
const MAX_INTERNAL_ERRORS = 50;

/** §13.2 timeline mutations that should refresh timeline renderers. */
export const TIMELINE_DATA_EVENTS = [
  "initialized",
  "eventCreated",
  "eventUpdated",
  "eventDeleted",
  "eventsBulkCreated",
  "starterDataCleared"
];

function isEventBusDevLogEnabled() {
  if (typeof process !== "undefined") {
    const env = process.env?.NODE_ENV;
    if (env === "production" || env === "test") return false;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD) return false;
  return true;
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function summarizePayload(payload) {
  if (payload == null) return String(payload);
  if (typeof payload !== "object") return String(payload).slice(0, 80);
  const o = /** @type {Record<string, unknown>} */ (payload);
  const parts = [];
  if ("id" in o) parts.push(`id=${o.id}`);
  if ("eventCount" in o) parts.push(`eventCount=${o.eventCount}`);
  if ("count" in o) parts.push(`count=${o.count}`);
  if ("usedBytes" in o) parts.push(`usedBytes=${o.usedBytes}`);
  if ("title" in o) parts.push(`title=${String(o.title).slice(0, 40)}`);
  if ("date" in o) parts.push(`date=${o.date}`);
  if ("mode" in o) parts.push(`mode=${o.mode}`);
  if ("level" in o) parts.push(`level=${o.level}`);
  return parts.length ? parts.join(" ") : `{keys:${Object.keys(o).slice(0, 6).join(",")}}`;
}

/**
 * @param {...unknown} args
 */
function devLogBus(...args) {
  if (!isEventBusDevLogEnabled()) return;
  console.warn("[EventBus]", ...args);
}

/**
 * @param {string} eventName
 * @param {unknown} err
 */
function trackHandlerError(eventName, err) {
  internalHandlerErrors.push({
    event: eventName,
    message: err instanceof Error ? err.message : String(err),
    at: Date.now()
  });
  if (internalHandlerErrors.length > MAX_INTERNAL_ERRORS) {
    internalHandlerErrors.shift();
  }
}

/**
 * Subscribe to a named event (§13.1 / §13.3).
 * @param {string} eventName
 * @param {(payload: unknown) => void} callback
 * @returns {() => void} unsubscribe — call on unmount
 */
export function on(eventName, callback) {
  const key = String(eventName);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => off(eventName, callback);
}

/**
 * Remove a listener by exact handler reference (§13.1).
 * @param {string} eventName
 * @param {(payload: unknown) => void} callback
 */
export function off(eventName, callback) {
  listeners.get(String(eventName))?.delete(callback);
}

/**
 * Emit synchronously to all subscribers in subscription order (§13.1).
 * Iterates a snapshot so mid-emit on/off is safe (2.1.3).
 * @param {string} eventName
 * @param {unknown} [payload]
 */
export function emit(eventName, payload) {
  const key = String(eventName);
  const set = listeners.get(key);
  if (!set?.size) return;

  devLogBus("emit", key, summarizePayload(payload));

  const snapshot = [...set];
  for (const fn of snapshot) {
    try {
      fn(payload);
    } catch (err) {
      trackHandlerError(key, err);
      if (isEventBusDevLogEnabled()) {
        console.error(`[EventBus] handler failed for "${key}"`, err);
      }
    }
  }
}

/**
 * Subscribe to all timeline data mutation events (§13.2 / 2.1.8).
 * @param {(payload: unknown) => void} handler
 * @returns {Array<() => void>} dispose fns — call all on unmount
 */
export function onTimelineDataChange(handler) {
  return TIMELINE_DATA_EVENTS.map((name) => on(name, handler));
}

/**
 * @param {Array<() => void>} disposers
 */
export function disposeTimelineDataChange(disposers) {
  for (const dispose of disposers) dispose();
}

/** @returns {Array<{ event: string, message: string, at: number }>} */
export function __testGetInternalHandlerErrors() {
  return [...internalHandlerErrors];
}

export function __testResetInternalHandlerErrors() {
  internalHandlerErrors.length = 0;
}

/** @returns {boolean} */
export function __testIsEventBusDevLogEnabled() {
  return isEventBusDevLogEnabled();
}

export default { on, off, emit, TIMELINE_DATA_EVENTS, onTimelineDataChange, disposeTimelineDataChange };
