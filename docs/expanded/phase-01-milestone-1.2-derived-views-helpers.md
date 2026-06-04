# Phase 1 — Milestone 1.2: Derived Views & Helpers (Expanded)

**Goal:** All read helpers for day/week/month/year, pure and performant.
**Spec alignment:** §3.2 (derived structures), §3.5, §10.3.
**Sequencing:** Depends on Milestone 1.1 (the `_events` array and CRUD must exist). Everything in Phases 4–6 that renders or summarizes data reads through these helpers, so correctness here is load-bearing.

---

## 1.2.1 — Implement `getEventsForDate(date: Date): Event[]`

- **Purpose:** Return every event whose `startTime` falls on a given calendar date — the primitive all other day reads build on.
- **Dependencies:** 1.1.3 (`_events`).
- **Acceptance criteria:** Returns a new array of events where `startTime` is within 00:00:00–23:59:59 **local** time of `date`; empty array when none; never mutates `_events`.
- **Implementation notes:** Compare on local day boundaries, not UTC, or events drift across midnight by timezone offset. Build day start/end once, filter, return a copy.
- **Edge cases:** Events exactly at 00:00 belong to that day; events at 23:59:59 too; DST transition days (23 or 25 hours) — rely on Date arithmetic, not fixed 86,400,000ms.
- **UI/UX considerations:** Drives DayBlock3D content (§5.4) and 2D day cells (§6.5); wrong boundaries show events on the wrong day.
- **Data flow notes:** Read-only; consumers call this, never touch `_events`.
- **Testing notes:** Events at midnight, end-of-day, and adjacent days land in the correct bucket; DST day returns correct set.
- **Performance notes:** O(n) scan; fine. If profiling later shows hot paths, a date-bucketed index is a Phase 9 task — not now.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 "Day", basis for 1.2.2 and 1.2.7.

## 1.2.2 — Implement `getEventsForDay(year, month, day): Event[]`

- **Purpose:** Same as 1.2.1 but addressed by numeric Y/M/D, the form callers usually have.
- **Dependencies:** 1.2.1.
- **Acceptance criteria:** Constructs the local date and delegates to `getEventsForDate`; `month` convention (0- or 1-based) is documented and consistent everywhere.
- **Implementation notes:** Pick one month convention (JS Date is 0-based) and state it in JSDoc; mismatches here are a classic off-by-one-month bug.
- **Edge cases:** Invalid day (e.g., Feb 30) → Date normalizes; decide whether to accept or reject — prefer rejecting with a clear error to catch caller bugs.
- **UI/UX considerations:** Grid cells pass Y/M/D; consistency prevents "events on wrong cell."
- **Data flow notes:** Thin wrapper; no separate logic to drift from 1.2.1.
- **Testing notes:** Same date via `getEventsForDate` and `getEventsForDay` returns identical results.
- **Performance notes:** Delegates; same O(n).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 helpers list.

## 1.2.3 — Implement `getEventsForWeek(year, isoWeek): Event[]`

- **Purpose:** Return all events in a 7-day ISO week for Week View and weekly summaries.
- **Dependencies:** 1.2.1.
- **Acceptance criteria:** Resolves ISO week → Monday start date, collects the 7 days, returns merged sorted array; respects ISO-8601 week numbering.
- **Implementation notes:** ISO weeks start Monday and week 1 contains the first Thursday — implement the conversion carefully or use a small tested helper. Note: §3.2 says Monday start even though UI may offer Sunday-first display (§8.1) — keep data weeks ISO, handle display preference in the view.
- **Edge cases:** Year-boundary weeks (week 1 / week 52–53) spanning December/January; week 53 years.
- **UI/UX considerations:** Drives Week View (§6.4); off-by-one week misaligns the whole grid.
- **Data flow notes:** Aggregates 7 day-reads; keep it derived, never cached.
- **Testing notes:** Known dates map to known ISO weeks; cross-year week returns events from both years.
- **Performance notes:** 7× day filter = O(n); fine.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 "Week", weekly summary (§4.5).

## 1.2.4 — Implement `getEventsForMonth(year, month): Event[]`

- **Purpose:** All events in a calendar month for Month View and monthly summaries.
- **Dependencies:** 1.2.1.
- **Acceptance criteria:** Returns events whose `startTime` is in the given month/year, sorted; new array; same month convention as 1.2.2.
- **Implementation notes:** Filter by year+month directly rather than iterating every day, for clarity and speed.
- **Edge cases:** Leap-year February; months with 28–31 days handled by Date, not hardcoded.
- **UI/UX considerations:** Drives Month View pills (§6.3) and 3D month clusters (§5.3).
- **Data flow notes:** Read-only aggregate.
- **Testing notes:** Events on the 1st and last day included; adjacent-month events excluded.
- **Performance notes:** Single O(n) filter.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 "Month".

## 1.2.5 — Implement `getEventsForYear(year): Event[]`

- **Purpose:** All events in a year for Year View heatmaps and yearly stats.
- **Dependencies:** 1.2.1.
- **Acceptance criteria:** Returns sorted events in the given calendar year; new array.
- **Implementation notes:** Filter by year on parsed `startTime`; reuse a shared `parseStart(event)` helper across 1.2.x to avoid repeated parsing logic.
- **Edge cases:** Year boundaries (Dec 31 23:59 vs Jan 1 00:00) land in the correct year by local time.
- **UI/UX considerations:** Feeds the 12-month mini grid (§6.2) and density heatmap tints.
- **Data flow notes:** Largest aggregate; still derived, never stored.
- **Testing notes:** Boundary events on Jan 1 and Dec 31 bucket correctly.
- **Performance notes:** O(n) once per render; acceptable. Year View should request this once and reuse, not per-cell.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 "Year".

## 1.2.6 — Implement `getUpcomingAlerts(withinMinutes)`

- **Purpose:** Return `{ event, alert }` pairs for alerts firing within a window — the Scheduler and Alerts UI both need this.
- **Dependencies:** 1.1.3; the `Alert` shape from 1.1.2.
- **Acceptance criteria:** Returns pairs where `alert.time` is between now and now+`withinMinutes`, excluding `triggered`/`dismissed` alerts, sorted by `alert.time` ascending.
- **Implementation notes:** Flatten events→alerts into pairs so callers keep the parent event reference (needed for titles/navigation). Compare against `Date.now()` at call time.
- **Edge cases:** Already-passed-but-untriggered alerts (missed alerts, §7.6) — include or separate per caller need; document the boundary (inclusive of now).
- **UI/UX considerations:** Powers the Alerts dropdown list and badge count (§7.3).
- **Data flow notes:** Read-only; the Scheduler uses it to pick the next timer (§7.2).
- **Testing notes:** Triggered/dismissed excluded; window boundaries inclusive/exclusive as documented; sort order correct.
- **Performance notes:** O(total alerts); fine. Scheduler calls it on each mutation — keep it allocation-light.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2 Scheduler, §3.2 helper.

## 1.2.7 — Implement `getUnifiedEventsForDate(date)` for shared 2D/3D use

- **Purpose:** A single canonical day-read both renderers call, guaranteeing 2D and 3D never diverge.
- **Dependencies:** 1.2.1.
- **Acceptance criteria:** Returns the same data as `getEventsForDate` plus any unified ordering/shape both renderers expect (e.g., sorted by `startTime`, then priority); both 3D and 2D consume only this for a day.
- **Implementation notes:** If 3D and 2D ever need slightly different ordering, resolve it here once — do not let each renderer sort differently, or the views disagree (violates §10.4).
- **Edge cases:** Same as 1.2.1; plus stable sort for equal start times (tiebreak by priority then title).
- **UI/UX considerations:** Guarantees the day looks identical switching 2D↔3D (§6.8 sync).
- **Data flow notes:** The one read path for per-day rendering in both systems.
- **Testing notes:** 2D and 3D given the same date receive byte-identical arrays.
- **Performance notes:** Delegates to 1.2.1 plus one sort; O(n + k log k).
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.3 shared data contract, §11.2 data flow ownership.

## 1.2.8 — Ensure all helpers are pure and return new arrays

- **Purpose:** Guarantee reads can never mutate stored state — a core integrity rule.
- **Dependencies:** 1.2.1–1.2.7.
- **Acceptance criteria:** No helper returns a reference into `_events`; mutating a returned array/event does not affect stored data; helpers have no side effects (no writes, no emits, no caching).
- **Implementation notes:** Return `.filter()`/`.map()` results (new arrays). Decide on shallow vs deep copy: shallow is fine if consumers treat events as read-only (enforce via convention + review). If any consumer mutates events in place, switch to returning frozen objects.
- **Edge cases:** A consumer accidentally mutating a returned event — consider `Object.freeze` in dev builds to catch it.
- **UI/UX considerations:** Prevents subtle "the calendar changed without a save" bugs.
- **Data flow notes:** Reinforces §10.3 (model is the only writer).
- **Testing notes:** Mutating a returned array and re-reading shows the store unchanged.
- **Performance notes:** New-array allocation is negligible at expected scale.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 "must be pure".

## 1.2.9 — Add tests for each helper with sample data

- **Purpose:** Pin down read behavior, especially date-boundary correctness.
- **Dependencies:** 1.2.1–1.2.8.
- **Acceptance criteria:** Each helper has tests covering empty, single, multiple, and boundary cases; all pass against a shared fixture set.
- **Implementation notes:** Build one fixture of ~15 events spanning two months and a year boundary; reuse across helper tests. Freeze "now" with a fake clock for `getUpcomingAlerts`.
- **Edge cases:** Same boundary cases named in each task above (midnight, year/week boundaries, DST, leap day).
- **UI/UX considerations:** None directly; these guard the data feeding every view.
- **Data flow notes:** Tests confirm purity (1.2.8) by asserting `_events` unchanged after reads.
- **Testing notes:** This is the testing task for the read layer.
- **Performance notes:** Include the 1.2.10 timing assertion here if convenient.
- **Mobile vs desktop:** Headless; platform-independent.
- **Integration points:** §28 testing plan.

## 1.2.10 — Add performance notes (no O(n²) loops on every call)

- **Purpose:** Document and enforce that reads stay linear, preventing accidental quadratic blowups as data grows.
- **Dependencies:** 1.2.1–1.2.9.
- **Acceptance criteria:** Each helper has a comment stating its complexity; no helper calls another helper inside a loop in a way that produces O(n²); a test asserts bulk reads stay within a sane time budget on a large fixture.
- **Implementation notes:** Watch for the trap of `getEventsForWeek` calling `getEventsForDate` 7× (that's fine, still O(n)) versus a view calling `getEventsForDate` once per cell inside a 365-cell loop (that's O(n·cells)). Push aggregation into one pass where it matters.
- **Edge cases:** Year View rendering 365 days — fetch the year once and group, don't call per-day 365 times.
- **UI/UX considerations:** Keeps large calendars responsive (§20 performance plan).
- **Data flow notes:** Establishes the read-cost contract Phase 9 optimizes against.
- **Testing notes:** Timing test on ~1,000-event fixture stays under budget.
- **Performance notes:** This *is* the performance task; sets the baseline.
- **Mobile vs desktop:** Mobile is more sensitive — the budget should reflect mobile CPU.
- **Integration points:** §20, Phase 9 profiling.

---

### Milestone 1.2 — Definition of Done
- All seven read helpers implemented, pure, returning new arrays, with documented local-time boundaries.
- `getUnifiedEventsForDate` is the single per-day read for both 2D and 3D.
- Tests cover empty/boundary/DST/year-edge cases; complexity is documented and linear.
- **Next:** Milestone 1.3 — Starter Data & Flags.
