import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as canonicalBus from "../../src/utils/EventBus.js";
import {
  __testResetTimelineModel,
  __testMigrateStoredRecord,
  initTimelineModel,
  createEvent,
  updateEvent,
  deleteEvent,
  bulkCreateEvents,
  TimelineValidationError,
  buildStartTimeIso
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

function readCanonicalStore() {
  const raw = store.get("inkling-timeline-v1");
  return raw ? JSON.parse(raw) : [];
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  installMockStorage();
  __testResetTimelineModel();
});

test("initTimelineModel loads starter data when store empty", () => {
  const events = [];
  canonicalBus.on("initialized", (p) => events.push(p));
  initTimelineModel();
  const stored = readCanonicalStore();
  assert.ok(stored.length >= 8 && stored.length <= 12);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventCount, stored.length);
});

test("createEvent assigns UUID shape fields and persists", () => {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();

  const created = [];
  canonicalBus.on("eventCreated", (e) => created.push(e));

  const event = createEvent({
    title: "Test note",
    body: "Body text",
    startTime: buildStartTimeIso("2026-06-03", "10:30"),
    category: "work"
  });

  assert.ok(event.id.length > 8);
  assert.equal(event.title, "Test note");
  assert.ok(event.createdAt);
  assert.ok(event.updatedAt);
  assert.equal(created.length, 1);

  const stored = readCanonicalStore();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].title, "Test note");
});

test("createEvent rejects empty title", () => {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();
  assert.throws(
    () =>
      createEvent({
        title: "   ",
        body: "x",
        startTime: buildStartTimeIso("2026-06-03", "09:00")
      }),
    TimelineValidationError
  );
  assert.equal(readCanonicalStore().length, 0);
});

test("updateEvent preserves createdAt and bumps updatedAt", () => {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();

  const event = createEvent({
    title: "Original",
    body: "a",
    startTime: buildStartTimeIso("2026-06-03", "09:00")
  });
  const createdAt = event.createdAt;

  const updated = updateEvent(event.id, { title: "Renamed" });
  assert.equal(updated.createdAt, createdAt);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(createdAt));
  assert.equal(updated.title, "Renamed");
});

test("deleteEvent removes and emits once; unknown id is no-op", () => {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();

  const deleted = [];
  canonicalBus.on("eventDeleted", (p) => deleted.push(p));

  const event = createEvent({
    title: "Gone",
    body: "x",
    startTime: buildStartTimeIso("2026-06-03", "11:00")
  });

  deleteEvent(event.id);
  assert.equal(readCanonicalStore().length, 0);
  assert.equal(deleted.length, 1);

  deleteEvent("missing-id");
  assert.equal(deleted.length, 1);
});

test("bulkCreateEvents is all-or-nothing", () => {
  installMockStorage();
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();

  assert.throws(
    () =>
      bulkCreateEvents([
        {
          title: "OK",
          body: "a",
          startTime: buildStartTimeIso("2026-06-03", "08:00")
        },
        {
          title: "",
          body: "bad",
          startTime: buildStartTimeIso("2026-06-03", "09:00")
        }
      ]),
    TimelineValidationError
  );

  const stored = readCanonicalStore();
  assert.equal(stored.length, 0);
});

test("legacy timeline entry migrates to Event shape", () => {
  const legacy = {
    id: "tw-legacy-1",
    time: "14:30",
    label: "Note",
    text: "Legacy body",
    category: "study",
    date: "2026-01-15"
  };
  const event = __testMigrateStoredRecord(legacy, "tw-legacy-1");
  assert.ok(event);
  assert.equal(event.body, "Legacy body");
  assert.ok(event.startTime.includes("2026-01-15"));
  assert.equal(event.endTime, null);
  assert.equal(event.priority, 1);
});

test("corrupt storage yields empty on init", () => {
  store.set("inkling-timeline-v1", "{not-json");
  localStorage.setItem("inkling-has-user-notes", "true");
  __testResetTimelineModel();
  initTimelineModel();
  assert.equal(readCanonicalStore().length, 0);
});
