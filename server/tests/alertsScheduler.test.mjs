import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as bus from "../../src/utils/EventBus.js";
import {
  __testResetAlertsModel,
  __testSetAlertsStorageGuardOverride,
  addAlert,
  createAlert,
  dismissAlert,
  snoozeAlert,
  loadAlerts,
  getMissedAlerts,
  getUpcomingAlerts,
  markAlertPhaseFired,
  AlertPriority,
  CATCH_WINDOW_MS
} from "../../src/calendar/alerts/alertsModel.js";
import {
  __testResetAlertsScheduler,
  startAlertsScheduler,
  tickAlertsScheduler,
  recomputeSchedule,
  processDueTriggers,
  __testHasPendingTimer
} from "../../src/calendar/alerts/alertsScheduler.js";
import {
  __testResetTimelineModel,
  initTimelineModel,
  createEvent,
  deleteEvent,
  buildStartTimeIso
} from "../../src/wordweaver/timelineModel.js";

/** @type {Map<string, string>} */
let store;

function installMockStorage() {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (k === "inkling-alerts-v1" && store.__quotaBlock) {
        const err = new DOMException("Quota exceeded", "QuotaExceededError");
        throw err;
      }
      store.set(k, v);
    },
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  store.__quotaBlock = false;
}

function alertAt(now, offsetMs, opts = {}) {
  const fire = new Date(now + offsetMs);
  const dateIso = `${fire.getFullYear()}-${String(fire.getMonth() + 1).padStart(2, "0")}-${String(fire.getDate()).padStart(2, "0")}`;
  const clock = `${String(fire.getHours()).padStart(2, "0")}:${String(fire.getMinutes()).padStart(2, "0")}`;
  return createAlert({
    time: clock,
    text: opts.text ?? "Test",
    date: dateIso,
    priority: opts.priority ?? AlertPriority.LOW,
    kind: opts.kind ?? "popup",
    timelineEntryId: opts.timelineEntryId
  });
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  __testResetAlertsModel();
  __testResetAlertsScheduler();
  initTimelineModel();
});

afterEach(() => {
  __testResetAlertsScheduler();
});

test("getUpcomingAlerts returns sorted upcoming phases", () => {
  const now = Date.parse("2026-07-01T10:00:00");
  addAlert(alertAt(now, 5 * 60_000, { text: "A" }));
  addAlert(alertAt(now, 60 * 60_000, { text: "B" }));
  const rows = getUpcomingAlerts(now);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].triggerAt <= rows[1].triggerAt);
});

test("eventDeleted removes linked alerts and prevents fire", () => {
  const now = Date.parse("2026-07-02T12:00:00");
  const event = createEvent({
    title: "Gone",
    body: "x",
    startTime: buildStartTimeIso("2026-07-02", "12:05")
  });
  addAlert(
    alertAt(now, 2 * 60_000, { text: "Linked", timelineEntryId: event.id, priority: AlertPriority.LOW })
  );

  const fired = [];
  bus.on("alertTriggered", (p) => fired.push(p));

  startAlertsScheduler();
  bus.emit("eventDeleted", { id: event.id });
  tickAlertsScheduler(now + 5 * 60_000);

  assert.equal(loadAlerts().length, 0);
  assert.equal(fired.length, 0);
});

test("tick fires alertTriggered once per phase with dedup", () => {
  const now = Date.parse("2026-07-03T14:00:00");
  const a = addAlert(
    alertAt(now, -1000, { text: "Due", priority: AlertPriority.LOW, kind: "sound" })
  );

  const fired = [];
  bus.on("alertTriggered", (p) => fired.push(p));

  tickAlertsScheduler(now);
  tickAlertsScheduler(now + 1000);

  assert.equal(fired.length, 1);
  assert.equal(fired[0].alert.id, a.id);
  assert.ok((loadAlerts().find((x) => x.id === a.id)?.firedPhases ?? []).includes("at_time"));
});

test("missed alerts are beyond catch window and not fired late", () => {
  const now = Date.parse("2026-07-04T08:00:00");
  addAlert(alertAt(now, -(CATCH_WINDOW_MS + 60_000), { text: "Old" }));

  const fired = [];
  bus.on("alertTriggered", () => fired.push(1));

  tickAlertsScheduler(now);
  const missed = getMissedAlerts(now);
  assert.equal(missed.length, 1);
  assert.equal(fired.length, 0);
});

test("snooze adds a future phase and dismiss removes from upcoming", () => {
  const now = Date.parse("2026-07-05T09:00:00");
  const a = addAlert(alertAt(now, 60 * 60_000, { text: "Later" }));

  snoozeAlert(a.id, 10, now);
  const afterSnooze = getUpcomingAlerts(now);
  assert.ok(afterSnooze.some((r) => r.alert.id === a.id));

  dismissAlert(a.id);
  assert.equal(getUpcomingAlerts(now).length, 0);
});

test("initialized arms a single pending timer via recomputeSchedule", () => {
  const now = Date.parse("2026-07-06T11:00:00");
  addAlert(alertAt(now, 30 * 60_000, { text: "Soon" }));

  startAlertsScheduler();
  recomputeSchedule(now);
  assert.equal(__testHasPendingTimer(), true);
});

test("saveAlerts surfaces storageFull and does not lose fired phase on quota", () => {
  const now = Date.parse("2026-07-07T10:00:00");
  const a = addAlert(alertAt(now, -500, { text: "Persist" }));

  const full = [];
  const offFull = bus.on("storageFull", (p) => full.push(p));

  __testSetAlertsStorageGuardOverride("full");
  const ok = markAlertPhaseFired(a.id, "at_time");
  offFull();
  assert.equal(ok, false);
  assert.equal(full.length, 1);

  __testSetAlertsStorageGuardOverride(null);
  assert.ok(!(loadAlerts().find((x) => x.id === a.id)?.firedPhases ?? []).includes("at_time"));
});

test("multi-phase CRITICAL fires at_time only once", () => {
  const now = Date.parse("2026-07-08T15:00:00");
  const eventTime = now + 60_000;
  const a = addAlert(
    alertAt(eventTime, 0, { text: "Critical", priority: AlertPriority.CRITICAL })
  );

  const fired = [];
  bus.on("alertTriggered", () => fired.push(1));

  processDueTriggers(eventTime);
  processDueTriggers(eventTime + 5000);

  const record = loadAlerts().find((x) => x.id === a.id);
  assert.equal((record?.firedPhases ?? []).filter((p) => p === "at_time").length, 1);
  assert.ok((record?.firedPhases ?? []).includes("at_time"));
  assert.ok(fired.length >= 1);
});

test("recomputeSchedule after fire re-arms for next alert", () => {
  const now = Date.parse("2026-07-09T12:00:00");
  addAlert(alertAt(now, -1000, { text: "First", priority: AlertPriority.LOW }));
  addAlert(alertAt(now, 10 * 60_000, { text: "Second", priority: AlertPriority.LOW }));

  startAlertsScheduler();
  recomputeSchedule(now);
  tickAlertsScheduler(now);
  recomputeSchedule(now + 2000);
  assert.equal(__testHasPendingTimer(), true);
});
