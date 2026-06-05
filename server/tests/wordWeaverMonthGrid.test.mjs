import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthGridLayout,
  computeYearGridLayout,
  YEAR_PANEL_COLS
} from "../../src/wordweaver/WordWeaverMonthGridLayout.js";

describe("WordWeaverMonthGrid layout", () => {
  it("Monday-start grid with leading empty cells for June 2026", () => {
    const layout = computeMonthGridLayout(2026, 5);
    assert.equal(layout.daysInMonth, 30);
    assert.equal(layout.monOffset, 0);
    assert.equal(layout.cells.length, 30);
    assert.equal(layout.cells[0].col, 0);
    assert.equal(layout.cells[0].row, 0);
    assert.equal(layout.cells[0].iso, "2026-06-01");
    assert.equal(layout.cells[6].col, 6);
    assert.equal(layout.cells[7].col, 0);
    assert.equal(layout.cells[7].row, 1);
  });

  it("deterministic positions across loads", () => {
    const a = computeMonthGridLayout(2026, 0);
    const b = computeMonthGridLayout(2026, 0);
    assert.deepEqual(
      a.cells.map((c) => [c.iso, c.x, c.y]),
      b.cells.map((c) => [c.iso, c.x, c.y])
    );
  });
});

describe("WordWeaverYearGrid layout", () => {
  it("places 12 months in 4×3 reading order Jan top-left → Dec bottom-right", () => {
    const layout = computeYearGridLayout(2026);
    assert.equal(layout.clusters.length, 12);
    assert.equal(layout.clusters[0].monthIndex, 0);
    assert.equal(layout.clusters[0].panelCol, 0);
    assert.equal(layout.clusters[0].panelRow, 0);
    assert.equal(layout.clusters[11].monthIndex, 11);
    assert.equal(layout.clusters[11].panelCol, 3);
    assert.equal(layout.clusters[11].panelRow, 2);
    assert.ok(layout.clusters[0].origin.x < layout.clusters[3].origin.x);
    assert.ok(layout.clusters[0].origin.y > layout.clusters[4].origin.y);
  });

  it("deterministic year panel across loads", () => {
    const a = computeYearGridLayout(2026);
    const b = computeYearGridLayout(2026);
    assert.deepEqual(
      a.clusters.map((c) => [c.monthIndex, c.origin.x, c.origin.y]),
      b.clusters.map((c) => [c.monthIndex, c.origin.x, c.origin.y])
    );
    assert.equal(a.clusters.length, YEAR_PANEL_COLS * 3);
  });
});
