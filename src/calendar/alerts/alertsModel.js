/**
 * Inkling + WordWeaver alert records (localStorage).
 */

const STORAGE_KEY = "inkling-alerts-v1";

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

/** @typedef {{
 *   id: string,
 *   time: string,
 *   text: string,
 *   category: string,
 *   priority: number,
 *   createdAt: number,
 *   dismissed: boolean,
 *   date?: string,
 *   timelineEntryId?: string,
 *   firedPhases?: string[]
 * }} AlertRecord */

/**
 * @param {{ time: string, text: string, category?: string, priority?: number, date?: string, timelineEntryId?: string }} fields
 * @returns {AlertRecord}
 */
export function createAlert({ time, text, category, priority, date, timelineEntryId }) {
  const cat = String(category ?? "reminder").toLowerCase().trim();
  const pri = priority ?? getPriorityForCategory(cat);
  return {
    id: crypto.randomUUID(),
    time: String(time ?? "09:00"),
    text: String(text ?? "").trim(),
    category: cat,
    priority: pri,
    createdAt: Date.now(),
    dismissed: false,
    date: date ?? todayDateString(),
    timelineEntryId,
    firedPhases: []
  };
}

/**
 * @param {string} category
 * @returns {number}
 */
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
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    time: String(raw.time ?? "09:00"),
    text: String(raw.text ?? "").trim(),
    category,
    priority: Number.isFinite(raw.priority) ? Number(raw.priority) : getPriorityForCategory(category),
    createdAt: Number(raw.createdAt) || Date.now(),
    dismissed: Boolean(raw.dismissed),
    date: raw.date ?? todayDateString(),
    timelineEntryId: raw.timelineEntryId,
    firedPhases: Array.isArray(raw.firedPhases) ? [...raw.firedPhases] : []
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
 */
export function saveAlerts(alerts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch (err) {
    console.warn("[alertsModel] save failed", err);
  }
  document.dispatchEvent(new CustomEvent("inkling:alerts-updated", { detail: { alerts } }));
}

/**
 * @param {AlertRecord} alert
 * @returns {AlertRecord}
 */
export function addAlert(alert) {
  const alerts = loadAlerts();
  const normalized = normalizeAlert(alert);
  alerts.push(normalized);
  saveAlerts(alerts);
  return normalized;
}

/**
 * @param {string} id
 * @returns {AlertRecord | null}
 */
export function dismissAlert(id) {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  alerts[idx] = { ...alerts[idx], dismissed: true };
  saveAlerts(alerts);
  return alerts[idx];
}

/**
 * @param {string} id
 * @param {string} phase
 */
export function markAlertPhaseFired(id, phase) {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx < 0) return;
  const fired = new Set(alerts[idx].firedPhases ?? []);
  if (fired.has(phase)) return;
  fired.add(phase);
  alerts[idx] = { ...alerts[idx], firedPhases: [...fired] };
  saveAlerts(alerts);
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
 * Badge count: active alerts not yet fully fired at time.
 * @returns {number}
 */
export function getActiveAlertCount() {
  return getActiveAlerts().length;
}

/**
 * @returns {number}
 */
export function syncAlertsBadge() {
  const count = getActiveAlertCount();
  document.querySelectorAll("[data-inkling-alerts-badge]").forEach((el) => {
    el.textContent = String(count);
    el.classList.toggle("hidden", count === 0);
  });
  return count;
}

/**
 * @param {import("../../wordweaver/timelineModel.js").TimelineEntryRecord} entry
 * @returns {AlertRecord}
 */
export function createAlertFromTimelineEntry(entry) {
  const category = String(entry.category ?? "default").toLowerCase();
  const alert = createAlert({
    time: entry.time,
    text: entry.text || entry.label,
    category: category === "default" ? "reminder" : category,
    timelineEntryId: entry.id
  });
  return addAlert(alert);
}

/**
 * @param {{ time?: string, text?: string, category?: string }} payload
 * @returns {AlertRecord}
 */
export function registerAlertFromPayload(payload) {
  const category = String(payload?.category ?? "reminder").toLowerCase();
  return addAlert(
    createAlert({
      time: payload?.time ?? "09:00",
      text: payload?.text ?? "Reminder",
      category
    })
  );
}
