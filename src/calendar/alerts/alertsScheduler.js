import {
  AlertPriority,
  loadAlerts,
  markAlertPhaseFired,
  todayDateString
} from "./alertsModel.js";
import { playAlertSound } from "./alertSounds.js";

/** @typedef {{ alertId: string, fireAt: number, leadMinutes: number, phase: string }} ScheduledTrigger */

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
 * @param {import("./alertsModel.js").AlertRecord} alert
 * @param {string} [referenceDate]
 * @returns {ScheduledTrigger[]}
 */
export function buildScheduleTriggers(alert, referenceDate = alert.date ?? todayDateString()) {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const [hh, mm] = String(alert.time ?? "09:00").match(/(\d{1,2}):(\d{2})/)?.slice(1) ?? ["9", "0"];
  const base = new Date(y, m - 1, d, Number(hh), Number(mm), 0, 0).getTime();
  const leads = getLeadMinutesForPriority(alert.priority);

  return leads.map((leadMinutes) => {
    const phase = leadMinutes === 0 ? "at_time" : `before_${leadMinutes}`;
    return {
      alertId: alert.id,
      fireAt: base - leadMinutes * 60 * 1000,
      leadMinutes,
      phase
    };
  });
}

let tickTimer = null;
/** @type {((alert: import("./alertsModel.js").AlertRecord, trigger: ScheduledTrigger) => void) | null} */
let onTriggerHandler = null;

/**
 * @param {{
 *   onTrigger?: (alert: import("./alertsModel.js").AlertRecord, trigger: ScheduledTrigger) => void,
 *   intervalMs?: number
 * }} [opts]
 */
export function startAlertsScheduler(opts = {}) {
  onTriggerHandler = opts.onTrigger ?? null;
  if (tickTimer) return;
  const interval = opts.intervalMs ?? 15_000;
  tickTimer = setInterval(() => tickAlertsScheduler(), interval);
  tickAlertsScheduler();
}

export function stopAlertsScheduler() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

/**
 * Check due triggers and fire sounds + callbacks.
 */
export function tickAlertsScheduler(now = Date.now()) {
  const alerts = loadAlerts().filter((a) => !a.dismissed);
  const windowMs = 90_000;

  for (const alert of alerts) {
    const triggers = buildScheduleTriggers(alert);
    const fired = new Set(alert.firedPhases ?? []);

    for (const trigger of triggers) {
      if (fired.has(trigger.phase)) continue;
      if (trigger.fireAt > now) continue;
      if (now - trigger.fireAt > windowMs) continue;

      markAlertPhaseFired(alert.id, trigger.phase);
      playAlertSound(alert.priority);
      onTriggerHandler?.(alert, trigger);
      document.dispatchEvent(
        new CustomEvent("inkling:alert-fired", {
          detail: { alert, trigger }
        })
      );
    }
  }
}
