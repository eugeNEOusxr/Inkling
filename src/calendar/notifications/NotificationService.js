import { InAppAlert } from "./InAppAlert.js";
import { SoundManager } from "./SoundManager.js";
import {
  buildDropdownFeed,
  getDueEscalations,
  appendNotificationHistory,
  loadNotificationHistory
} from "./notificationFeed.js";
import { loadNotificationSettings } from "./notificationSettings.js";
import { showLocalNotification } from "./webPush.js";

const FIRED_KEY = "calendar3d-fired-alerts-v2";
const DROPDOWN_UI_KEY = "calendar3d-dropdown-ui-v1";

import {
  SNOOZE_MS,
  getPreferredSnoozeDuration,
  setPreferredSnoozeDuration,
  snoozeLabel
} from "./snoozePrefs.js";

export { SNOOZE_MS, getPreferredSnoozeDuration, setPreferredSnoozeDuration, snoozeLabel };

/**
 * @returns {{ read: Record<string, number>, snooze: Record<string, number> }}
 */
export function loadDropdownUiState() {
  try {
    const raw = localStorage.getItem(DROPDOWN_UI_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        read: parsed.read ?? {},
        snooze: parsed.snooze ?? {}
      };
    }
  } catch {
    /* ignore */
  }
  return { read: {}, snooze: {} };
}

function saveDropdownUiState(state) {
  try {
    localStorage.setItem(DROPDOWN_UI_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} feedId
 */
export function markDropdownItemRead(feedId) {
  const state = loadDropdownUiState();
  state.read[feedId] = Date.now();
  saveDropdownUiState(state);
}

/**
 * @param {string} feedId
 * @param {'5m'|'10m'|'15m'} duration
 */
export function snoozeDropdownItem(feedId, duration) {
  const dur = duration ?? getPreferredSnoozeDuration();
  if (duration) setPreferredSnoozeDuration(duration);
  const state = loadDropdownUiState();
  const ms = SNOOZE_MS[dur] ?? SNOOZE_MS["10m"];
  state.snooze[feedId] = Date.now() + ms;
  saveDropdownUiState(state);
}

/**
 * @param {number} triggerAt
 * @param {number} [now]
 */
export function formatCountdown(triggerAt, now = Date.now()) {
  const diff = triggerAt - now;
  if (diff <= 0) {
    // Past: show how long ago it fired so the user can decide to clear it.
    const past = now - triggerAt;
    if (past < 60000) return "Now";
    const mins = Math.floor(past / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 60) return `in ${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `in ${mins}m ${secs}s` : `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return remMins > 0 ? `in ${hours}h ${remMins}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
}

/**
 * Filter snoozed items and attach read state for the dropdown.
 * @param {import("./notificationFeed.js").NotificationItem[]} items
 * @param {number} [now]
 */
export function applyDropdownUiState(items, now = Date.now()) {
  const ui = loadDropdownUiState();
  const pruned = { read: {}, snooze: {} };
  let changed = false;

  for (const [id, until] of Object.entries(ui.snooze)) {
    if (until > now) pruned.snooze[id] = until;
    else changed = true;
  }
  for (const [id, at] of Object.entries(ui.read)) {
    pruned.read[id] = at;
  }
  if (changed) saveDropdownUiState(pruned);

  return items
    .filter((item) => {
      const until = pruned.snooze[item.id];
      return !until || now >= until;
    })
    .map((item) => ({
      ...item,
      isRead: Boolean(pruned.read[item.id])
    }));
}

/**
 * Multi-layer notifications: escalation, sounds, feed, history, browser.
 */
export class NotificationService {
  /**
   * @param {() => import("../calendarState.js").CalendarState} getState
   * @param {object} [callbacks]
   */
  constructor(getState, callbacks = {}) {
    this.getState = getState;
    this.onFeedUpdate = callbacks.onFeedUpdate ?? (() => {});
    this.onHistoryUpdate = callbacks.onHistoryUpdate ?? (() => {});
    this.onNavigate = callbacks.onNavigate ?? (() => {});

    this.inApp = new InAppAlert();
    this.sound = new SoundManager();
    this._interval = null;
    this._fastTick = false;
    this._fired = this._loadFired();
    this._lastFeed = [];

    this._onDropdownAction = () => this.tick();
    document.addEventListener("calendar3d-dropdown-action", this._onDropdownAction);
  }

  start() {
    if (this._interval) return;
    this.tick();
    this._interval = setInterval(() => this.tick(), this._tickMs());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.tick();
    });
  }

  /** Faster polling while the notification wall is open. */
  setFastTick(enabled) {
    this._fastTick = Boolean(enabled);
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = setInterval(() => this.tick(), this._tickMs());
    this.tick();
  }

  _tickMs() {
    return this._fastTick ? 5000 : 15000;
  }

  destroy() {
    document.removeEventListener("calendar3d-dropdown-action", this._onDropdownAction);
    this.stop();
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  getFeed() {
    return this._lastFeed;
  }

  getHistory() {
    return loadNotificationHistory();
  }

  tick() {
    const state = this.getState();
    if (!state) return;

    const settings = loadNotificationSettings();
    const now = Date.now();

    const rawFeed = buildDropdownFeed(state, now);
    this._lastFeed = applyDropdownUiState(rawFeed, now);
    this.onFeedUpdate(this._lastFeed);

    this._processEscalations(state, now, settings);

    this.onHistoryUpdate(loadNotificationHistory());
  }

  _processEscalations(state, now, settings) {
    const due = getDueEscalations(state, now);

    for (const ev of due) {
      if (this._fired.has(ev.fireKey)) continue;

      const levelEnabled =
        (ev.level === "soft" && settings.enableSoft) ||
        (ev.level === "medium" && settings.enableMedium) ||
        (ev.level === "urgent" && settings.enableUrgent) ||
        (ev.level === "final" && settings.enableFinal);

      if (!levelEnabled) {
        this._markFired(ev.fireKey);
        continue;
      }

      this._markFired(ev.fireKey);
      this._dispatch(ev, settings);
    }
  }

  _dispatch(ev, settings) {
    const title = `${this._typeLabel(ev.type)} — ${ev.date} ${this._fmtHour(ev.hour)}`;
    const body = ev.message || ev.title;

    const historyEntry = {
      sourceId: ev.sourceId,
      type: ev.type,
      level: ev.level,
      triggerAt: ev.triggerAt,
      date: ev.date,
      dayId: ev.dayId,
      hour: ev.hour,
      message: body,
      title: ev.title,
      wall: ev.wall
    };
    appendNotificationHistory(historyEntry);
    this.onHistoryUpdate(loadNotificationHistory());

    const feedId = `feed-${ev.sourceId}`;

    if (document.visibilityState === "visible") {
      this.inApp.show({
        title: ev.title || title,
        message: body,
        kind: ev.type,
        level: ev.level,
        feedId,
        onSnooze:
          ev.type === "alarm"
            ? (duration, id) => {
                snoozeDropdownItem(id, duration);
                this.tick();
              }
            : undefined
      });
    }

    if (ev.type === "alarm" && ev.level === "final") {
      this.sound.playMorningBuzzer();
    } else {
      this.sound.playForLevel(ev.level);
    }

    if (settings.enableBrowser) {
      this._browserNotify(ev.title || title, body, ev.type);
    }
  }

  /**
   * @param {{ dayId: string, hour: number, wall: string, type: string }} target
   */
  navigateTo(target) {
    this.onNavigate(target);
  }

  async requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return Notification.requestPermission();
  }

  testSound(themeId) {
    this.sound.playTheme(themeId);
  }

  _browserNotify(title, message, kind) {
    if (Notification?.permission !== "granted") return;
    // Only raise an OS banner when the app isn't in the foreground (the in-app
    // toast covers the visible case) — same as other apps.
    if (document.visibilityState === "visible") return;
    // Use the service worker's showNotification: on Android installed PWAs the
    // `new Notification()` constructor is a silent no-op, so this is what makes
    // the heads-up banner + notification-shade entry actually appear.
    showLocalNotification(title, { body: message, kind }).catch(() => {});
  }

  _typeLabel(kind) {
    const m = {
      reminder: "Reminder",
      alarm: "Alarm",
      appointment: "Appointment",
      note: "Note"
    };
    return m[kind] ?? "Event";
  }

  _fmtHour(h) {
    return `${String(h).padStart(2, "0")}:00`;
  }

  _loadFired() {
    try {
      const raw = localStorage.getItem(FIRED_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return new Set();
  }

  _markFired(id) {
    this._fired.add(id);
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify([...this._fired].slice(-800)));
    } catch {
      /* ignore */
    }
  }
}
