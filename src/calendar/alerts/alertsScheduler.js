import {
  loadAlerts,
  markAlertPhaseFired,
  buildScheduleTriggers,
  syncAlertsBadge
} from "./alertsModel.js";
import { playAlertSound } from "./alertSounds.js";
import { handleSystemEvent } from "./InklingAI.js";

export { buildScheduleTriggers, getLeadMinutesForPriority } from "./alertsModel.js";

let tickTimer = null;
/** @type {((alert: import("./alertsModel.js").AlertRecord, trigger: import("./alertsModel.js").ScheduledTrigger) => void) | null} */
let onTriggerHandler = null;

/**
 * @param {{
 *   onTrigger?: (alert: import("./alertsModel.js").AlertRecord, trigger: import("./alertsModel.js").ScheduledTrigger) => void,
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
  syncAlertsBadge();
  document.dispatchEvent(new CustomEvent("inkling:alerts-tick", { detail: { now } }));

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

      handleSystemEvent({ type: "alertTriggered", alert, trigger });

      document.dispatchEvent(
        new CustomEvent("inkling:alert-fired", {
          detail: { alert, trigger }
        })
      );
    }
  }
}
