# Phase 4 — Milestone 4.1: Year View (2D) (Expanded)

**Goal:** A `YearView2D` sub-view that renders the selected year as a 3×4 grid of month mini-calendars (§6.2), reads exclusively from the timeline model (§2.3), supports prev/next-year navigation, drills into a month or a specific day, and is driven by the Phase 3 top-bar view nav via the event bus — not by ad-hoc `window` events.
**Spec alignment:** §6.1 (2D views share one data source; switching sub-views does not change `calendarMode`), §6.2 (Year View: 3×4 month mini-calendars, small day cells with ≥28×28px mobile tap target, prev/next-year nav), §2.3 (read from `timelineModel.js` only), §13.2 (`navigateTo`, `monthFocused`, `dayFocused`, `modeChanged`), §11 architecture tree (`YearView2D` under `Calendar2DContainer`), §3.x `getEventsForMonth/Year`.
**Sequencing:** First milestone of Phase 4 and the entry level of the 2D drill (year → month → week → day). Consumes the Phase 3.1 view nav (`navigateTo { level: "year" }`) and the 2D/3D visibility container (3.1.8). Establishes the bus-integration pattern that 4.2 (Month), 4.3 (Week), and 4.4 (Day) reuse. Reads the Phase 1 timeline model helpers.

---

## Current implementation status (reconciliation)

A working year view **already exists** in [`src/wordweaver/Calendar2D.js`](../../src/wordweaver/Calendar2D.js) as the exported `YearView` class (the `Calendar2D` shell drives `year → month → day` via an internal `view` field and a "← Back" button). This milestone is therefore mostly **reconcile + close-gaps**, not greenfield. Headline deltas vs. spec:

- **Naming drift:** code exports `YearView` / `MonthView2D` / `DayView2D`; spec §11 tree names the node `YearView2D`. Pick one (this spec standardizes on `YearView2D`).
- **Bus gap (biggest):** `Calendar2D` re-renders off `window` `"timelineUpdated"` / `"inkling:alerts-updated"` DOM events and navigates via constructor callbacks — it is **not** wired to the Phase 2 `EventBus` and emits no `navigateTo` / `monthFocused` / `dayFocused` (§13.2). The Phase 3.1 top-bar view nav cannot currently target it.
- **No year navigation:** title is a static `String(this.year)`; §6.2 (line 662) requires prev/next-year arrows. Not present.
- **Tap-target gap:** `.ww-day-cell-2d--compact` is `min-height: 22px` — below the §6.2 ≥28×28px mobile minimum.
- **Event signal is thin:** a month block only tints its *border* by the **first** category in the month (`cats[0]`); there is no per-day density/dot signal at year zoom.
- **Week level skipped:** the internal drill is year → month → day; there is no week sub-view (deferred to 4.3, but the drill contract should leave room for it).

---

## 4.1.1 — Promote the Year View to a named `YearView2D` sub-view under the 2D container

- **Purpose:** Give the year level a stable identity that the top-bar view nav and the bus can address, matching the §11 architecture tree.
- **Dependencies:** Phase 3.1 (2D container + view nav); Phase 1 timeline model.
- **Acceptance criteria:** A `YearView2D` view exists under `Calendar2DContainer`; selecting "Year" in the top bar shows it; it holds no event data of its own and reads via `timelineModel.js` (§2.3).
- **Implementation notes:** Rename the existing `YearView` class to `YearView2D` (or alias for back-compat) so code matches §11. Keep it as the `view === "year"` branch of `Calendar2D._render()`, but make the *selection* of that branch reachable from the bus (4.1.9), not only from the internal Back button.
- **Edge cases:** Year view requested while `calendarMode === "3d"` (no-op for 2D; 3D handles its own year overview); first mount before any `navigateTo` (default to current year, current behavior).
- **UI/UX considerations:** Title region shows the year prominently (§6.2); Back button is hidden at year level (already the case — `backBtn.hidden = this.view === "year"`).
- **Data flow notes:** `navigateTo { level: "year" }` → `Calendar2D` sets `view = "year"` → renders `YearView2D`.
- **Testing notes:** Selecting Year renders the 3×4 grid; no direct timeline writes; class name matches spec.
- **Performance notes:** Single view swap (`replaceChildren`), no renderer teardown.
- **Mobile vs desktop:** Identical entry path; layout differences handled in 4.1.5.
- **Integration points:** §6.1, §11, §2.3.
- **Status:** **Built** (as `YearView`). **Gap:** name + bus-addressability. **Next:** rename to `YearView2D`; route selection through the bus (4.1.9).

## 4.1.2 — Render the 3×4 month mini-calendar grid

- **Purpose:** Present the whole year at a glance as twelve month blocks (§6.2).
- **Dependencies:** 4.1.1.
- **Acceptance criteria:** Twelve month blocks render in reading order Jan→Dec; desktop lays them out 3 columns × 4 rows (§6.2); each block is labeled with its month name.
- **Implementation notes:** Current code uses `.ww-year-view-2d { grid-template-columns: repeat(3, 1fr) }` and loops `month = 1..12` — keep this. Month label via `toLocaleDateString(undefined, { month: "long" })` (locale-aware, good). Container `max-width: 960px; margin: 0 auto` centers it.
- **Edge cases:** Locale month names of varying length must not break the grid; very wide desktop (cap width so blocks don't become huge).
- **UI/UX considerations:** Consistent block sizing; month name legible against the glass background.
- **Data flow notes:** Pure layout from the year integer; per-block content comes from 4.1.3.
- **Testing notes:** Exactly 12 blocks, ordered Jan→Dec, 3 columns on desktop.
- **Performance notes:** 12 blocks × ~42 day cells ≈ 500 nodes; acceptable but see 4.1.10 perf note for re-render batching.
- **Mobile vs desktop:** Column count changes by breakpoint (4.1.5).
- **Integration points:** §6.2.
- **Status:** **Built** and spec-aligned. **Next:** none beyond the responsive rules in 4.1.5.

## 4.1.3 — Populate each month block with a compact `MonthGrid2D`

- **Purpose:** Show real day structure inside each mini-month, not just a label.
- **Dependencies:** 4.1.2; `MonthGrid2D` (Phase 4.2 shares this component).
- **Acceptance criteria:** Each block embeds a `MonthGrid2D` in compact mode (`compact: true`, `showWeekdayRow: false`) showing the month's day cells with correct day-of-week alignment.
- **Implementation notes:** Existing call passes `{ year, month, compact: true, showWeekdayRow: false, onDaySelect }`. Reuse `MonthGrid2D` verbatim so year/month views stay visually consistent (single source of grid truth). Padding cells use `.ww-day-cell-2d--pad` (hidden, non-interactive) — already handled.
- **Edge cases:** Months starting on Sunday vs Monday (locale week start — confirm `MonthGrid2D` honors it, flagged for 4.2); 28- to 31-day months and leap-Feb alignment.
- **UI/UX considerations:** Compact cells must stay tappable (see 4.1.5 tap-target gap).
- **Data flow notes:** `MonthGrid2D` reads its own month events; year view passes only `{year, month}`.
- **Testing notes:** Each block's grid matches that month's real calendar; padding cells inert.
- **Performance notes:** Reusing one component avoids 12 bespoke grids; keep cell DOM minimal at compact size.
- **Mobile vs desktop:** Compact density increases on small screens (4.1.5).
- **Integration points:** §6.2, §2.3.
- **Status:** **Built.** **Gap:** week-start locale correctness is unverified (track in 4.2). **Next:** confirm during 4.2.

## 4.1.4 — Show event presence/density per month (and per day cell)

- **Purpose:** Make the year view answer "which months/days are busy?" at a glance — the core value of the zoomed-out view.
- **Dependencies:** 4.1.3; `getEventsForMonth` (§3.x).
- **Acceptance criteria:** Each month block conveys whether it has events and roughly how many/what kind; day cells with events show category dots (consistent with month/week views, §6.2).
- **Implementation notes:** **This is the largest functional gap.** Today the code computes `cats = unique categories` but only uses `cats[0]` to tint the block border (`block.style.borderColor`). Upgrade to: (a) render up to N category dots on the block header, and (b) let the embedded compact `MonthGrid2D` paint per-day category dots (the `.ww-day-cell-2d__dots` / `.category-dot` styles already exist for this). Use `CategoryColors` from `timelineModel.js`; normalize the legacy `"errand"` → `"errands"` alias (the code already does this normalization inline — centralize it).
- **Edge cases:** Months with many categories (cap dot count, show "+n"); empty months (no dots, neutral border); the `errand`/`errands` alias must not double-count.
- **UI/UX considerations:** Dots must remain distinguishable at compact size; don't overwhelm the mini-grid.
- **Data flow notes:** `getEventsForMonth(year, month)` → category set → dots; per-day dots from the grid's own per-day lookup.
- **Testing notes:** A month with mixed categories shows multiple dot colors; an empty month shows none; alias collapses correctly.
- **Performance notes:** One `getEventsForMonth` per block (12 calls); fine, but memoize within a single render pass if the model recomputes.
- **Mobile vs desktop:** Fewer dots / smaller at mobile compact density.
- **Integration points:** §6.2, §3.x, `CategoryColors`.
- **Status:** **Partial** (first-category border tint only). **Gap:** no per-day dots, no multi-category signal. **Next:** implement dot rendering + centralize the `errand` alias.

## 4.1.5 — Responsive grid + ≥28×28px mobile tap targets

- **Purpose:** Keep the year view usable and spec-compliant across breakpoints.
- **Dependencies:** 4.1.2, 4.1.3.
- **Acceptance criteria:** Columns collapse 3 → 2 (≤720px) → 1 (≤420px) — already in CSS; compact day cells meet the §6.2 **≥28×28px** mobile tap-target minimum.
- **Implementation notes:** Existing media queries handle column count. **Fix the tap target:** `.ww-day-cell-2d--compact` is `min-height: 22px` (below spec). Raise compact cells to ≥28px min-height/width on touch/mobile breakpoints (consider a touch-only media query so desktop can stay denser). Verify the whole month block still fits the column after the bump.
- **Edge cases:** 1-column layout on tiny phones (block must not exceed viewport width); landscape phones (more columns may fit — optional); high-DPI where 22px looks fine but fails the physical tap minimum.
- **UI/UX considerations:** Day cells are tap targets that drill to the day (4.1.8) — they must be reliably hittable on mobile.
- **Data flow notes:** Layout-only; no data impact.
- **Testing notes:** At ≤420px each compact day cell is ≥28×28px; columns are 3/2/1 at the three breakpoints.
- **Performance notes:** CSS-only; negligible.
- **Mobile vs desktop:** This is the primary divergence point for 4.1.
- **Integration points:** §6.2, §8.7 (breakpoints).
- **Status:** **Partial** (columns ✓, tap target ✗ at 22px). **Gap:** compact cell below 28px. **Next:** bump compact min-size on touch breakpoints.

## 4.1.6 — Highlight "today" in the year view

- **Purpose:** Orient the user to the current date within the full year.
- **Dependencies:** 4.1.3.
- **Acceptance criteria:** The current day's cell is visually marked (the existing `.ww-day-cell-2d.is-today` ring); optionally the current month block is subtly emphasized.
- **Implementation notes:** `MonthGrid2D` should apply `is-today` to the matching cell (the style exists: `box-shadow: 0 0 0 1px rgba(78,230,230,0.7)`). Confirm the compact grid passes "today" through; if not, add a `today` prop. Recompute "today" on day rollover (and on the timeline/`modeChanged` re-render in 4.1.9).
- **Edge cases:** Viewing a non-current year (no "today" cell — correct); midnight rollover while open (re-mark on next render); timezone consistency with the model's date keys (use the same local-noon parsing the code uses elsewhere: `new Date(iso + "T12:00:00")`).
- **UI/UX considerations:** "Today" marker visible but not louder than event dots.
- **Data flow notes:** Local "today" → grid cell match; no model write.
- **Testing notes:** Current year marks today's cell; other years mark nothing; marker survives a re-render.
- **Performance notes:** Trivial.
- **Mobile vs desktop:** Identical.
- **Integration points:** §6.2.
- **Status:** **Likely built** via shared grid styling — **verify** the compact grid actually receives/applies `is-today`. **Next:** confirm and add `today` prop if missing.

## 4.1.7 — Year navigation (prev/next year)

- **Purpose:** Let the user move across years without leaving the year level (§6.2).
- **Dependencies:** 4.1.1.
- **Acceptance criteria:** Left/right controls (and keyboard ◀/▶) change `this.year` by ∓1 and re-render the grid; the title updates; emits `navigateTo { level: "year", date }` so other views/Inkling stay in sync (4.1.9).
- **Implementation notes:** **Not implemented today** (title is a static `String(this.year)` with no controls). Add prev/next buttons flanking the title in `.ww-calendar-2d__header`, plus arrow-key handling when the year view is focused. Changing year must re-derive all 12 blocks' event signals (4.1.4).
- **Edge cases:** Far-past/future years (no hard cap, but ensure the model handles them); holding the arrow (debounce repeat); year change while a month/day drill is open (year nav only meaningful at year level — hide controls otherwise, like the Back button).
- **UI/UX considerations:** Arrows near the year title; "Today" in the top-bar nav (3.1.4) should still jump back to the current year+date.
- **Data flow notes:** Year nav → set `year` → re-render → emit `navigateTo`.
- **Testing notes:** ◀/▶ change the displayed year and event signals; title matches; emits one `navigateTo` per change.
- **Performance notes:** One full year re-render per step; batch via 4.1.10's render guard.
- **Mobile vs desktop:** Arrows must be tap-friendly (≥28px) on mobile.
- **Integration points:** §6.2, §13.2 (`navigateTo`).
- **Status:** **Missing.** **Next:** add prev/next-year controls + keyboard + emit.

## 4.1.8 — Drill-down: month-select and day-select

- **Purpose:** Move from the year overview down to a month or a specific day.
- **Dependencies:** 4.1.2, 4.1.3.
- **Acceptance criteria:** Clicking a month block (not on a day cell) opens that month (→ 4.2); clicking a day cell opens that day (→ 4.4); both also notify the bus (4.1.9).
- **Implementation notes:** Existing logic is sound: the block click handler ignores clicks that land on a real day cell (`if (e.target.closest(".ww-day-cell-2d:not(--pad)")) return;`) so day-select wins inside a block, month-select wins on the block chrome. Keep this; route the outcomes through `openMonth` / `openDay` (already present) **and** the bus emits.
- **Edge cases:** Click on a padding cell (inert — handled by `--pad`); rapid double-activation; keyboard activation (Enter/Space on a focused block/cell — add for a11y).
- **UI/UX considerations:** Whole month block is a button (`<button>` — good for a11y); day cells are independently focusable.
- **Data flow notes:** month-select → `openMonth(y,m)` + `monthFocused`; day-select → `openDay(iso)` + `dayFocused`/`navigateTo level:"day"`.
- **Testing notes:** Clicking block chrome opens month; clicking a day opens that day; padding cells do nothing.
- **Performance notes:** Single view swap per drill.
- **Mobile vs desktop:** Day-cell tap reliability depends on 4.1.5.
- **Integration points:** §6.2, §13.2.
- **Status:** **Built** (callbacks + correct click disambiguation). **Gap:** outcomes not emitted on the bus. **Next:** add emits in 4.1.9.

## 4.1.9 — Bus integration: emit `navigateTo`/`monthFocused`/`dayFocused`, subscribe to model + `modeChanged`

- **Purpose:** Replace ad-hoc `window` events and constructor callbacks with the Phase 2 `EventBus` so the year view participates in the §13.2 contract and the 3.1 top-bar nav can drive it.
- **Dependencies:** Phase 2 (EventBus), Phase 3.1 (view nav, `modeChanged`); 4.1.7, 4.1.8.
- **Acceptance criteria:** `Calendar2D` subscribes to `navigateTo` (sets view/level/date), to the timeline-changed bus event (re-render when in 2D), and to `modeChanged` (render only when `2d`); it emits `monthFocused { year, month }` and `dayFocused`/`navigateTo` on drill (§13.2).
- **Implementation notes:** **Today it listens to `window.addEventListener("timelineUpdated", …)` and `"inkling:alerts-updated"` and navigates via constructor callbacks** — migrate these to the EventBus. `monthFocused` is the documented event whose subscriber is `InklingPanel` (§13.2 line 1169). Keep the "only render in 2D mode" guard (currently `getCalendarMode() === "2d"`) but source mode from `modeChanged`. Preserve a thin back-compat shim only if other code still dispatches the old `window` events (grep before deleting).
- **Edge cases:** Events arriving while in 3D (ignore render, but keep state current so a later switch is correct); duplicate `navigateTo` for the already-active year/level (no-op, no spurious emit); ordering (apply state before emitting).
- **UI/UX considerations:** Invisible plumbing; payoff is that top-bar "Year"/"Today" and Inkling navigation now move the 2D view.
- **Data flow notes:** bus `navigateTo` → Calendar2D view state; Calendar2D drill → bus `monthFocused`/`dayFocused` → InklingPanel/other views.
- **Testing notes:** `navigateTo {level:"year"}` shows year view; timeline change re-renders only in 2D; drilling emits the right event once; no `window`-event reliance remains (or shim documented).
- **Performance notes:** Subscribe once on mount; unsubscribe on teardown (the container persists, so this is mount-time only).
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 (`navigateTo`, `monthFocused`, `dayFocused`, `modeChanged`), §2.1.
- **Status:** **Missing** (uses `window` events + callbacks). **Gap:** not on EventBus, emits nothing. **Next:** migrate to bus; this unblocks the 3.1 view nav → 2D wiring.

## 4.1.10 — Cross-check with spec §6.1, §6.2, §13.2 and reconcile naming

- **Purpose:** Confirm the year view honors the 2D-view contract and the event catalog before 4.2–4.4 build on the same shell.
- **Dependencies:** 4.1.1–4.1.9.
- **Acceptance criteria:** Verified against §6.1 (shared data source; sub-view switch never changes `calendarMode`), §6.2 (3×4 grid, ≥28×28px mobile cells, prev/next-year nav, event signal), §13.2 (correct `navigateTo`/`monthFocused`/`dayFocused`/`modeChanged` usage), and §11 naming (`YearView2D`). Deviations fixed or documented.
- **Implementation notes:** Walk the reconciliation list at the top of this file and confirm each gap is closed: name → `YearView2D`; bus migration done; year nav present; tap target ≥28px; per-day/month event dots; `errand` alias centralized. Confirm a sub-view switch (year↔month↔day) leaves `calendarMode` untouched (§6.1) — the internal `view` field must never write the mode key.
- **Edge cases:** Re-assert that the year view never writes the event store (read-only, §2.3); same-level `navigateTo` does not double-emit.
- **UI/UX considerations:** Confirm "immediate visual response" (§1.4) on year nav and drill.
- **Data flow notes:** Confirms year view's bus sources/subscribers match §13.2.
- **Testing notes:** Spec-to-implementation checklist passes for §6.1/§6.2/§13.2; no `calendarMode` writes from sub-view changes.
- **Performance notes:** Add a render guard so back-to-back model/nav events coalesce into one re-render (the current `_render` rebuilds all 12 blocks each time).
- **Mobile vs desktop:** Both layouts verified at the §8.7 breakpoints.
- **Integration points:** §6.1, §6.2, §13.2, §11.
- **Status:** **Checklist** (gates the milestone). **Next:** run after 4.1.1–4.1.9.

---

### Milestone 4.1 — Definition of Done
- `YearView2D` (renamed from `YearView`) renders the selected year as a 3×4 grid of compact `MonthGrid2D` month blocks, reading only from `timelineModel.js` (§2.3, §6.2).
- Each month block and its day cells convey event presence via category dots (not just a first-category border tint); compact day cells meet the ≥28×28px mobile tap target (§6.2).
- Prev/next-year navigation works (controls + keyboard) and "today" is highlighted in the current year (§6.2).
- Drill-down opens a month (→ 4.2) or a day (→ 4.4) with correct day-vs-block click disambiguation, and the view is driven by the **EventBus** — subscribing to `navigateTo`/`modeChanged` and the timeline-changed event, emitting `monthFocused`/`dayFocused` (§13.2) — replacing the legacy `window` events and constructor callbacks.
- Switching the 2D sub-view never changes `calendarMode` (§6.1); the view performs no event-store writes.
- Next: Milestone 4.2 — Month View (2D).
