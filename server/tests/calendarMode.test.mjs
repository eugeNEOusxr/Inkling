import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();

globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

describe("calendarMode storage", () => {
  beforeEach(() => {
    store.clear();
  });

  it("migrates legacy key to inkling-calendar-mode", async () => {
    store.set("inkling:wordweaverCalendarMode", "2d");
    const mod = await import("../../src/wordweaver/calendarMode.js?t=" + Date.now());
    assert.equal(mod.getCalendarMode(), "2d");
    assert.equal(store.get("inkling-calendar-mode"), "2d");
    assert.equal(store.get("inkling:wordweaverCalendarMode"), undefined);
  });
});
