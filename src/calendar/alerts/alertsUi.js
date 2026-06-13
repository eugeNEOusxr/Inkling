/**
 * Shared alerts UI helpers (Milestone 2.3): formatters, badge refresh, §7.5 toast on bus.
 */

import * as bus from "../../utils/EventBus.js";
import { InAppAlert } from "../notifications/InAppAlert.js";
import {
  dismissAlert,
  getTimeUntil,
  snoozeAlert,
  syncAlertsBadge,
  todayDateString
} from "./alertsModel.js";
import { formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";

/** @type {InAppAlert | null} */
let toast = null;
let initialized = false;

/**
 * §7.3 upcoming relative label.
 * @param {number} triggerAt
 * @param {number} [now]
 */
export function formatUpcomingUntilLabel(triggerAt, now = Date.now()) {
  const raw = getTimeUntil(triggerAt, now);
  if (raw === "now") return "now";
  if (raw === "less than a minute") return "in less than a minute";
  if (raw.startsWith("in ")) return raw;
  return `in ${raw}`;
}

/**
 * §7.6 missed / past relative label.
 * @param {number} triggerAt
 * @param {number} [now]
 */
export function formatMissedLabel(triggerAt, now = Date.now()) {
  const diff = now - triggerAt;
  if (diff < 60_000) return "missed just now";
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/**
 * @param {import("./alertsModel.js").AlertRecord} alert
 */
export function resolveAlertNavigateDate(alert) {
  return alert.date ?? todayDateString();
}

/**
 * Show a native OS notification for a fired alert (best-effort; no-op unless
 * the user has granted Notification permission).
 * @param {import("./alertsModel.js").AlertRecord} [alert]
 */
function fireBrowserNotification(alert) {
  try {
    if (!alert || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const title = alert.text || "Reminder";
    const when = alert.time ? ` · ${formatTimelineDisplayTime(alert.time)}` : "";
    const n = new Notification("⏰ Inkling reminder", {
      body: `${title}${when}`,
      tag: `inkling-alert-${alert.id ?? title}`,
      requireInteraction: alert.priority >= 3
    });
    n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
  } catch { /* ignore */ }
}

/**
 * Wire canonical bus → badge + §7.5 popup toast (single surface).
 */
export function initAlertsUi() {
  if (initialized) return;
  initialized = true;
  toast = new InAppAlert();

  const refreshBadge = () => syncAlertsBadge();

  bus.on("alertTriggered", (payload) => {
    refreshBadge();
    const alert = payload?.alert;
    if (alert?.kind === "popup") {
      toast?.showTimelineAlert({
        alert,
        trigger: payload?.trigger
      });
    }
    // Fire a real OS notification too (so it lands even when the tab is in the
    // background). Browsers only deliver these once the user has granted
    // permission — we prompt for that on reminder creation.
    fireBrowserNotification(alert);
  });
  bus.on("eventUpdated", refreshBadge);
  bus.on("eventDeleted", refreshBadge);
  bus.on("eventCreated", refreshBadge);
}
