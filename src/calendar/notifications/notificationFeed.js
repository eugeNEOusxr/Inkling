import { scheduleCloudSync } from "../../auth/cloudSync.js";
import { collectSchedulableEvents } from "./notificationEvents.js";

export const ESCALATION_WINDOWS = [
  { level: "soft", minutesBefore: 60 },
  { level: "medium", minutesBefore: 15 },
  { level: "urgent", minutesBefore: 5 },
  { level: "final", minutesBefore: 0 }
];

const HISTORY_KEY = "calendar3d-notification-history-v1";
const MAX_HISTORY = 200;

/**
 * @typedef {Object} NotificationItem
 * @property {string} id
 * @property {string} sourceId
 * @property {'reminder'|'alarm'|'appointment'|'note'} type
 * @property {'soft'|'medium'|'urgent'|'final'|null} level
 * @property {number} triggerAt
 * @property {string} date
 * @property {string} dayId
 * @property {number} hour
 * @property {string} message
 * @property {string} title
 * @property {'notebook'|'appointments'} wall
 * @property {'upcoming'|'past'} status
 * @property {number} [firedAt]
 */

/**
 * @param {import("../calendarState.js").CalendarState} state
 * @param {number} [now]
 * @returns {NotificationItem[]}
 */
export function buildUpcomingFeed(state, now = Date.now()) {
  const items = [];
  const horizon = now + 7 * 24 * 60 * 60 * 1000;

  for (const ev of collectSchedulableEvents(state)) {
    if (ev.triggerAt < now - 60000 || ev.triggerAt > horizon) continue;
    const level = currentEscalationLevel(ev.triggerAt, now);
    items.push({
      id: `feed-${ev.id}`,
      sourceId: ev.id,
      type: ev.kind,
      level,
      triggerAt: ev.triggerAt,
      date: ev.day.date,
      dayId: ev.day.id,
      hour: ev.hour,
      message: ev.message || "",
      title: ev.title || formatType(ev.kind),
      wall: ev.wall,
      status: ev.triggerAt <= now ? "past" : "upcoming"
    });
  }

  return items.sort((a, b) => a.triggerAt - b.triggerAt);
}

const DROPDOWN_HISTORY_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Upcoming feed plus recent fired history so dropdown items stay readable after click.
 * @param {import("../calendarState.js").CalendarState} state
 * @param {number} [now]
 */
export function buildDropdownFeed(state, now = Date.now()) {
  const upcoming = buildUpcomingFeed(state, now);
  const history = loadNotificationHistory().filter(
    (h) => (h.firedAt ?? h.triggerAt) >= now - DROPDOWN_HISTORY_MS
  );
  const keys = new Set(upcoming.map((item) => wallItemKey(item)));
  const merged = [...upcoming];

  for (const h of history) {
    const key = wallItemKey(h);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push({
      ...h,
      id: h.id ?? `hist-${key}`,
      status: "past",
      title: h.title || formatType(h.type),
      message: h.message || h.title || ""
    });
  }

  return merged.sort((a, b) => a.triggerAt - b.triggerAt);
}

/**
 * Escalation events due now (not yet fired).
 * @param {import("../calendarState.js").CalendarState} state
 * @param {number} now
 */
export function getDueEscalations(state, now = Date.now()) {
  const due = [];

  for (const ev of collectSchedulableEvents(state)) {
    const level = currentEscalationLevel(ev.triggerAt, now);
    if (!level) continue;

    const win = ESCALATION_WINDOWS.find((w) => w.level === level);
    const fireAt = ev.triggerAt - (win?.minutesBefore ?? 0) * 60 * 1000;
    if (now < fireAt - 5000) continue;

    due.push({
      fireKey: `${ev.id}:${level}`,
      sourceId: ev.id,
      type: ev.kind,
      level,
      triggerAt: ev.triggerAt,
      fireAt,
      date: ev.day.date,
      dayId: ev.day.id,
      hour: ev.hour,
      message: ev.message || "",
      title: formatEscalationTitle(level, ev.kind),
      wall: ev.wall
    });
  }

  return due;
}

/**
 * @returns {NotificationItem[]}
 */
export function loadNotificationHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * @param {NotificationItem|object} entry
 */
export function appendNotificationHistory(entry) {
  const history = loadNotificationHistory();
  const stableId =
    entry.id ?? `hist-${entry.sourceId}-${entry.type}-${entry.triggerAt ?? Date.now()}`;
  const existingIdx = history.findIndex(
    (h) =>
      h.sourceId === entry.sourceId &&
      h.type === entry.type &&
      h.triggerAt === entry.triggerAt &&
      h.level === entry.level
  );
  const row = {
    ...entry,
    firedAt: entry.firedAt ?? Date.now(),
    status: "past",
    id: stableId
  };
  if (existingIdx >= 0) {
    history[existingIdx] = row;
  } else {
    history.unshift(row);
  }
  const trimmed = history.slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    scheduleCloudSync();
    import("./notificationCloud.js")
      .then((m) => m.queueNotificationHistorySync(row))
      .catch(() => {});
  } catch {
    /* ignore */
  }
  return trimmed;
}

export function clearNotificationHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {import("../calendarState.js").CalendarState} state
 */
function wallItemKey(item) {
  return `${item.sourceId}|${item.type}|${item.triggerAt}`;
}

/**
 * Merge upcoming feed + fired history (no duplicates); history wins level/fired state.
 */
export function buildNotificationWallItems(state, now = Date.now()) {
  const upcoming = buildUpcomingFeed(state, now);
  const history = loadNotificationHistory();
  const merged = new Map();

  for (const item of upcoming) {
    merged.set(wallItemKey(item), { ...item });
  }

  for (const item of history) {
    const key = wallItemKey(item);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        ...item,
        status: "past",
        level: item.level ?? existing.level,
        firedAt: item.firedAt ?? Date.now(),
        id: item.id ?? existing.id
      });
    } else {
      merged.set(key, {
        ...item,
        status: "past",
        id: item.id ?? `hist-${key}`
      });
    }
  }

  const byDay = new Map();
  for (const item of merged.values()) {
    if (!byDay.has(item.date)) byDay.set(item.date, []);
    byDay.get(item.date).push(item);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => a.triggerAt - b.triggerAt)
    }));
}

/**
 * Highest escalation level currently active (one per event per tick).
 * @param {number} triggerAt
 * @param {number} now
 * @returns {'soft'|'medium'|'urgent'|'final'|null}
 */
export function currentEscalationLevel(triggerAt, now) {
  if (now >= triggerAt) return "final";
  const softAt = triggerAt - 60 * 60 * 1000;
  const mediumAt = triggerAt - 15 * 60 * 1000;
  const urgentAt = triggerAt - 5 * 60 * 1000;
  if (now >= urgentAt) return "urgent";
  if (now >= mediumAt) return "medium";
  if (now >= softAt) return "soft";
  return null;
}

function formatType(kind) {
  const map = {
    reminder: "Reminder",
    alarm: "Alarm",
    appointment: "Appointment",
    note: "Note"
  };
  return map[kind] ?? "Event";
}

function formatEscalationTitle(level, kind) {
  const label = formatType(kind);
  if (level === "soft") return `${label} in about an hour`;
  if (level === "medium") return `${label} in 15 minutes`;
  if (level === "urgent") return `${label} in 5 minutes`;
  return `${label} now`;
}

export function formatNotificationTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
  if (sameDay) return `Today ${time}`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function getTypeIcon(type) {
  const icons = {
    reminder: "🔔",
    alarm: "⏰",
    appointment: "📅",
    note: "📝"
  };
  return icons[type] ?? "•";
}

export function getLevelClass(level) {
  if (level === "soft") return "notify-level--soft";
  if (level === "medium") return "notify-level--medium";
  if (level === "urgent") return "notify-level--urgent";
  if (level === "final") return "notify-level--final";
  return "";
}

export function formatLevelLabel(level) {
  if (!level) return "";
  const map = {
    soft: "1h alert",
    medium: "15 min",
    urgent: "5 min",
    final: "Now"
  };
  return map[level] ?? level;
}
