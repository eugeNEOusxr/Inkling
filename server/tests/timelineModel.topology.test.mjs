import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __testResetTimelineModel,
  initTimelineModel,
  createEvent,
  buildStartTimeIso,
  getYearTopology
} from "../../src/wordweaver/timelineModel.js";
import { __testResetAlertsModel } from "../../src/calendar/alerts/alertsModel.js";

/** @type {Map<string, string>} */
let store;

function installMockStorage() {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

function bootEmpty() {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  __testResetAlertsModel();
  initTimelineModel();
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  bootEmpty();
});

test("getYearTopology counts notes per month and per day", () => {
  createEvent({ title: "A", body: "a", startTime: buildStartTimeIso("2026-01-05", "09:00") });
  createEvent({ title: "B", body: "b", startTime: buildStartTimeIso("2026-01-05", "14:00") });
  createEvent({ title: "C", body: "c", startTime: buildStartTimeIso("2026-03-20", "10:00") });

  const topo = getYearTopology(2026);
  assert.equal(topo.year, 2026);
  assert.equal(topo.total, 3);
  assert.equal(topo.monthCounts.length, 12);
  assert.equal(topo.monthCounts[0], 2); // January
  assert.equal(topo.monthCounts[2], 1); // March
  assert.equal(topo.monthCounts[6], 0); // July empty
  assert.equal(topo.dayCounts["2026-01-05"], 2);
  assert.equal(topo.dayCounts["2026-03-20"], 1);
  assert.equal(topo.maxDayCount, 2);
});

test("getYearTopology flags the busiest month", () => {
  createEvent({ title: "x", body: "x", startTime: buildStartTimeIso("2026-02-01", "09:00") });
  for (let d = 1; d <= 4; d++) {
    createEvent({
      title: `n${d}`,
      body: "n",
      startTime: buildStartTimeIso(`2026-09-0${d}`, "09:00")
    });
  }
  const topo = getYearTopology(2026);
  assert.equal(topo.busiestMonthIndex, 8); // September, 0-based
  assert.equal(topo.maxMonthCount, 4);
});

test("getYearTopology is empty-safe", () => {
  const topo = getYearTopology(2026);
  assert.equal(topo.total, 0);
  assert.equal(topo.busiestMonthIndex, -1);
  assert.equal(topo.maxMonthCount, 0);
  assert.equal(topo.maxDayCount, 0);
  assert.deepEqual(topo.monthCounts, new Array(12).fill(0));
  assert.deepEqual(topo.dayCounts, {});
});

test("getYearTopology isolates the requested year", () => {
  createEvent({ title: "in", body: "y", startTime: buildStartTimeIso("2026-05-05", "09:00") });
  createEvent({ title: "out", body: "n", startTime: buildStartTimeIso("2025-05-05", "09:00") });
  const topo = getYearTopology(2026);
  assert.equal(topo.total, 1);
  assert.equal(topo.monthCounts[4], 1);
  assert.equal(topo.dayCounts["2025-05-05"], undefined);
});
