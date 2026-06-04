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
  });
  bus.on("eventUpdated", refreshBadge);
  bus.on("eventDeleted", refreshBadge);
  bus.on("eventCreated", refreshBadge);
}
