/**
 * Alerts scheduler (§7.2 B3): single `setTimeout` to soonest trigger + `visibilitychange` recompute.
 * Emits `alertTriggered` on the canonical bus (§13.2); UI subscribes in 2.3 (`alertsUi` / AlertsDropdown).
 */

import * as bus from "../../utils/EventBus.js";
import { getEventById } from "../../wordweaver/timelineModel.js";
import {
  loadAlerts,
  markAlertPhaseFired,
  removeAlertsForEntry,
  buildScheduleTriggers,
  syncAlertsBadge,
  clampSchedulerDelayMs,
  CATCH_WINDOW_MS,
  SCHEDULE_HORIZON_MS
} from "./alertsModel.js";
import { playAlertSound } from "./alertSounds.js";

export { buildScheduleTriggers, getLeadMinutesForPriority } from "./alertsModel.js";

/** @type {ReturnType<typeof setTimeout> | null} */
let armTimer = null;
/** @type {Array<() => void>} */
let busDisposers = [];
let started = false;
let visibilityAttached = false;
let firing = false;

/**
 * @param {number} [now]
 * @returns {{ alert: import("./alertsModel.js").AlertRecord, trigger: import("./alertsModel.js").ScheduledTrigger } | null}
 */
export function getSoonestArmableTrigger(now = Date.now()) {
  const horizonEnd = now + SCHEDULE_HORIZON_MS;
  /** @type {{ alert: import("./alertsModel.js").AlertRecord, trigger: import("./alertsModel.js").ScheduledTrigger } | null} */
  let best = null;

  for (const alert of loadAlerts().filter((a) => !a.dismissed)) {
    const fired = new Set(alert.firedPhases ?? []);
    for (const trigger of buildScheduleTriggers(alert)) {
      if (fired.has(trigger.phase)) continue;
      if (trigger.fireAt > horizonEnd) continue;
      if (trigger.fireAt < now - CATCH_WINDOW_MS) continue;
      if (!best || trigger.fireAt < best.trigger.fireAt) {
        best = { alert, trigger };
      }
    }
  }

  return best;
}

function clearArmTimer() {
  if (armTimer != null) {
    clearTimeout(armTimer);
    armTimer = null;
  }
}

/**
 * @param {import("./alertsModel.js").AlertRecord} alert
 * @param {import("./alertsModel.js").ScheduledTrigger} trigger
 * @param {number} now
 */
function fireAlertTrigger(alert, trigger, now) {
  if (firing) return;
  firing = true;
  try {
    const fresh = loadAlerts().find((a) => a.id === alert.id);
    if (!fresh || fresh.dismissed) return;
    if ((fresh.firedPhases ?? []).includes(trigger.phase)) return;

    if (!markAlertPhaseFired(fresh.id, trigger.phase)) return;

    const event = fresh.timelineEntryId ? getEventById(fresh.timelineEntryId) : null;
    if (fresh.timelineEntryId && !event) return;

    const payload = { event: event ?? fresh, alert: fresh, trigger, firedAt: now };
    bus.emit("alertTriggered", payload);

    if (fresh.kind === "sound") {
      playAlertSound(fresh.priority);
    }
  } finally {
    firing = false;
  }
}

/**
 * Fire all triggers due within the catch window, then re-arm.
 * @param {number} [now]
 */
export function processDueTriggers(now = Date.now()) {
  syncAlertsBadge();

  for (const alert of loadAlerts().filter((a) => !a.dismissed)) {
    const fired = new Set(alert.firedPhases ?? []);
    for (const trigger of buildScheduleTriggers(alert)) {
      if (fired.has(trigger.phase)) continue;
      if (trigger.fireAt > now) continue;
      if (now - trigger.fireAt > CATCH_WINDOW_MS) continue;
      fireAlertTrigger(alert, trigger, now);
    }
  }
}

/**
 * Rebuild the single pending timer (§7.2 B3).
 * @param {number} [now]
 */
export function recomputeSchedule(now = Date.now()) {
  clearArmTimer();
  syncAlertsBadge();

  const next = getSoonestArmableTrigger(now);
  if (!next) return;

  const msUntil = clampSchedulerDelayMs(next.trigger.fireAt - now);
  armTimer = setTimeout(() => {
    armTimer = null;
    const at = Date.now();
    processDueTriggers(at);
    recomputeSchedule(at);
  }, msUntil);
}

/**
 * @param {{ id?: string }} payload
 */
function onEventDeleted(payload) {
  const id = String(payload?.id ?? "");
  if (!id) return;
  removeAlertsForEntry(id);
  recomputeSchedule();
}

function attachVisibilityRecompute() {
  if (visibilityAttached || typeof document === "undefined") return;
  visibilityAttached = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      processDueTriggers();
      recomputeSchedule();
    }
  });
}

/**
 * Start bus-driven scheduling (no 15s poll while active).
 * @param {{ onTrigger?: Function }} [opts] legacy hook — prefer bus `alertTriggered`
 */
export function startAlertsScheduler(opts = {}) {
  void opts;
  if (started) {
    recomputeSchedule();
    return;
  }
  started = true;

  busDisposers = [
    bus.on("initialized", () => recomputeSchedule()),
    bus.on("eventCreated", () => recomputeSchedule()),
    bus.on("eventUpdated", () => recomputeSchedule()),
    bus.on("eventDeleted", onEventDeleted)
  ];

  attachVisibilityRecompute();
  recomputeSchedule();
}

export function stopAlertsScheduler() {
  clearArmTimer();
  for (const dispose of busDisposers) dispose();
  busDisposers = [];
  started = false;
}

/**
 * @deprecated Use `recomputeSchedule` / internal timer. Kept for tests and manual refresh.
 * @param {number} [now]
 */
export function tickAlertsScheduler(now = Date.now()) {
  processDueTriggers(now);
  recomputeSchedule(now);
}

export function __testResetAlertsScheduler() {
  stopAlertsScheduler();
  firing = false;
  visibilityAttached = false;
}

export function __testIsSchedulerStarted() {
  return started;
}

export function __testHasPendingTimer() {
  return armTimer != null;
}
