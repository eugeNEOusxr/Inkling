/**
 * Authoritative alerts engine (§7.1 Option B — Milestone 2.2).
 * Persisted in `inkling-alerts-v1`, linked to timeline rows via `timelineEntryId`.
 * `Event.alerts[]` on the timeline is optional/link-only; this store is source of truth.
 */

import * as canonicalBus from "../../utils/EventBus.js";

export const STORAGE_KEY = "inkling-alerts-v1";
export const SCHEDULE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
export const BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Recent-late window: triggers within this many ms after `fireAt` still fire (not missed). */
export const CATCH_WINDOW_MS = 90_000;
export const SNOOZE_MINUTES_OPTIONS = [5, 10, 30];

const STORAGE_WARN_BYTES = 4.5 * 1024 * 1024;
const STORAGE_FULL_BYTES = 4.9 * 1024 * 1024;
const MAX_SET_TIMEOUT_MS = 2_147_483_647 - 60_000;

/** @typedef {{ alertId: string, fireAt: number, leadMinutes: number, phase: string }} ScheduledTrigger */

/** @typedef {"popup"|"sound"} AlertKind */

export const AlertTypes = {
  HEALTH: "health",
  STUDY: "study",
  WORK: "work",
  PERSONAL: "personal",
  CREATIVE: "creative",
  ERRAND: "errand",
  FINANCE: "finance",
  APPOINTMENT: "appointment",
  DEADLINE: "deadline",
  REMINDER: "reminder",
  ALARM: "alarm"
};

export const AlertPriority = {
  CRITICAL: 3,
  HIGH: 2,
  NORMAL: 1,
  LOW: 0
};

/**
 * @typedef {{
 *   id: string,
 *   time: string,
 *   text: string,
 *   category: string,
 *   priority: number,
 *   kind: AlertKind,
 *   createdAt: number,
 *   dismissed: boolean,
 *   date?: string,
 *   timelineEntryId?: string,
 *   firedPhases?: string[],
 *   snoozeFireAt?: number
 * }} AlertRecord
 */

let _storageWarningEmitted = false;
/** @type {"ok"|"warn"|"full"|null} */
let __testStorageGuardOverride = null;

function isAlertsDevLogEnabled() {
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
function devLogAlerts(...args) {
  if (!isAlertsDevLogEnabled()) return;
  console.warn("[alertsModel]", ...args);
}

/**
 * @param {string} json
 * @returns {number}
 */
function measureJsonBytes(json) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  return json.length * 2;
}

/**
 * @param {AlertRecord[]} alerts
 * @returns {{ json: string, bytes: number, status: "ok"|"warn"|"full" }}
 */
function serializeAlertsForStorage(alerts) {
  const json = JSON.stringify(alerts);
  const bytes = measureJsonBytes(json);
  if (__testStorageGuardOverride) {
    return { json, bytes, status: __testStorageGuardOverride };
  }
  let status = /** @type {"ok"|"warn"|"full"} */ ("ok");
  if (bytes >= STORAGE_FULL_BYTES) status = "full";
  else if (bytes >= STORAGE_WARN_BYTES) status = "warn";
  return { json, bytes, status };
}

/**
 * @param {AlertRecord[]} alerts
 * @param {{ silent?: boolean }} [opts]
 * @returns {boolean}
 */
function writeAlertsStore(alerts, opts = {}) {
  const { json, bytes, status } = serializeAlertsForStorage(alerts);

  if (status === "warn") {
    if (!_storageWarningEmitted && !opts.silent) {
      canonicalBus.emit("storageWarning", { usedBytes: bytes });
      _storageWarningEmitted = true;
      devLogAlerts("storageWarning", { usedBytes: bytes });
    }
  } else if (!opts.silent) {
    _storageWarningEmitted = false;
  }

  if (status === "full") {
    if (!opts.silent) {
      canonicalBus.emit("storageFull", { usedBytes: bytes });
      devLogAlerts("storageFull (estimate)", { usedBytes: bytes });
    }
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch (err) {
    canonicalBus.emit("storageFull", { usedBytes: bytes, error: String(err) });
    devLogAlerts("storageFull (quota)", { usedBytes: bytes, err });
    return false;
  }
}

/**
 * @returns {AlertRecord[]}
 */
export function captureAlertsSnapshot() {
  return loadAlerts().map((a) => ({
    ...a,
    firedPhases: [...(a.firedPhases ?? [])]
  }));
}

/**
 * @param {AlertRecord[]} snapshot
 */
function restoreAlertsSnapshot(snapshot) {
  writeAlertsStore(snapshot, { silent: true });
}

/**
 * @param {string} category
 * @param {number} priority
 * @returns {AlertKind}
 */
export function defaultKindForAlert(category, priority) {
  void category;
  if (priority >= AlertPriority.HIGH) return "sound";
  return "popup";
}

/**
 * @param {AlertRecord} alert
 * @returns {boolean} true when every scheduled phase has fired
 */
export function isAlertTriggered(alert) {
  const phases = buildScheduleTriggers(alert).map((t) => t.phase);
  if (!phases.length) return false;
  const fired = new Set(alert.firedPhases ?? []);
  return phases.every((p) => fired.has(p));
}

/**
 * @param {{ time: string, text: string, category?: string, priority?: number, kind?: AlertKind, date?: string, timelineEntryId?: string }} fields
 * @returns {AlertRecord}
 */
export function createAlert({ time, text, category, priority, kind, date, timelineEntryId }) {
  const cat = String(category ?? "reminder").toLowerCase().trim();
  const pri = priority ?? getPriorityForCategory(cat);
  return {
    id: crypto.randomUUID(),
    time: String(time ?? "09:00"),
    text: String(text ?? "").trim(),
    category: cat,
    priority: pri,
    kind: kind ?? defaultKindForAlert(cat, pri),
    createdAt: Date.now(),
    dismissed: false,
    // Remark state: "pending" until the user checks it off. A fired alert stays
    // visible (awaiting review) instead of silently disappearing.
    status: "pending",
    remark: "", // free-text note, e.g. "no show" — later surfaced in WordWeaver
    date: date ?? todayDateString(),
    timelineEntryId,
    firedPhases: []
  };
}

/**
 * @param {number} priority
 * @returns {number[]}
 */
export function getLeadMinutesForPriority(priority) {
  switch (priority) {
    case AlertPriority.CRITICAL:
      return [60, 30, 10, 5, 0];
    case AlertPriority.HIGH:
      return [30, 10, 0];
    case AlertPriority.NORMAL:
      return [10, 0];
    case AlertPriority.LOW:
    default:
      return [0];
  }
}

/**
 * @param {AlertRecord} alert
 * @param {string} [referenceDate]
 * @returns {ScheduledTrigger[]}
 */
export function buildScheduleTriggers(alert, referenceDate = alert.date ?? todayDateString()) {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const [hh, mm] = String(alert.time ?? "09:00").match(/(\d{1,2}):(\d{2})/)?.slice(1) ?? ["9", "0"];
  const base = new Date(y, m - 1, d, Number(hh), Number(mm), 0, 0).getTime();
  const leads = getLeadMinutesForPriority(alert.priority);

  /** @type {ScheduledTrigger[]} */
  const triggers = leads.map((leadMinutes) => {
    const phase = leadMinutes === 0 ? "at_time" : `before_${leadMinutes}`;
    return {
      alertId: alert.id,
      fireAt: base - leadMinutes * 60 * 1000,
      leadMinutes,
      phase
    };
  });

  if (alert.snoozeFireAt) {
    triggers.push({
      alertId: alert.id,
      fireAt: alert.snoozeFireAt,
      leadMinutes: 0,
      phase: `snooze_${alert.snoozeFireAt}`
    });
  }

  return triggers;
}

export function getPriorityForCategory(category) {
  switch (String(category ?? "").toLowerCase()) {
    case "health":
    case "appointment":
    case "deadline":
      return AlertPriority.CRITICAL;
    case "study":
    case "work":
      return AlertPriority.HIGH;
    case "finance":
    case "errand":
      return AlertPriority.NORMAL;
    case "personal":
    case "creative":
    default:
      return AlertPriority.LOW;
  }
}

/**
 * @returns {string}
 */
export function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * @param {Partial<AlertRecord>} raw
 * @returns {AlertRecord}
 */
function normalizeAlert(raw) {
  const category = String(raw.category ?? "reminder").toLowerCase();
  const priority = Number.isFinite(raw.priority)
    ? Number(raw.priority)
    : getPriorityForCategory(category);
  const kind =
    raw.kind === "sound" || raw.kind === "popup"
      ? raw.kind
      : defaultKindForAlert(category, priority);
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    time: String(raw.time ?? "09:00"),
    text: String(raw.text ?? "").trim(),
    category,
    priority,
    kind,
    createdAt: Number(raw.createdAt) || Date.now(),
    dismissed: Boolean(raw.dismissed),
    status: raw.status === "done" || raw.status === "missed" ? raw.status : "pending",
    remark: typeof raw.remark === "string" ? raw.remark : "",
    resolvedAt: Number.isFinite(raw.resolvedAt) ? Number(raw.resolvedAt) : undefined,
    date: raw.date ?? todayDateString(),
    timelineEntryId: raw.timelineEntryId,
    firedPhases: Array.isArray(raw.firedPhases) ? [...raw.firedPhases] : [],
    snoozeFireAt: Number.isFinite(raw.snoozeFireAt) ? Number(raw.snoozeFireAt) : undefined
  };
}

/**
 * @returns {AlertRecord[]}
 */
export function loadAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => normalizeAlert(a));
  } catch {
    return [];
  }
}

/**
 * @param {AlertRecord[]} alerts
 * @param {AlertRecord[] | null} [rollbackSnapshot]
 * @returns {boolean}
 */
export function saveAlerts(alerts, rollbackSnapshot = null, opts = {}) {
  const normalized = alerts.map((a) => normalizeAlert(a));
  if (!writeAlertsStore(normalized)) {
    if (rollbackSnapshot) restoreAlertsSnapshot(rollbackSnapshot);
    devLogAlerts("rollback saveAlerts");
    return false;
  }
  // `silent` lets metadata-only writes (e.g. a remark) persist WITHOUT triggering
  // a UI refresh — otherwise the alerts panel rebuilds and kills the Save-button
  // "✓ Saved" flash mid-click.
  if (!opts.silent) notifyAlertsUpdated();
  return true;
}

/**
 * @param {AlertRecord[]} alerts
 */
/**
 * Notify UI/schedulers that alert data changed (canonical bus — no document shim).
 */
function notifyAlertsUpdated() {
  canonicalBus.emit("eventUpdated", { alertsRefresh: true });
}

/**
 * @param {AlertRecord} alert
 * @returns {AlertRecord}
 */
export function addAlert(alert) {
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const normalized = normalizeAlert(alert);
  alerts.push(normalized);
  if (!saveAlerts(alerts, snapshot)) {
    throw new Error("Could not persist alert (storage full).");
  }
  return normalized;
}

/**
 * @param {string} id
 * @returns {AlertRecord | null}
 */
export function dismissAlert(id) {
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  alerts[idx] = { ...alerts[idx], dismissed: true };
  if (!saveAlerts(alerts, snapshot)) return null;
  return alerts[idx];
}

/**
 * Mark an alert's remark state. "done" = accomplished ✓, "missed" = unattained ✗,
 * "pending" = un-resolve it. Resolved alerts persist (they don't auto-disappear)
 * so the user reviews them deliberately.
 * @param {string} id
 * @param {"done"|"missed"|"pending"} status
 * @returns {AlertRecord | null}
 */
export function setAlertStatus(id, status) {
  const valid = status === "done" || status === "missed" ? status : "pending";
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  alerts[idx] = {
    ...alerts[idx],
    status: valid,
    resolvedAt: valid === "pending" ? undefined : Date.now()
  };
  if (!saveAlerts(alerts, snapshot)) return null;
  return alerts[idx];
}

/**
 * Attach/replace a free-text remark on an alert (e.g. "no show"). Persisted so it
 * can later be reviewed in WordWeaver.
 * @param {string} id
 * @param {string} text
 * @returns {AlertRecord | null}
 */
export function setAlertRemark(id, text) {
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  alerts[idx] = { ...alerts[idx], remark: String(text ?? "").slice(0, 500) };
  if (!saveAlerts(alerts, snapshot, { silent: true })) return null;
  return alerts[idx];
}

/**
 * Alerts whose time has passed but the user hasn't checked off yet — these stay
 * on screen (awaiting a ✓/✗ remark) instead of vanishing.
 * @param {number} [now]
 * @returns {{ alert: AlertRecord, triggerAt: number }[]}
 */
export function getAlertsAwaitingReview(now = Date.now()) {
  /** @type {{ alert: AlertRecord, triggerAt: number }[]} */
  const rows = [];
  for (const alert of loadAlerts()) {
    if (alert.dismissed) continue;
    if (alert.status === "done" || alert.status === "missed") continue;
    const triggers = buildScheduleTriggers(alert);
    const atTime = triggers.find((t) => t.phase === "at_time") ?? triggers[triggers.length - 1];
    if (atTime && atTime.fireAt <= now) rows.push({ alert, triggerAt: atTime.fireAt });
  }
  return rows.sort((a, b) => b.triggerAt - a.triggerAt);
}

/**
 * Recently resolved alerts (checked ✓ or ✗), newest first — for the review log.
 * @param {number} [now]
 * @param {number} [withinMs] default 2 days
 * @returns {AlertRecord[]}
 */
export function getResolvedAlerts(now = Date.now(), withinMs = 2 * 24 * 60 * 60 * 1000) {
  const since = now - withinMs;
  return loadAlerts()
    .filter((a) => (a.status === "done" || a.status === "missed") && (a.resolvedAt ?? 0) >= since)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
}

/**
 * @param {string} id
 * @param {number} minutes
 * @param {number} [now]
 * @returns {AlertRecord | null}
 */
export function snoozeAlert(id, minutes, now = Date.now()) {
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const fireAt = now + minutes * 60 * 1000;
  alerts[idx] = { ...alerts[idx], snoozeFireAt: fireAt };
  if (!saveAlerts(alerts, snapshot)) return null;
  return alerts[idx];
}

/**
 * @param {string} id
 * @param {string} phase
 * @returns {boolean}
 */
export function markAlertPhaseFired(id, phase) {
  const snapshot = captureAlertsSnapshot();
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  const fired = new Set(alerts[idx].firedPhases ?? []);
  if (fired.has(phase)) return true;
  fired.add(phase);
  alerts[idx] = { ...alerts[idx], firedPhases: [...fired] };
  if (!saveAlerts(alerts, snapshot)) return false;
  return true;
}

/**
 * @param {string} timelineEntryId
 * @returns {number} removed count
 */
export function removeAlertsForEntry(timelineEntryId) {
  const snapshot = captureAlertsSnapshot();
  const id = String(timelineEntryId);
  const alerts = loadAlerts();
  const next = alerts.filter((a) => a.timelineEntryId !== id);
  if (next.length === alerts.length) return 0;
  if (!saveAlerts(next, snapshot)) return 0;
  return alerts.length - next.length;
}

/**
 * @param {string} timelineEntryId
 * @returns {AlertRecord | undefined}
 */
export function findAlertByTimelineEntryId(timelineEntryId) {
  return loadAlerts().find((a) => a.timelineEntryId === timelineEntryId && !a.dismissed);
}

/**
 * Active (not dismissed) alerts for today and future dates.
 * @returns {AlertRecord[]}
 */
export function getActiveAlerts() {
  const today = todayDateString();
  return loadAlerts().filter((a) => !a.dismissed && (a.date ?? today) >= today);
}

/**
 * @param {AlertRecord} alert
 * @param {number} now
 * @param {number} horizonEnd
 * @returns {ScheduledTrigger | null}
 */
export function getNextUnfiredTrigger(alert, now, horizonEnd) {
  const fired = new Set(alert.firedPhases ?? []);
  let best = null;
  for (const trigger of buildScheduleTriggers(alert)) {
    if (fired.has(trigger.phase)) continue;
    if (trigger.fireAt > horizonEnd) continue;
    if (trigger.fireAt < now - CATCH_WINDOW_MS) continue;
    if (!best || trigger.fireAt < best.fireAt) best = trigger;
  }
  return best;
}

/**
 * @param {number} [now]
 * @returns {{ alert: AlertRecord, trigger: ScheduledTrigger, triggerAt: number }[]}
 */
export function getMissedAlerts(now = Date.now()) {
  /** @type {{ alert: AlertRecord, trigger: ScheduledTrigger, triggerAt: number }[]} */
  const missed = [];
  for (const alert of loadAlerts().filter((a) => !a.dismissed)) {
    const fired = new Set(alert.firedPhases ?? []);
    for (const trigger of buildScheduleTriggers(alert)) {
      if (fired.has(trigger.phase)) continue;
      if (trigger.fireAt >= now - CATCH_WINDOW_MS) continue;
      if (trigger.fireAt < now - CATCH_WINDOW_MS) {
        missed.push({ alert, trigger, triggerAt: trigger.fireAt });
      }
    }
  }
  return missed.sort((a, b) => a.triggerAt - b.triggerAt);
}

/**
 * Badge count: upcoming un-dismissed within 24h (§7.3).
 * @param {number} [now]
 * @returns {number}
 */
export function getBadgeAlertCount(now = Date.now()) {
  return getUpcomingAlerts(now, { withinMs: BADGE_WINDOW_MS }).length;
}

/**
 * @param {number} count
 */
export function renderAlertsBadge(count = getBadgeAlertCount()) {
  if (typeof document === "undefined") return;
  const label = count > 9 ? "9+" : String(count);
  document.querySelectorAll("[data-inkling-alerts-badge]").forEach((el) => {
    el.textContent = label;
    el.classList.toggle("hidden", count === 0);
  });
}

/**
 * §7.3 — 24h upcoming count for the top-bar badge.
 * @param {number} [now]
 * @returns {number}
 */
export function syncAlertsBadge(now = Date.now()) {
  const count = getBadgeAlertCount(now);
  renderAlertsBadge(count);
  return count;
}

/**
 * @param {import("../../wordweaver/timelineModel.js").TimelineEntryRecord} entry
 * @returns {AlertRecord}
 */
export function createAlertFromTimelineEntry(entry) {
  const existing = findAlertByTimelineEntryId(String(entry.id));
  if (existing) return existing;

  const category = String(entry.category ?? "default").toLowerCase();
  const alert = createAlert({
    time: entry.time,
    text: entry.text || entry.label,
    category: category === "default" ? "reminder" : category,
    timelineEntryId: String(entry.id),
    date: entry.date
  });
  return addAlert(alert);
}

/**
 * @param {{ time?: string, text?: string, category?: string, date?: string, priority?: number }} payload
 * @returns {AlertRecord}
 */
export function registerAlertFromPayload(payload) {
  const category = String(payload?.category ?? "reminder").toLowerCase();
  return addAlert(
    createAlert({
      time: payload?.time ?? "09:00",
      text: payload?.text ?? "Reminder",
      category,
      date: payload?.date,
      // User-asked reminders fire once at the set time (no pre-alerts) unless a
      // priority is explicitly requested.
      priority: payload?.priority ?? AlertPriority.LOW
    })
  );
}

/**
 * @param {number} alertTime epoch ms
 * @returns {string}
 */
export function getTimeUntil(alertTime, now = Date.now()) {
  const diff = alertTime - now;

  if (diff <= 0) return "now";
  if (diff < 60000) return "less than a minute";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours`;
  return `${Math.floor(diff / 86400000)} days`;
}

/**
 * Human "how long ago" label for a past time so fired alerts show their age
 * (e.g. "8 hours ago") instead of a misleading "now".
 * @param {number} pastTime epoch ms
 * @param {number} [now]
 * @returns {string}
 */
export function getTimeAgo(pastTime, now = Date.now()) {
  const diff = now - pastTime;
  if (diff < 60000) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(diff / 86400000);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * @param {AlertRecord} alert
 * @param {number} [now]
 * @returns {number | null}
 */
export function getNextTriggerMs(alert, now = Date.now()) {
  const trigger = getNextUnfiredTrigger(alert, now, now + SCHEDULE_HORIZON_MS);
  return trigger?.fireAt ?? null;
}

/**
 * Canonical upcoming-alerts read (§7.2 / 2.2.2).
 * @param {number} [now]
 * @param {{ withinMs?: number }} [opts] default 7-day scheduler horizon
 * @returns {{ alert: AlertRecord, triggerAt: number, trigger: ScheduledTrigger }[]}
 */
export function getUpcomingAlerts(now = Date.now(), opts = {}) {
  const withinMs = opts.withinMs ?? SCHEDULE_HORIZON_MS;
  const horizonEnd = now + withinMs;
  /** @type {{ alert: AlertRecord, triggerAt: number, trigger: ScheduledTrigger }[]} */
  const rows = [];

  for (const alert of getActiveAlerts()) {
    const trigger = getNextUnfiredTrigger(alert, now, horizonEnd);
    if (trigger) {
      rows.push({ alert, triggerAt: trigger.fireAt, trigger });
    }
  }

  return rows.sort((a, b) => a.triggerAt - b.triggerAt);
}

/**
 * Clamp delay for `setTimeout` (§7.2 overflow).
 * @param {number} msUntil
 * @returns {number}
 */
export function clampSchedulerDelayMs(msUntil) {
  if (msUntil <= 0) return 0;
  if (msUntil > MAX_SET_TIMEOUT_MS) return MAX_SET_TIMEOUT_MS;
  return msUntil;
}

/** @param {"ok"|"warn"|"full"|null} status */
export function __testSetAlertsStorageGuardOverride(status) {
  __testStorageGuardOverride = status;
}

export function __testResetAlertsModel() {
  _storageWarningEmitted = false;
  __testStorageGuardOverride = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
