# Phase 1 — Milestone 1.2: Derived Views & Helpers (Expanded)

**Goal:** Reconcile the **already-existing** read helpers in [`src/wordweaver/timelineModel.js`](../../src/wordweaver/timelineModel.js) toward §3.2 — pure day/week/month/year reads with consistent signatures — and add the two **missing** helpers (`getEventsForYear`, `getUpcomingAlerts`). Grounded against the live file: several helpers exist but with **diverged signatures** and a real **per-day full re-scan** performance trap.

**Spec alignment:** §3.2 line 253-265 (the seven helpers + their signatures; **pure, return new arrays, never mutate**), §3.5 (lifecycle), §10 line 968-969 (model is SSOT; 2D/3D share the same helpers).

**Sequencing:** Depends on 1.1 (the record shape + `startTime`, and the architecture decision 1.1.1). Everything in Phases 4–6 that renders or summarizes reads through these helpers, so signature consistency and the local-time-boundary semantics here are load-bearing. **Carry-forward from 1.1:** boundary semantics depend on whether real `startTime` is stored (1.1.2) — today the helpers match on a **date string**, not a local-time window over `startTime`.

---

## Current implementation status (reconciliation)

Most read helpers **already exist and are live**, but with **signatures that diverge from §3.2**, **date-string matching instead of local-time `startTime` windows**, a **federated two-source read** (timeline entries + calendar day-nodes), and a **per-day full-reload performance trap**. Two helpers are missing entirely.

- **`getEventsForDate` exists but takes an ISO string, not a `Date`, and matches by date-string equality.** §3.2 line 256 signs it `getEventsForDate(date: Date)`. Live `getEventsForDate(dateIso)` (timelineModel.js:517) takes a `"YYYY-MM-DD"` string and selects entries by `entry.date === dateIso` (:524) — **not** a local-time window over `startTime` (line §3.2's day = events whose `startTime` falls in 00:00–23:59:59 local). Since the store has no real `startTime` (1.1.2), there's no window to apply yet. It also **federates two sources**: timeline entries (`loadTimeline`) **+** calendar day-nodes (`loadSavedMonth` → `eventsFromDayNode` :447). 1.2.1 reconciles the signature + boundary once `startTime` is real, and documents the federation.
- **`getEventsForDay` exists but `month` is 0-based.** Live `getEventsForDay(year, monthIndex, dayIndex)` (:511) treats arg 2 as **0-based** (`const month = monthIndex + 1`, :512). §3.2 line 257 signs `getEventsForDay(year, month, day)` without stating the base — the existing 21 callers assume 0-based. 1.2.2 documents/reconciles one convention everywhere (a classic off-by-one-month risk).
- **`getEventsForWeek` exists but takes a Monday ISO date, not `(year, isoWeek)`.** §3.2 line 258 signs `getEventsForWeek(year, isoWeek)`. Live `getEventsForWeek(weekStartDate)` (:557) takes an ISO Monday string and walks 7 days (`getWeekStartMonday` :426 produces it). 1.2.3 either adds ISO-week-number resolution to match the spec signature or reconciles the spec to the (working) Monday-date signature — and fixes the per-day reload (1.2.10).
- **`getEventsForMonth` matches the spec signature.** Live `getEventsForMonth(year, month)` with `month` 1-based (:574) ✓ matches §3.2 line 259 — but it iterates every day calling `getEventsForDate` (:578-581), the perf trap (1.2.10).
- **`getEventsForYear` is missing entirely.** §3.2 line 260 requires it; there is **no** `getEventsForYear` in the live model. 1.2.5 adds it (the Year View / heatmap read).
- **`getUpcomingAlerts` is missing entirely.** §3.2 line 261 requires `getUpcomingAlerts(withinMinutes): { event, alert }[]`; the live model has **no** such function (alert info is only an `alertId` flag on entries, and the actual alert objects live in `alertsModel.js`, Phase 2). 1.2.6 adds it (the Scheduler + Alerts UI read), coordinated with the Phase-2 alerts model.
- **`getUnifiedEventsForDate` exists and is the shared 2D/3D read.** Live `getUnifiedEventsForDate(dateIso)` (:590) + `getUnifiedEventsForDay` (:600) map records through `calendarRecordToUnifiedEvent` ✓ (§3.2 line 262). Signature is ISO-string (reconcile with 1.2.1's `Date` decision). This is the right single-read seam for §18 2D/3D sync.
- **Performance trap: month/week re-scan the entire store per day.** `getEventsForMonth` calls `getEventsForDate` once per day (28–31×, :578), and `getEventsForWeek` 7× (:561-565) — and **each** `getEventsForDate` call re-runs `loadTimeline()` (full localStorage parse + normalize + sort) **and** `loadSavedMonth()` + `createCalendarState` (:537-543). So a month read is ~30 full-store reloads — the exact O(days×entries) blowup 1.2.10 warns about, and it's **present in the live code**, not hypothetical. 1.2.10 fixes it (load once, group).
- **What's already right (keep):** helpers return **new arrays** and sort copies (`[...entries].sort` :144, `list.sort` :548) — no caller-mutation of stored state ✓ (§3.2 line 265, and there's no `_events` to leak a reference into); `getEventsForMonth`'s `(year, month)` 1-based signature ✓; the `getUnified*` shared-read seam exists ✓; sorting by time-of-day is in place (will become sort-by-`startTime` once stored, 1.1.2).

---

## 1.2.1 — Reconcile `getEventsForDate`: `Date` signature + local-time boundary + documented federation

- **Purpose:** Align the day primitive to §3.2 line 256 — accept a `Date` (or document the ISO-string choice), select by a **local-time window over `startTime`** (once stored, 1.1.2), and document that it federates timeline entries + calendar day-nodes — so every other day read builds on one correct primitive.
- **Dependencies:** 1.1.2 (real `startTime` to window on), 1.1.1 (single source vs federation); §3.2 line 245/256.
- **Acceptance criteria:** Signature matches §3.2 (`Date`) **or** the ISO-string form is kept and §3.2 updated to match (pick one, document — the 21 callers pass ISO strings today, so reconciling the spec may be cheaper); selection uses the local-day window (00:00:00–23:59:59 local) over `startTime` once 1.1.2 lands (until then, date-string match is the documented interim); the **federation** (timeline entries + day-nodes) is documented as intentional or folded into one source per 1.1.1; returns a new sorted array; empty when none.
- **Implementation notes:** Build on the live `getEventsForDate` (timelineModel.js:517-551); keep the two-source merge (:522 timeline, :546 day-nodes) but reconcile the boundary from `entry.date === dateIso` (:524) to a `startTime`-window once real. Sort by `startTime` (1.1.2) instead of `parseTimeMinutes(time)` (:549).
- **Edge cases:** Events at 00:00 belong to that day; 23:59:59 too; DST days (23/25h) — use Date arithmetic, not fixed ms; the day-node source uses `hourToTimeString(hour)` (:438) — reconcile to ISO once 1.1.2 lands; legacy entries with only `date` (no time) default to start-of-day.
- **UI/UX considerations:** Drives DayBlock3D (§5) and 2D day cells (§6); wrong boundaries show events on the wrong day.
- **Data flow notes:** The primitive all day reads build on; consumers call this, never the raw stores.
- **Testing notes:** Midnight/end-of-day/adjacent-day events bucket correctly; DST day correct; federated day-node events appear alongside timeline entries.
- **Performance notes:** O(n) scan — but **don't** let callers invoke it per-day in a loop (1.2.10); the federation's `loadSavedMonth` reload is the cost to hoist.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 Day, 1.1.1/1.1.2, basis for 1.2.2/1.2.3/1.2.4/1.2.7, the day-node source (`calendarState`).
- **Status:** **Divergent (ISO-string sig, date-string match) + federated.** Live `getEventsForDate(dateIso)` matches by `entry.date === dateIso`, merges timeline + day-nodes, sorts by time-of-day. **Next:** reconcile signature (Date vs documented ISO), local-time window over real `startTime` (1.1.2), document the federation.

## 1.2.2 — Reconcile `getEventsForDay` month convention (live is 0-based)

- **Purpose:** Reconcile `getEventsForDay` to one documented month convention — the live code is **0-based** (`monthIndex`) while §3.2 leaves it unstated — so callers and grids never hit an off-by-one-month bug.
- **Dependencies:** 1.2.1; §3.2 line 257.
- **Acceptance criteria:** The month base (0- or 1-based) is **documented in JSDoc and consistent** with all 21 callers; live `getEventsForDay(year, monthIndex 0-11, dayIndex)` (timelineModel.js:511-515) keeps working; delegates to `getEventsForDate`; same date via both yields identical results.
- **Implementation notes:** The live signature is **0-based** (`const month = monthIndex + 1`, :512) and callers (e.g. WordWeaverScene `populateMonthCluster`, the 2D grids) pass 0-based month indices — keep 0-based and document it, rather than flipping it and breaking 21 callers. State the convention loudly in JSDoc.
- **Edge cases:** Invalid day (Feb 30) → `Date` normalizes; decide accept vs reject (prefer reject to catch caller bugs) — but don't change behavior the 21 callers rely on without checking them.
- **UI/UX considerations:** Grid cells pass Y/M/D; consistency prevents "events on wrong cell."
- **Data flow notes:** Thin wrapper over 1.2.1.
- **Testing notes:** `getEventsForDate` and `getEventsForDay` return identical results for the same day; 0-based month verified against a known caller.
- **Performance notes:** Delegates; same O(n).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 helpers, the 21 callers (convention consumers).
- **Status:** **Divergent-but-working (undocumented 0-based).** Live arg 2 is 0-based `monthIndex`; spec base unstated. **Next:** document 0-based in JSDoc, keep it (don't break 21 callers), verify consistency.

## 1.2.3 — Reconcile `getEventsForWeek` signature (`(weekStart)` vs `(year, isoWeek)`)

- **Purpose:** Reconcile the week read to §3.2 line 258 — either add `(year, isoWeek)` resolution or formalize the live `(weekStartDate)` Monday-date form — and fix its per-day reload (1.2.10).
- **Dependencies:** 1.2.1, `getWeekStartMonday` (timelineModel.js:426); §3.2 line 247/258.
- **Acceptance criteria:** A documented signature decision: either implement `getEventsForWeek(year, isoWeek)` with ISO-8601 week→Monday resolution (week 1 contains the first Thursday) **or** keep the working `getEventsForWeek(weekStartDate)` and update §3.2 to the Monday-date form (the Phase-4 Week View already thinks in week-start dates, 4.3); the 7-day collection stays Monday-start (§3.2 line 247) regardless of any Sunday-first **display** preference (handled in the view); returns a merged sorted array.
- **Implementation notes:** Live `getEventsForWeek(weekStartDate)` (:557-567) walks 7 days from a Monday ISO via `getEventsForDate`. If adopting `(year, isoWeek)`, add a small tested ISO-week→date helper; otherwise document the Monday-date form. Either way, hoist the per-day reload (1.2.10) so the 7 day-reads don't each reload the store.
- **Edge cases:** Year-boundary weeks (week 1 / 52–53) spanning Dec/Jan; week-53 years; the Monday-start data week vs a Sunday-first display (§8) — keep data ISO, handle display in the view (the Phase-4 4.3 week-start preference seam).
- **UI/UX considerations:** Drives Week View (§6.4); off-by-one week misaligns the whole grid.
- **Data flow notes:** Aggregates 7 day-reads; derived, never cached.
- **Testing notes:** Known dates → known ISO weeks (if resolved); cross-year week returns both years' events.
- **Performance notes:** 7× day filter — but currently 7× **full store reload** (1.2.10 fix).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 Week, Phase-4 4.3 (Week View week-start), 1.2.10 (reload fix).
- **Status:** **Divergent (signature).** Live `getEventsForWeek(weekStartDate)` (Monday ISO), not `(year, isoWeek)`; 7× store reload. **Next:** decide signature (add ISO-week resolution or formalize Monday-date), keep Monday-start data, fix the reload.

## 1.2.4 — Confirm `getEventsForMonth` (signature ✓; fix per-day reload)

- **Purpose:** Confirm `getEventsForMonth(year, month)` matches §3.2 line 259 (it does) and fix its **per-day full-store reload** so a month read is one pass, not ~30.
- **Dependencies:** 1.2.1, 1.2.10; §3.2 line 249/259.
- **Acceptance criteria:** Signature stays `(year, month)` 1-based (live :574 ✓); returns events in the month sorted, new array; **the implementation loads the store once and groups by day** instead of calling `getEventsForDate` per day (each of which reloads everything today, :578-581).
- **Implementation notes:** Live `getEventsForMonth` (timelineModel.js:574-583) loops `day = 1..last` calling `getEventsForDate(iso)` — each reloads `loadTimeline()` + `loadSavedMonth()`. Reconcile to: load the timeline + month state **once**, then filter/group to the month (1.2.10 is where this lands centrally). Keep the 1-based `(year, month)` signature.
- **Edge cases:** Leap-year Feb; 28–31-day months via `Date`; the day-node federation's month state is already month-scoped (`loadSavedMonth`) — load it once.
- **UI/UX considerations:** Drives Month View pills (§6.3) and 3D month clusters (§5.3 — `populateMonthCluster` reads per-day, a related per-day-read pattern to watch).
- **Data flow notes:** Read-only aggregate.
- **Testing notes:** 1st and last day included; adjacent-month excluded; result identical before/after the reload fix.
- **Performance notes:** From ~30 store reloads to **one** — the 1.2.10 win, most visible here.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 Month, 1.2.10 (reload fix), §5.3/§6.3 consumers.
- **Status:** **Signature ✓ / costly impl.** `(year, month)` 1-based matches spec; but iterates `getEventsForDate` per day = ~30 full reloads. **Next:** keep signature, load once + group (1.2.10).

## 1.2.5 — Add `getEventsForYear(year)` (MISSING)

- **Purpose:** Add the §3.2 line 260 year read the live model lacks — all events in a calendar year — for the Year View 12-month grid / density heatmap.
- **Dependencies:** 1.2.1, 1.2.10 (load-once); §3.2 line 251/260.
- **Acceptance criteria:** New `getEventsForYear(year)` returns sorted events in the given calendar year as a new array; loads the store **once** and filters by year (not 365 per-day reloads); boundary events (Dec 31 23:59 / Jan 1 00:00) bucket by local time.
- **Implementation notes:** None exists — add it. Filter by year on the parsed `startTime` (1.1.2); reuse a shared `parseStart(event)` helper (1.2.10) so Year/Month/Week share one parse path. **Critically**, do not implement it as a per-day loop (the Year View renders 365 cells — fetch the year once and group, never call `getEventsForDate` 365×).
- **Edge cases:** Year boundaries by local time; the day-node federation spans only the saved month — a full-year read may only have day-node data for the saved month (document the limitation until the federation is unified, 1.1.1).
- **UI/UX considerations:** Feeds the 12-month mini grid (§6.2 / Phase-4 4.1) and 3D year ring density (§5.2).
- **Data flow notes:** Largest aggregate; derived, never stored.
- **Testing notes:** Jan 1 / Dec 31 boundary events bucket correctly; one store load, not 365.
- **Performance notes:** O(n) once per render; Year View requests it once and reuses, not per-cell.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 Year, Phase-4 4.1 (Year View), §5.2 (3D ring), 1.2.10.
- **Status:** **Missing.** No `getEventsForYear` in the live model. **Next:** add it as a single-pass year filter (not per-day), shared `parseStart`.

## 1.2.6 — Add `getUpcomingAlerts(withinMinutes)` (MISSING — coordinate with Phase-2 alerts)

- **Purpose:** Add the §3.2 line 261 helper the live model lacks — `{ event, alert }` pairs for alerts firing within a window — the read the Scheduler and Alerts UI both need.
- **Dependencies:** 1.1 (`Event` + `alerts[]` shape), the Phase-2 `alertsModel.js` (where alert objects live today); §3.2 line 261, §7.2 (Scheduler), §7.3 (badge).
- **Acceptance criteria:** New `getUpcomingAlerts(withinMinutes)` returns `{ event, alert }[]` where `alert.time` is between now and now+`withinMinutes`, **excluding** `triggered`/`dismissed` alerts, sorted by `alert.time` ascending; keeps the parent `event` reference (for titles/navigation); compares against `Date.now()` at call time.
- **Implementation notes:** Live events carry only an `alertId` flag (timelineModel.js:23/532), and the real alert objects live in `alertsModel.js` (dynamically imported at :356). Reconcile where alerts live (1.1.2's `Event.alerts[]` per §3.1, or the separate alertsModel) — this helper must read whichever is canonical. Coordinate the §7.2 horizon (Scheduler scans 7d; the badge window is 24h, §7.3 — intentionally different, per the Phase-2 carry-forward).
- **Edge cases:** Already-passed-but-untriggered (missed) alerts (§7.6) — include or separate per caller; document the now-boundary (inclusive); no alerts → empty array.
- **UI/UX considerations:** Powers the Alerts dropdown list + badge count (§7.3).
- **Data flow notes:** Read-only; the Scheduler uses it to pick the next timer (§7.2).
- **Testing notes:** Triggered/dismissed excluded; window boundaries per doc; sort correct; with a fake clock.
- **Performance notes:** O(total alerts); the Scheduler calls it on each mutation — keep allocation-light.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 helper, §7.2/§7.3, Phase-2 `alertsModel.js`, 1.1.2 (`Event.alerts[]`).
- **Status:** **Missing.** No `getUpcomingAlerts`; alerts are only an `alertId` flag + separate `alertsModel`. **Next:** add it, reconciled with where alert objects canonically live; exclude triggered/dismissed; sort ascending.

## 1.2.7 — Confirm `getUnifiedEventsForDate` as the single shared 2D/3D read

- **Purpose:** Confirm and harden the §3.2 line 262 shared read — one canonical day-read both renderers call — so 2D and 3D never diverge (§18 sync).
- **Dependencies:** 1.2.1; §3.2 line 262, §10 line 969, §18.
- **Acceptance criteria:** `getUnifiedEventsForDate` (live :590) returns the same data as `getEventsForDate` mapped to `UnifiedTimelineEvent`, with a **stable** unified ordering both renderers rely on (sort by `startTime`, tiebreak priority then title); both 3D and 2D consume **only** this for a day; signature reconciled with 1.2.1 (Date vs ISO).
- **Implementation notes:** Live `getUnifiedEventsForDate(dateIso)` (:590-592) maps via `calendarRecordToUnifiedEvent` ✓; add the explicit stable tiebreak sort so equal start times order identically in both views; keep `getUnifiedEventsForDay` (:600) consistent. Resolve any 3D-vs-2D ordering difference **here once**, never per-renderer (§10 line 969).
- **Edge cases:** Stable sort for equal `startTime` (tiebreak priority then title); same boundary cases as 1.2.1.
- **UI/UX considerations:** Guarantees the day looks identical switching 2D↔3D (§18).
- **Data flow notes:** The one per-day read path for both render systems.
- **Testing notes:** 2D and 3D given the same date receive identical arrays (same order).
- **Performance notes:** Delegates to 1.2.1 + one sort; O(n + k log k).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2, §18 sync, §11 data-flow ownership, 1.2.1.
- **Status:** **Present (needs stable tiebreak + sig reconcile).** `getUnifiedEventsForDate`/`Day` exist and map to the unified shape. **Next:** add the explicit stable ordering, reconcile signature with 1.2.1, confirm both renderers use only this.

## 1.2.8 — Confirm helper purity (no shared mutable references)

- **Purpose:** Confirm the §3.2 line 265 purity rule — reads never mutate stored state — holds across all helpers (it largely does today) and harden it against the 1.1 architecture change.
- **Dependencies:** 1.2.1–1.2.7, 1.1.1 (if `_events` is introduced, purity means not leaking a reference into it); §3.2 line 265, §10 line 968.
- **Acceptance criteria:** No helper returns a reference into the authoritative state (today there's no `_events`; the helpers build fresh arrays from `loadTimeline()` copies — keep that); mutating a returned array/event does not affect stored data; helpers have **no side effects** (no writes, no emits, no caching).
- **Implementation notes:** Live helpers already `[...].sort` / `list.push…return list.sort` (new arrays) ✓. If 1.1.1 introduces `_events`, switch helpers to `.filter()/.map()` over it (new arrays) and consider `Object.freeze` in dev builds to catch accidental consumer mutation. Ensure no helper emits or writes.
- **Edge cases:** A consumer mutating a returned event in place — dev-build `Object.freeze` catches it; the `getUnified*` adapter already returns fresh objects ✓.
- **UI/UX considerations:** Prevents "the calendar changed without a save" bugs.
- **Data flow notes:** Reinforces §10 (model is the only writer).
- **Testing notes:** Mutating a returned array/event and re-reading shows the store unchanged.
- **Performance notes:** New-array allocation negligible at scale.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2 purity, §10, 1.1.1.
- **Status:** **Largely satisfied.** Helpers return fresh sorted arrays; no `_events` reference to leak today. **Next:** preserve purity if 1.1.1 adds `_events`; add dev-build freeze; confirm no emits/writes in reads.

## 1.2.9 — Tests for each helper (incl. the missing two + federation)

- **Purpose:** Pin down read behavior — especially date-boundary correctness, the two new helpers, and the federated day-node merge — so regressions can't drift the data feeding every view.
- **Dependencies:** 1.2.1–1.2.8; §28.
- **Acceptance criteria:** Each helper has tests for empty/single/multiple/boundary cases against a shared fixture; `getEventsForYear` and `getUpcomingAlerts` (the new ones) are covered; the day-node federation merge is tested (timeline + saved-month data appear together); a fake clock freezes "now" for `getUpcomingAlerts`; all pass.
- **Implementation notes:** Build one fixture (~15 events across two months + a year boundary) reused across helpers; mock `localStorage` **and** the saved-month source (`loadSavedMonth`) so the federation is exercised deterministically.
- **Edge cases:** Midnight/year/week boundaries, DST, leap day; federation (an event only in the day-node source still appears).
- **UI/UX considerations:** None directly; guards the data feeding every view.
- **Data flow notes:** Tests confirm purity (1.2.8) by asserting the store is unchanged after reads.
- **Testing notes:** This is the read-layer testing task.
- **Performance notes:** Include the 1.2.10 timing assertion here if convenient.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, the day-node source.
- **Status:** **Missing.** No helper tests today. **Next:** shared-fixture tests incl. the two new helpers + the federation merge + a fake clock.

## 1.2.10 — Fix the per-day reload trap: load once, group (the real O(days×entries) bug)

- **Purpose:** Reconcile reads to §3.2's "computed on demand" intent **and** §20 performance — eliminate the **live** per-day full-store reload where `getEventsForMonth`/`getEventsForWeek`/(future)`getEventsForYear` call `getEventsForDate` per day, each re-running `loadTimeline()` + `loadSavedMonth()`.
- **Dependencies:** 1.2.1–1.2.5; §3.2, §20, §16 (perf budget).
- **Acceptance criteria:** Month/week/year reads **load the timeline + saved-month state once** and group/filter in a single pass, instead of N delegated `getEventsForDate` calls that each reload everything (live: `getEventsForMonth` :578 ~30×, `getEventsForWeek` :561 7×); a shared internal helper (e.g. `loadAllOnce()` + a `parseStart` accessor) backs the aggregates; a timing test on a ~1,000-event fixture asserts month/year reads stay within a sane (mobile-aware) budget; no helper produces O(days×entries) reloads.
- **Implementation notes:** Today every `getEventsForDate` (timelineModel.js:517) calls `loadTimeline()` (full parse+normalize+sort) **and** `loadSavedMonth()` + `createCalendarState` (:537-543). Introduce a single load per aggregate call (load timeline + month state once, then bucket by day/week/year). Keep `getEventsForDate` itself for single-day callers, but have the aggregates **not** route through it per day. Watch the related per-day-read pattern in `populateMonthCluster` (§5.2) — same lesson.
- **Edge cases:** Aggregates spanning multiple saved months (the day-node source is one month at a time) — load the relevant month state(s) once; a year read touching 12 months needs a documented strategy (timeline events are all loaded once; day-node data may be month-limited).
- **UI/UX considerations:** Keeps large calendars responsive (§20); the Year View (365 cells) is the worst case the single-pass rule protects.
- **Data flow notes:** Establishes the read-cost contract Phase 9 optimizes against.
- **Testing notes:** Timing test on ~1,000 events stays under budget; instrument that a month read does **one** `loadTimeline()`, not ~30.
- **Performance notes:** This **is** the perf task — turns the live ~30-reload month read into one pass.
- **Mobile vs desktop:** Mobile is more sensitive; the budget reflects mobile CPU.
- **Integration points:** §20, §16, Phase 9 profiling, 1.2.4/1.2.5 (consumers of the single-load path).
- **Status:** **Real bug present.** `getEventsForMonth`/`Week` call `getEventsForDate` per day, each reloading the whole store (~30×/7×). **Next:** load timeline + month state once, group in one pass, shared `parseStart`, timing test.

---

### Milestone 1.2 — Definition of Done
- The seven §3.2 helpers exist with documented signatures (incl. the two added: `getEventsForYear`, `getUpcomingAlerts`), pure, returning new arrays, with local-time boundaries once `startTime` is stored (1.1.2).
- `getUnifiedEventsForDate` is the single per-day read for both 2D and 3D, with a stable order.
- The per-day reload trap is fixed (load once, group); tests cover boundaries, the two new helpers, and the federation.
- **Next:** Milestone 1.3 — Starter Data & Flags.
