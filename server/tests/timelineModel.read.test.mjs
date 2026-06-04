import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __testResetTimelineModel,
  __testSetNowMs,
  __testSetSavedMonthFixture,
  __testReadMetrics,
  initTimelineModel,
  createEvent,
  buildStartTimeIso,
  getEventsForDate,
  getEventsForDay,
  getEventsForWeek,
  getEventsForMonth,
  getEventsForYear,
  getUnifiedEventsForDate,
  getUpcomingAlerts,
  getWeekStartMonday
} from "../../src/wordweaver/timelineModel.js";

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
  initTimelineModel();
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  bootEmpty();
});

test("getEventsForDate uses local startTime window and federates day-nodes", () => {
  createEvent({
    title: "Timeline note",
    body: "from store",
    startTime: buildStartTimeIso("2026-03-10", "10:00"),
    category: "work"
  });

  __testSetSavedMonthFixture({
    year: 2026,
    month: 3,
    dayDataByDate: {
      "2026-03-10": {
        id: "day-10",
        date: "2026-03-10",
        appointments: [
          { id: "ap-1", hour: 14, title: "Federated meeting", description: "" }
        ],
        reminders: [],
        alarms: [],
        threads: []
      }
    }
  });

  const day = getEventsForDate("2026-03-10");
  assert.equal(day.length, 2);
  assert.ok(day.some((e) => e.text.includes("from store") || e.title === "Timeline note"));
  assert.ok(day.some((e) => e.kind === "appointment"));
});

test("getEventsForDay matches getEventsForDate (0-based month)", () => {
  createEvent({
    title: "Same day",
    body: "x",
    startTime: buildStartTimeIso("2026-04-05", "09:00")
  });
  const viaDate = getEventsForDate("2026-04-05");
  const viaDay = getEventsForDay(2026, 3, 5);
  assert.equal(viaDay.length, viaDate.length);
  assert.equal(viaDay[0].id, viaDate[0].id);
});

test("getEventsForMonth loads saved month once (not per-day)", () => {
  for (let day = 1; day <= 12; day++) {
    createEvent({
      title: `D${day}`,
      body: "m",
      startTime: buildStartTimeIso(`2026-05-${String(day).padStart(2, "0")}`, "08:00")
    });
  }
  __testReadMetrics.loadSavedMonthCalls = 0;
  const month = getEventsForMonth(2026, 5);
  assert.equal(month.length, 12);
  assert.equal(__testReadMetrics.loadSavedMonthCalls, 1);
});

test("getEventsForWeek uses at most two month loads across a boundary", () => {
  createEvent({
    title: "Week event",
    body: "w",
    startTime: buildStartTimeIso("2026-01-05", "12:00")
  });
  __testReadMetrics.loadSavedMonthCalls = 0;
  const week = getEventsForWeek("2026-01-05");
  assert.ok(week.length >= 1);
  assert.ok(__testReadMetrics.loadSavedMonthCalls <= 2);
});

test("getEventsForYear filters in one timeline pass", () => {
  createEvent({
    title: "In year",
    body: "y",
    startTime: buildStartTimeIso("2026-07-04", "09:00")
  });
  createEvent({
    title: "Other year",
    body: "n",
    startTime: buildStartTimeIso("2025-07-04", "09:00")
  });
  const year = getEventsForYear(2026);
  assert.equal(year.length, 1);
  assert.equal(year[0].title, "In year");
});

test("getUnifiedEventsForDate stable sort: startTime, priority, title", () => {
  const noon = buildStartTimeIso("2026-06-01", "12:00");
  createEvent({
    title: "B",
    body: "b",
    startTime: noon,
    priority: 1
  });
  createEvent({
    title: "A",
    body: "a",
    startTime: noon,
    priority: 2
  });
  const unified = getUnifiedEventsForDate("2026-06-01");
  assert.equal(unified[0].title, "A");
  assert.equal(unified[1].title, "B");
});

test("read helpers are pure (mutating result does not change store)", () => {
  const event = createEvent({
    title: "Immutable",
    body: "x",
    startTime: buildStartTimeIso("2026-08-01", "09:00")
  });
  const day = getEventsForDate("2026-08-01");
  day[0].text = "MUTATED";
  const again = getEventsForDate("2026-08-01");
  assert.equal(again[0].title, "Immutable");
  assert.equal(event.body, "x");
});

test("getUpcomingAlerts respects window and fake clock", () => {
  const fixed = Date.parse("2026-06-10T12:00:00");
  __testSetNowMs(fixed);

  createEvent({
    title: "Soon",
    body: "a",
    startTime: buildStartTimeIso("2026-06-10", "12:30"),
    alerts: [{ time: new Date(fixed + 5 * 60_000).toISOString(), kind: "popup" }]
  });
  createEvent({
    title: "Later",
    body: "b",
    startTime: buildStartTimeIso("2026-06-11", "09:00"),
    alerts: [{ time: new Date(fixed + 2 * 60 * 60_000).toISOString(), kind: "popup" }]
  });
  createEvent({
    title: "Dismissed",
    body: "c",
    startTime: buildStartTimeIso("2026-06-10", "13:00"),
    alerts: [
      {
        time: new Date(fixed + 10 * 60_000).toISOString(),
        kind: "popup",
        dismissed: true
      }
    ]
  });

  const rows = getUpcomingAlerts(20, fixed);
  assert.equal(
    rows.filter((r) => r.event.title === "Soon").length,
    1,
    `unexpected rows: ${rows.map((r) => r.event.title).join(",")}`
  );
  assert.equal(rows.filter((r) => r.event.title === "Dismissed").length, 0);
});

test("getEventsForMonth on ~400 events stays under timing budget", () => {
  const partials = [];
  for (let i = 0; i < 400; i++) {
    const day = (i % 28) + 1;
    partials.push({
      title: `E${i}`,
      body: "p",
      startTime: buildStartTimeIso(
        `2026-09-${String(day).padStart(2, "0")}`,
        `${String(8 + (i % 10)).padStart(2, "0")}:00`
      )
    });
  }
  for (const p of partials) createEvent(p);

  __testReadMetrics.loadSavedMonthCalls = 0;
  const t0 = performance.now();
  const month = getEventsForMonth(2026, 9);
  const elapsed = performance.now() - t0;

  assert.equal(month.length, 400);
  assert.equal(__testReadMetrics.loadSavedMonthCalls, 1);
  assert.ok(elapsed < 250, `month read took ${elapsed}ms`);
});

test("getWeekStartMonday returns Monday ISO for mid-week date", () => {
  const monday = getWeekStartMonday(new Date(2026, 5, 10));
  assert.equal(monday, "2026-06-08");
});
