import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  on,
  off,
  emit,
  onTimelineDataChange,
  disposeTimelineDataChange,
  __testGetInternalHandlerErrors,
  __testResetInternalHandlerErrors,
  __testIsEventBusDevLogEnabled
} from "../../src/utils/EventBus.js";

beforeEach(() => {
  process.env.NODE_ENV = "test";
  __testResetInternalHandlerErrors();
});

test("subscribe emit fires with payload", () => {
  const seen = [];
  on("ping", (p) => seen.push(p));
  emit("ping", { ok: 1 });
  assert.deepEqual(seen, [{ ok: 1 }]);
});

test("multiple subscribers fire in subscription order", () => {
  const order = [];
  on("ord", () => order.push(1));
  on("ord", () => order.push(2));
  on("ord", () => order.push(3));
  emit("ord");
  assert.deepEqual(order, [1, 2, 3]);
});

test("off stops handler; dispose fn works", () => {
  const a = [];
  const b = [];
  const fnA = (p) => a.push(p);
  const disposeB = on("x", (p) => b.push(p));
  on("x", fnA);
  emit("x", 1);
  off("x", fnA);
  disposeB();
  emit("x", 2);
  assert.deepEqual(a, [1]);
  assert.deepEqual(b, [1]);
});

test("duplicate on same handler fires once", () => {
  let n = 0;
  const fn = () => {
    n += 1;
  };
  on("dup", fn);
  on("dup", fn);
  emit("dup");
  assert.equal(n, 1);
});

test("emit with no subscribers is a no-op", () => {
  assert.doesNotThrow(() => emit("nobody-here", { x: 1 }));
});

test("throwing handler does not block others (§19.5)", () => {
  const order = [];
  on("err", () => {
    order.push("throw");
    throw new Error("boom");
  });
  on("err", () => order.push("after"));
  emit("err");
  assert.deepEqual(order, ["throw", "after"]);
  assert.equal(__testGetInternalHandlerErrors().length, 1);
  assert.equal(__testGetInternalHandlerErrors()[0].event, "err");
});

test("mid-emit off sibling is snapshot-safe", () => {
  const order = [];
  /** @type {(() => void) | null} */
  let disposeB = null;
  const fnA = () => {
    order.push("a");
    if (disposeB) disposeB();
  };
  const fnB = () => order.push("b");
  on("snap", fnA);
  disposeB = on("snap", fnB);
  emit("snap");
  assert.deepEqual(order, ["a", "b"]);
});

test("mid-emit subscribe does not run in same emit round", () => {
  const order = [];
  on("late", () => {
    order.push("first");
    on("late", () => order.push("second"));
  });
  emit("late");
  assert.deepEqual(order, ["first"]);
  emit("late");
  assert.deepEqual(order, ["first", "first", "second"]);
});

test("re-entrant emit is safe", () => {
  const order = [];
  on("outer", () => {
    order.push("outer");
    emit("inner");
  });
  on("inner", () => order.push("inner"));
  emit("outer");
  assert.deepEqual(order, ["outer", "inner"]);
});

test("onTimelineDataChange subscribes to all timeline mutation events", () => {
  let n = 0;
  const disposers = onTimelineDataChange(() => {
    n += 1;
  });
  for (const name of [
    "initialized",
    "eventCreated",
    "eventUpdated",
    "eventDeleted",
    "eventsBulkCreated",
    "starterDataCleared"
  ]) {
    emit(name, {});
  }
  disposeTimelineDataChange(disposers);
  emit("eventCreated", {});
  assert.equal(n, 6);
});

test("dev log disabled in test env", () => {
  assert.equal(__testIsEventBusDevLogEnabled(), false);
});
