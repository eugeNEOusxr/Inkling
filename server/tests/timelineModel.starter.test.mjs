import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as canonicalBus from "../../src/utils/EventBus.js";
import {
  __testResetTimelineModel,
  __testSetNowMs,
  __testHasUserNotesLatch,
  initTimelineModel,
  createEvent,
  bulkCreateEvents,
  buildStarterEventPartials,
  buildStartTimeIso,
  HAS_USER_NOTES_KEY,
  LEGACY_HAS_USER_NOTES_KEY,
  STORAGE_KEY
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

function readStore() {
  const raw = store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  installMockStorage();
  __testResetTimelineModel();
  __testSetNowMs(Date.parse("2026-06-15T12:00:00"));
});

test("buildStarterEventPartials yields 10 validate-ready events across months", () => {
  const partials = buildStarterEventPartials(Date.parse("2026-06-15T12:00:00"));
  assert.ok(partials.length >= 8 && partials.length <= 12);
  assert.equal(partials.length, 10);
  assert.ok(partials.every((p) => String(p.id).startsWith("starter-")));
  assert.ok(partials.some((p) => p.priority === 3));
  assert.ok(partials.some((p) => (p.alerts ?? []).length > 0));
  const months = new Set(
    partials.map((p) => p.startTime.slice(0, 7))
  );
  assert.ok(months.size >= 2, "expected spread across adjacent months");
});

test("fresh install: absent timeline key seeds starter, latch stays false", () => {
  const inits = [];
  canonicalBus.on("initialized", (p) => inits.push(p));

  initTimelineModel();

  const stored = readStore();
  assert.equal(stored.length, 10);
  assert.ok(stored.every((e) => String(e.id).startsWith("starter-")));
  assert.equal(__testHasUserNotesLatch(), false);
  assert.equal(inits.length, 1);
  assert.equal(inits[0].eventCount, 10);
  assert.ok(store.has(STORAGE_KEY));
});

test("legacy hasUserNotes=true migrates and suppresses re-seed", () => {
  store.set(LEGACY_HAS_USER_NOTES_KEY, "true");

  initTimelineModel();

  assert.equal(readStore().length, 0);
  assert.equal(localStorage.getItem(HAS_USER_NOTES_KEY), "true");
  assert.equal(localStorage.getItem(LEGACY_HAS_USER_NOTES_KEY), null);
});

test("second launch with empty array does not re-seed", () => {
  store.set(STORAGE_KEY, "[]");

  initTimelineModel();

  assert.equal(readStore().length, 0);
});

test("first user create removes starter, latches, emits starterDataCleared", () => {
  initTimelineModel();

  const cleared = [];
  canonicalBus.on("starterDataCleared", (p) => cleared.push(p));

  createEvent({
    title: "My first real note",
    body: "User content",
    startTime: buildStartTimeIso("2026-06-15", "14:00")
  });

  const stored = readStore();
  assert.equal(stored.length, 1);
  assert.ok(!stored.some((e) => String(e.id).startsWith("starter-")));
  assert.equal(__testHasUserNotesLatch(), true);
  assert.equal(cleared.length, 1);
});

test("user bulk import counts as real and clears starter", () => {
  initTimelineModel();

  const cleared = [];
  canonicalBus.on("starterDataCleared", () => cleared.push(1));

  bulkCreateEvents([
    {
      title: "Imported",
      body: "from elsewhere",
      startTime: buildStartTimeIso("2026-06-20", "09:00")
    }
  ]);

  const stored = readStore();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].title, "Imported");
  assert.equal(__testHasUserNotesLatch(), true);
  assert.equal(cleared.length, 1);
});

test("deleting all events does not bring starter back on re-init", () => {
  initTimelineModel();
  createEvent({
    title: "Only mine",
    body: "x",
    startTime: buildStartTimeIso("2026-06-15", "10:00")
  });

  store.set(STORAGE_KEY, "[]");
  __testResetTimelineModel();
  initTimelineModel();

  assert.equal(readStore().length, 0);
  assert.equal(__testHasUserNotesLatch(), true);
});

test("latch is one-way", () => {
  initTimelineModel();
  createEvent({
    title: "Latch me",
    body: "x",
    startTime: buildStartTimeIso("2026-06-15", "11:00")
  });
  assert.equal(__testHasUserNotesLatch(), true);

  try {
    localStorage.setItem(HAS_USER_NOTES_KEY, "false");
  } catch {
    /* ignore */
  }
  assert.equal(__testHasUserNotesLatch(), true);
});
