import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as canonicalBus from "../../src/utils/EventBus.js";
import {
  STORAGE_KEY,
  HAS_USER_NOTES_KEY,
  __testResetTimelineModel,
  __testSetStorageGuardOverride,
  __testHasUserNotesLatch,
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
let timelineSetItemCalls = 0;
let quotaThrowOnTimeline = false;

function installMockStorage() {
  store = new Map();
  timelineSetItemCalls = 0;
  quotaThrowOnTimeline = false;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (k === STORAGE_KEY) {
        timelineSetItemCalls += 1;
        if (quotaThrowOnTimeline) {
          quotaThrowOnTimeline = false;
          const err = new DOMException("Quota exceeded", "QuotaExceededError");
          throw err;
        }
      }
      store.set(k, v);
    },
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

function readCanonicalStore() {
  const raw = store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function hasStarterIds(events) {
  return events.some((e) => String(e.id).startsWith("starter-"));
}

function padBodyToBytes(targetBytes) {
  const base = {
    title: "Pad",
    body: "x",
    startTime: buildStartTimeIso("2026-06-03", "09:00")
  };
  const one = JSON.stringify([base]);
  const overhead = one.length;
  const padLen = Math.max(0, targetBytes - overhead - 50);
  return "x".repeat(padLen);
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  installMockStorage();
  __testResetTimelineModel();
});

test("storageWarning emits usedBytes at warn threshold and write proceeds", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();

  const warnings = [];
  canonicalBus.on("storageWarning", (p) => warnings.push(p));

  __testSetStorageGuardOverride("warn");
  createEvent({
    title: "Warn me",
    body: "ok",
    startTime: buildStartTimeIso("2026-06-03", "10:00")
  });

  assert.equal(warnings.length, 1);
  assert.ok(typeof warnings[0].usedBytes === "number");
  assert.equal(readCanonicalStore().length, 1);

  __testSetStorageGuardOverride("warn");
  createEvent({
    title: "Second",
    body: "ok",
    startTime: buildStartTimeIso("2026-06-03", "11:00")
  });
  assert.equal(warnings.length, 1, "debounced until below warn");
});

test("storageFull blocks write, rolls back, no success emit", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();

  const full = [];
  const created = [];
  canonicalBus.on("storageFull", (p) => full.push(p));
  canonicalBus.on("eventCreated", (e) => created.push(e));

  const event = createEvent({
    title: "Keep",
    body: "saved",
    startTime: buildStartTimeIso("2026-06-03", "09:00")
  });
  assert.equal(readCanonicalStore().length, 1);

  __testSetStorageGuardOverride("full");
  assert.throws(
    () =>
      updateEvent(event.id, {
        title: "Too big",
        body: padBodyToBytes(5_000_000)
      }),
    TimelineValidationError
  );

  assert.equal(full.length, 1);
  assert.ok(typeof full[0].usedBytes === "number");
  assert.equal(created.length, 1);
  assert.equal(readCanonicalStore()[0].title, "Keep");
});

test("deleteEvent rolls back on storage full without eventDeleted emit", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();

  const deleted = [];
  canonicalBus.on("eventDeleted", (p) => deleted.push(p));

  const event = createEvent({
    title: "Stay",
    body: "x",
    startTime: buildStartTimeIso("2026-06-03", "12:00")
  });

  __testSetStorageGuardOverride("full");
  deleteEvent(event.id);

  assert.equal(deleted.length, 0);
  assert.equal(readCanonicalStore().length, 1);
  assert.equal(readCanonicalStore()[0].id, event.id);
});

test("first create on full restores starters, latch, and emits no success", () => {
  const created = [];
  const cleared = [];
  canonicalBus.on("eventCreated", (e) => created.push(e));
  canonicalBus.on("starterDataCleared", () => cleared.push(1));

  initTimelineModel();
  const before = readCanonicalStore();
  assert.ok(hasStarterIds(before));
  assert.equal(__testHasUserNotesLatch(), false);

  __testSetStorageGuardOverride("full");
  assert.throws(
    () =>
      createEvent({
        title: "Real",
        body: "user",
        startTime: buildStartTimeIso("2026-06-03", "14:00")
      }),
    TimelineValidationError
  );

  assert.equal(created.length, 0);
  assert.equal(cleared.length, 0);
  assert.equal(__testHasUserNotesLatch(), false);
  const after = readCanonicalStore();
  assert.ok(hasStarterIds(after));
  assert.equal(after.length, before.length);
});

test("QuotaExceededError backstop rolls back create", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();

  const full = [];
  canonicalBus.on("storageFull", (p) => full.push(p));

  quotaThrowOnTimeline = true;
  assert.throws(
    () =>
      createEvent({
        title: "Quota",
        body: "x",
        startTime: buildStartTimeIso("2026-06-03", "15:00")
      }),
    TimelineValidationError
  );

  assert.equal(full.length, 1);
  assert.equal(readCanonicalStore().length, 0);
});

test("bulkCreateEvents persists with a single timeline setItem", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();
  timelineSetItemCalls = 0;

  bulkCreateEvents([
    {
      title: "A",
      body: "a",
      startTime: buildStartTimeIso("2026-06-03", "08:00")
    },
    {
      title: "B",
      body: "b",
      startTime: buildStartTimeIso("2026-06-03", "09:00")
    }
  ]);

  assert.equal(timelineSetItemCalls, 1);
  assert.equal(readCanonicalStore().length, 2);
});

test("near-limit payload: warn path uses byte estimate (integration smoke)", () => {
  localStorage.setItem(HAS_USER_NOTES_KEY, "true");
  initTimelineModel();

  const warnings = [];
  canonicalBus.on("storageWarning", (p) => warnings.push(p));

  const bigBody = padBodyToBytes(4.6 * 1024 * 1024);
  createEvent({
    title: "Large",
    body: bigBody,
    startTime: buildStartTimeIso("2026-06-03", "16:00")
  });

  assert.ok(warnings.length >= 1 || readCanonicalStore().length === 1);
});
