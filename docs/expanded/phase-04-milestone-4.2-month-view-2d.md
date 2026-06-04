# Phase 4 — Milestone 4.2: Month View (2D) (Expanded)

**Goal:** A `MonthView2D` sub-view that renders a single month as a 7-column grid (§6.3), reads exclusively from the timeline model (§2.3), shows real **event pills** (not just dots) with a "…+N more" overflow, supports prev/next-month navigation and a Today button, drills into a specific day, and is driven by the Phase 3 top-bar view nav via the event bus — not by ad-hoc `window` events.
**Spec alignment:** §6.1 (2D views share one data source; switching sub-views does not change `calendarMode`), §6.3 (Month View: 7 columns Sun–Sat or Mon–Sun by preference, 4–6 rows, day cells fill viewport height, out-of-month days dimmed/non-interactive, day-number top-right, ≤3 event pills + "…+N more", alert icon, category dots, month nav arrows, Today button), §26.3 (Month view not scrollable vertically; cells adjust height to fit), §2.3 (read from `timelineModel.js` only), §13.2 (`navigateTo`, `monthFocused`, `dayFocused`, `modeChanged`), §11 architecture tree (`MonthView2D` under `Calendar2DContainer`), §3.x `getEventsForMonth/Date`.
**Sequencing:** Second level of the 2D drill (year → **month** → week → day). Reuses the bus-integration pattern established in 4.1; receives drills from 4.1.8 (`onMonthSelect`/`monthFocused`) and hands off to 4.3 (Week) and 4.4 (Day). Shares the `MonthGrid2D` component with the Year View's compact mini-months (4.1.3), so every grid change here must be guarded to not regress the compact path.

---

## Current implementation status (reconciliation)

A working month view **already exists** in [`src/wordweaver/Calendar2D.js`](../../src/wordweaver/Calendar2D.js) as the exported `MonthView2D` class — but it is a thin wrapper that just renders a full-size [`MonthGrid2D`](../../src/wordweaver/MonthGrid2D.js) (`compact: false, showWeekdayRow: true`). The grid's cells come from [`createDayCell2D`](../../src/wordweaver/DayCell2D.js), which renders **day-number + category dots only**. Headline deltas vs. §6.3:

- **No event pills (biggest gap):** §6.3 requires up to 3 event **pills** — a colored bar with truncated **title text** — inside each day cell. The current cell shows colored *dots* with no text. `DayCell2D` has no pill concept at all.
- **No "…+N more":** §6.3 requires a "…+N more" affordance when a day has >3 events (opening a popover). Absent.
- **No month navigation / Today button:** `MonthView2D` has no controls; the only way back up is `Calendar2D`'s shared "← Back" button. §6.3 (line 685–686) requires prev/next-month arrows and a Today button. Absent.
- **Out-of-month days are blank pads, not dimmed days:** `MonthGrid2D` renders `.ww-day-cell-2d--pad` (visibility:hidden, non-interactive) for the leading/trailing cells. §6.3 (line 672) wants out-of-month days **dimmed and shown** (non-interactive beyond navigation). Divergence — decide: keep blank pads (simpler) or render dimmed neighbor-month dates (spec-literal). This spec recommends dimmed neighbor dates behind a flag, defaulting to spec behavior for the full month view while the **compact** year mini-grid keeps blank pads.
- **Week-start preference unwired:** `MonthGrid2D` hardcodes `WEEKDAYS = ["Sun"…"Sat"]` and `first.getDay()` (Sunday=0). §6.3 (line 669) says "Sunday–Saturday or Monday–Sunday, based on user preference." This is the 4.1.3 carry-forward (week-start locale correctness) coming due. Phase 3.3 introduced a `preferenceChanged { key, value }` bus seam — wire week-start from it.
- **Vertical scroll:** the `Calendar2D__body` is `overflow: auto`; §26.3 says the month view should **not** scroll vertically — cells should adjust height to fit. Current cells are fixed `min-height: 44px`. Divergence to reconcile (4.2.5).
- **Tap routing too coarse:** the whole day cell is one button → `onDaySelect`. §6.3 distinguishes **day-number tap → Day View** from **event-pill tap → Event Detail panel** and **"+N more" → popover**. Current cell collapses all of these into one drill.
- **Bus gap (same as 4.1):** `Calendar2D` re-renders off `window` `"timelineUpdated"` / `"inkling:alerts-updated"` and navigates via constructor callbacks — it is **not** on the Phase 2 `EventBus` and emits no `monthFocused` / `dayFocused` / `navigateTo` (§13.2).

---

## 4.2.1 — Promote the Month View to a named `MonthView2D` sub-view under the 2D container

- **Purpose:** Give the month level a stable identity addressable by the top-bar view nav and the bus, matching the §11 architecture tree (`MonthView2D`).
- **Dependencies:** Phase 3.1 (2D container + view nav); 4.1.1 (year shell pattern); Phase 1 timeline model.
- **Acceptance criteria:** A `MonthView2D` view exists under `Calendar2DContainer`; selecting "Month" in the top bar shows it; it holds no event data of its own and reads via `timelineModel.js` (§2.3); class name matches §11.
- **Implementation notes:** The class is already named `MonthView2D` (no rename needed, unlike 4.1's `YearView`→`YearView2D`). Keep it as the `view === "month"` branch of `Calendar2D._render()` (Calendar2D.js:447), but make *selection* of that branch reachable from the bus (4.2.9), not only via the Year drill callback or Back button. `MonthView2D` should own its `{year, month}` and re-derive everything from the model on render.
- **Edge cases:** Month view requested while `calendarMode === "3d"` (no-op for 2D; 3D month focus is separate); first mount before any `navigateTo` (default to current month — current `Calendar2D` constructor sets `this.month = now.getMonth()+1`).
- **UI/UX considerations:** Title shows month + year (already: `toLocaleDateString({month:"long", year:"numeric"})` at Calendar2D.js:448); Back button visible at month level (already — `backBtn.hidden = this.view === "year"`).
- **Data flow notes:** `navigateTo { level: "month", date }` → `Calendar2D` sets `view = "month"`, `year/month` from `date` → renders `MonthView2D`.
- **Testing notes:** Selecting Month renders the 7-column grid for the current month; no direct timeline writes; class name matches spec.
- **Performance notes:** Single view swap (`replaceChildren`), no renderer teardown.
- **Mobile vs desktop:** Identical entry path; layout differences in 4.2.5.
- **Integration points:** §6.1, §11, §2.3.
- **Status:** **Built** (class exists, correctly named). **Gap:** selection not bus-addressable. **Next:** route selection through the bus (4.2.9).

## 4.2.2 — 7-column month grid with weekday header and week-start preference

- **Purpose:** Lay out the month as the canonical 7×(4–6) grid with a correct, preference-aware week start (§6.3).
- **Dependencies:** 4.2.1; Phase 3.3 `preferenceChanged` seam (week-start preference).
- **Acceptance criteria:** 7 columns with a weekday header row; 4–6 week rows depending on the month; the week start (Sunday vs Monday) follows the user preference; day-of-week alignment is correct for 28/29/30/31-day months including leap-Feb.
- **Implementation notes:** Today `MonthGrid2D` hardcodes `WEEKDAYS = ["Sun"…"Sat"]`, `startPad = first.getDay()` (Sun=0), and `totalCells = ceil((startPad + daysInMonth)/7)*7` (MonthGrid2D.js:5,46,48). To honor week-start preference: introduce a `weekStartsOn` (0=Sun,1=Mon) option, rotate the `WEEKDAYS` labels, and compute `startPad = (first.getDay() - weekStartsOn + 7) % 7`. Source the preference from Phase 3.3 (`preferenceChanged { key:"weekStartsOn" }`) — this closes the 4.1.3 carry-forward. **Guard:** the compact year mini-grid (4.1.3) must adopt the same week-start so year and month agree; verify the compact CSS still aligns after rotation.
- **Edge cases:** Month starting exactly on the week-start day (zero padding); months needing 6 rows (e.g. 31-day month starting late in the week); preference change while the view is open (re-render on `preferenceChanged`); locale month/weekday names of varying length must not break columns.
- **UI/UX considerations:** Weekday header legible (`ww-month-grid-2d__weekdays`); header hidden in compact mode (`showWeekdayRow: false`) so the year mini-grids are unaffected.
- **Data flow notes:** Pure layout from `{year, month, weekStartsOn}`; per-cell content from 4.2.3.
- **Testing notes:** Sun-start vs Mon-start both align the 1st correctly; leap-Feb (29 days) and a 31-day month starting Saturday both render the right row count; changing the preference re-renders with the new start.
- **Performance notes:** One grid build per render; ~35–42 cells.
- **Mobile vs desktop:** Same column count; cell sizing diverges in 4.2.5.
- **Integration points:** §6.3, §2.3, Phase 3.3 `preferenceChanged`.
- **Status:** **Partial** (7-col grid + header built; week-start hardcoded to Sunday). **Gap:** no preference wiring. **Next:** add `weekStartsOn`, rotate labels + padding, subscribe to `preferenceChanged`; verify compact year grid.

## 4.2.3 — Day cell content: event pills (up to 3) with title text

- **Purpose:** Make the month view answer "what's on each day?" with real titles — the core §6.3 upgrade over the current dots-only cell.
- **Dependencies:** 4.2.2; `getEventsForMonth` (§3.x); `CategoryColors`.
- **Acceptance criteria:** Each in-month day cell shows up to **3 event pills** — a category-colored bar with the event's **truncated title** (and time if present) — with the day number in the top-right; pills are ordered by time then title; the existing alert icon and category dots remain available per §6.3.
- **Implementation notes:** **This is the largest functional gap.** `createDayCell2D` (DayCell2D.js) renders only `__num` + `__dots` (+ optional alert). Extend it (or add a non-compact pill renderer) to emit a `.ww-day-cell-2d__pills` list of up to 3 `<button class="ww-event-pill">` elements, each `background: CategoryColors[cat]`, text = `${time ? time+" " : ""}${truncate(title)}`. **Critical guard:** pills must render **only when `compact === false`** so the year mini-grids (4.1.3) stay dot-only and don't blow up the 12-block layout. Reuse the `errand`→`errands` alias already in `DayCell2D`/`MonthGrid2D` (centralize per 4.1.4). Day number moves to top-right per §6.3 (currently centered `__num`).
- **Edge cases:** Long titles (CSS ellipsis truncation, not JS slicing where possible); all-day vs timed events (timed show time prefix); starter/initial notes injected for today when empty (MonthGrid2D.js:79 already does this — pills must render those too); a day with exactly 3 events (no "+N"); 0 events (no pills, cell still tappable to Day View).
- **UI/UX considerations:** Pills must stay readable at cell width; color contrast of title text on category color (use the §21 theming contrast rule); pills are independently focusable buttons (a11y).
- **Data flow notes:** `getEventsForMonth(year,month)` → per-day filter (`e.date === iso`) → first 3 → pills; same source as the dots so they never disagree.
- **Testing notes:** A day with 2 events shows 2 titled pills; titles truncate without overflow; compact year grid shows **no** pills (only dots); starter-note day on "today" shows its note as a pill.
- **Performance notes:** One `getEventsForMonth` per render (already called once in `MonthGrid2D.render`); pill DOM is bounded at 3/cell.
- **Mobile vs desktop:** Fewer/condensed pills on narrow cells (4.2.5); consider showing dots-only fallback below a width threshold.
- **Integration points:** §6.3, §3.x, §21 (theming/contrast), `CategoryColors`.
- **Status:** **Missing** (cells render dots, no titled pills). **Next:** add a non-compact pill renderer to `DayCell2D`, gated on `!compact`.

## 4.2.4 — "…+N more" overflow affordance and popover

- **Purpose:** Surface days with more than 3 events without breaking the grid (§6.3).
- **Dependencies:** 4.2.3.
- **Acceptance criteria:** When a day has >3 events, the cell shows a "…+N more" link below the 3 pills; activating it opens a popover listing **all** events for that day; the popover is dismissible (click-away / Esc) and keyboard-accessible.
- **Implementation notes:** In the pill renderer (4.2.3), if `dayEvents.length > 3`, append a `<button class="ww-event-pill__more">…+${len-3} more</button>`. On activate, open a lightweight popover anchored to the cell listing every event (title, time, category swatch). The popover can reuse the `DayView2D` list styling (`ww-day-view-2d__item`) for consistency. Must `stopPropagation` so it doesn't also trigger the cell's day-drill.
- **Edge cases:** Exactly 3 events (no "+N"); many events (popover scrolls internally, not the grid); popover near viewport edge (flip/clamp position); opening one popover closes any other; popover open during a re-render (close it or re-anchor).
- **UI/UX considerations:** "+N more" must be visually distinct from event pills; popover should not be mistaken for the Event Detail panel (it's a list, tapping an item there → Day View or Event Detail per 4.2.8).
- **Data flow notes:** Same per-day event array as the pills; the popover reads it, writes nothing.
- **Testing notes:** A day with 5 events shows 3 pills + "…+2 more"; activating lists all 5; Esc/click-away closes; only one popover open at a time.
- **Performance notes:** Popover built lazily on demand, torn down on close.
- **Mobile vs desktop:** On mobile the popover may present as a bottom sheet rather than an anchored popover (§8.x mobile patterns).
- **Integration points:** §6.3.
- **Status:** **Missing.** **Next:** add overflow link + popover; defer Event-Detail wiring to 4.2.8.

## 4.2.5 — Cells fill viewport height; no vertical scroll; responsive + tap targets

- **Purpose:** Make the month grid fit the available height without vertical scrolling and stay usable across breakpoints (§6.3, §26.3, §8.7).
- **Dependencies:** 4.2.2, 4.2.3.
- **Acceptance criteria:** The 7-column grid fills the body height with rows sized to fit (no vertical scroll of the month, per §26.3); out-of-month cells are dimmed and non-interactive beyond navigation (§6.3) **or** kept as blank pads behind a documented flag; day cells meet the ≥28×28px mobile tap-target minimum (the 4.1.5 gap — full cells are `min-height: 44px`, already fine; only **compact** cells were 22px).
- **Implementation notes:** Today `Calendar2D__body` is `overflow: auto` (Calendar2D.js:48–54) and cells are fixed `min-height: 44px`. For §26.3, give the month grid a `flex: 1` / CSS-grid with `grid-template-rows: auto repeat(rows, 1fr)` so rows divide remaining height; cap pill count by row height. For out-of-month days, replace the `--pad` blank cells (MonthGrid2D.js:70) with dimmed neighbor-month date cells (`.ww-day-cell-2d--outside`, `pointer-events: none` or navigation-only) when `!compact`; keep blank pads for the compact year grid. Decide explicitly and document.
- **Edge cases:** 6-row months (rows get shorter — ensure ≥1 pill still fits or fall back to dots); very short viewports (allow a single internal scroll as graceful degradation rather than clipping events); landscape phones; the year compact grid must keep its current fixed-height behavior.
- **UI/UX considerations:** Dimmed out-of-month days should read clearly as "not this month"; today's cell highlight (4.2.6) must remain visible against the fill-height layout.
- **Data flow notes:** Layout-only; no data impact. Out-of-month dimmed cells still read from the model for *their* month if shown.
- **Testing notes:** A 5-row and a 6-row month both fit without vertical scroll at desktop height; at ≤420px cells are ≥28×28px; out-of-month days are visibly dimmed and non-interactive (or pads, per chosen flag).
- **Performance notes:** CSS-driven sizing; negligible.
- **Mobile vs desktop:** Primary divergence point — mobile may reduce pills→dots and rely more on drilling.
- **Integration points:** §6.3, §26.3, §8.7.
- **Status:** **Partial** (grid renders; blank pads; `overflow:auto` scrolls; full cells already ≥28px). **Gap:** not height-filling, out-of-month not dimmed. **Next:** fill-height rows + dimmed neighbor cells (flagged), keep compact path unchanged.

## 4.2.6 — Today highlight, alert icon, and category dots reconciliation

- **Purpose:** Keep the per-day signals (today ring, alert icon, category dots) correct and consistent with year/week views while the pill upgrade lands.
- **Dependencies:** 4.2.3; alerts model (`loadAlerts`).
- **Acceptance criteria:** The current day's cell shows the `is-today` ring when viewing the current month; days with active (non-dismissed) alerts show the alert icon; category dots remain available (below pills) per §6.3; all signals derive from the same per-day event set as the pills.
- **Implementation notes:** `MonthGrid2D.render` already computes `today = todayIsoDate()`, builds an `alertIds` set from `loadAlerts()` (MonthGrid2D.js:36–43), and passes `isToday`/`alertId` into `createDayCell2D` — keep this. Ensure the new pill layout doesn't displace the alert icon or dots; order within the cell: day-number (top-right), pills, "+N more", dots row, alert icon. Recompute "today" on day rollover and on the timeline/`modeChanged` re-render (4.2.9). Centralize the `errand`→`errands` alias (still duplicated across `DayCell2D`, `MonthGrid2D`, `Calendar2D`).
- **Edge cases:** Viewing a non-current month (no today ring — correct); midnight rollover while open (re-mark on next render); a day with alerts but no pills still shows the alert icon; dismissed alerts excluded (already filtered).
- **UI/UX considerations:** Today ring vs out-of-month dimming vs alert icon must not visually collide; dots shouldn't duplicate the pill colors confusingly (consider dots only for categories beyond the 3 shown pills).
- **Data flow notes:** `todayIsoDate()` + `loadAlerts()` + per-day events → cell signals; read-only.
- **Testing notes:** Current month rings today; a day with an undismissed alert shows ⏰; non-current month rings nothing; alias collapses `errand`/`errands`.
- **Performance notes:** One `loadAlerts()` per render (already the case); fine.
- **Mobile vs desktop:** Identical signal logic.
- **Integration points:** §6.3, §7.x (alerts), `CategoryColors`.
- **Status:** **Built** (today ring, alert icon, dots all present via shared grid). **Gap:** ordering vs new pills; alias still duplicated. **Next:** integrate signals into the pill cell layout; centralize alias.

## 4.2.7 — Month navigation (prev/next month) and Today button

- **Purpose:** Let the user move across months and jump back to the current month without leaving the month level (§6.3 line 685–686).
- **Dependencies:** 4.2.1.
- **Acceptance criteria:** Left/right controls (and keyboard ◀/▶) change the month by ∓1, rolling the year at Dec→Jan / Jan→Dec, and re-render; a Today button jumps to the current month and highlights today; each change emits `navigateTo { level:"month", date }` and `monthFocused { year, month }` (4.2.9); the title updates.
- **Implementation notes:** **Not implemented today.** Add prev/next buttons + a "Today" button to `MonthView2D` (or to the shared `Calendar2D__header` alongside the year controls from 4.1.7, gated to show only at `view === "month"`). Month arithmetic: `month===1` prev → `{year-1, 12}`; `month===12` next → `{year+1, 1}`. Today button sets `{year, month}` from `new Date()` and ensures `view==="month"`. Changing month re-derives all cells + signals (4.2.3, 4.2.6).
- **Edge cases:** Year rollover at the boundaries; holding the arrow (debounce repeat); month nav only meaningful at month level (hide controls at year/day, like the Back button); Today pressed while already on the current month (re-highlight, no spurious double-emit — see 4.2.9).
- **UI/UX considerations:** Arrows flank the month/year title; Today button visually distinct; all controls ≥28px tap targets on mobile (§6.3 / §8.7).
- **Data flow notes:** Month nav → set `{year, month}` → re-render → emit `navigateTo` + `monthFocused`.
- **Testing notes:** ◀/▶ step months with correct year rollover; Today returns to the current month and rings today; title matches; one `navigateTo`/`monthFocused` per change.
- **Performance notes:** One full month re-render per step; batch via 4.2.10's render guard.
- **Mobile vs desktop:** Arrows + Today tap-friendly on mobile.
- **Integration points:** §6.3, §13.2 (`navigateTo`, `monthFocused`).
- **Status:** **Missing.** **Next:** add prev/next-month + Today controls (level-gated) + keyboard + emits.

## 4.2.8 — Interaction routing: day-number → Day View, event pill → Event Detail, "+N" → popover

- **Purpose:** Distinguish the three §6.3 tap targets so each gesture goes to the right destination, instead of the current single whole-cell drill.
- **Dependencies:** 4.2.3, 4.2.4; 4.4 (Day View target); Event Detail panel (cross-milestone dependency).
- **Acceptance criteria:** Tapping the **day number** (or empty cell area) opens that day (→ 4.4 / `dayFocused`); tapping an **event pill** opens the Event Detail panel for that event; tapping **"…+N more"** opens the day's popover (4.2.4); these targets do not interfere (event-pill tap must not also drill the day).
- **Implementation notes:** Today the whole cell is one `<button>` → `onDaySelect` (DayCell2D.js:48–52). Restructure so the cell is a container with: a day-number button (→ `openDay`/`dayFocused`), independent pill buttons (→ Event Detail), and the "+N" button (→ popover) — each calling `e.stopPropagation()`. **Event Detail panel:** if it doesn't exist yet in 2D, this milestone wires the *intent* (emit an `openEventDetail`/equivalent or fall back to opening the Day View) and flags the missing panel as a dependency for a later milestone. Mirror the year view's click-disambiguation lesson (4.1.8): inner targets win over the cell drill.
- **Edge cases:** Empty day cell (only the day-number/day drill applies); keyboard activation (Enter/Space on focused pill vs day-number); rapid double-activation; padding/out-of-month cells inert (4.2.5).
- **UI/UX considerations:** Pills look tappable and distinct from the day number; the whole cell still offers a day drill on its empty area for fat-finger forgiveness.
- **Data flow notes:** day-number → `openDay(iso)` + `dayFocused`; pill → Event Detail (or `openEventDetail` emit); "+N" → local popover.
- **Testing notes:** Pill tap opens detail (or documented fallback) and does **not** drill the day; day-number tap opens Day View; "+N" opens popover; out-of-month cells do nothing.
- **Performance notes:** Per-cell listeners bounded (≤3 pills + number + "+N"); consider event delegation at the grid if cell count/listeners grow.
- **Mobile vs desktop:** Larger tap targets on mobile; long-press could map to the §26.2 context menu later (out of scope here).
- **Integration points:** §6.3, §13.2 (`dayFocused`), §26.2 (future context menu), Event Detail panel (dependency).
- **Status:** **Missing** (single whole-cell drill). **Gap:** no pill/number/"+N" distinction; Event Detail panel may not exist. **Next:** split cell targets; wire pill→detail (or documented fallback) and flag the panel dependency.

## 4.2.9 — Bus integration: subscribe `navigateTo`/`modeChanged`/timeline, emit `monthFocused`/`dayFocused`

- **Purpose:** Replace ad-hoc `window` events and constructor callbacks with the Phase 2 `EventBus` so the month view participates in the §13.2 contract and the 3.1 top-bar nav can drive it — the same migration as 4.1.9, extended to the month-specific events.
- **Dependencies:** Phase 2 (EventBus), Phase 3.1 (view nav, `modeChanged`), Phase 3.3 (`preferenceChanged` for 4.2.2); 4.2.7, 4.2.8.
- **Acceptance criteria:** `Calendar2D` subscribes to `navigateTo` (sets view/level/date, including `level:"month"`), to the timeline-changed bus event (re-render when in 2D), to `modeChanged` (render only when `2d`), and to `preferenceChanged` (re-render on week-start change); it emits `monthFocused { year, month }` on entering/navigating a month and `dayFocused { date }` / `navigateTo { level:"day" }` on day drill (§13.2). `monthFocused`'s subscriber is `InklingPanel` (§13.2 line 1169).
- **Implementation notes:** **Today `Calendar2D.mount` listens to `window.addEventListener("timelineUpdated", …)` and `"inkling:alerts-updated"` and navigates via constructor callbacks** (Calendar2D.js:383–388) — migrate all of these to the EventBus once at mount. Keep the "only render in 2D mode" guard but source mode from `modeChanged`. This is the **same plumbing as 4.1.9** — do it once in `Calendar2D` so year/month/day all benefit; this milestone adds the `monthFocused` emit specifically. Grep for remaining `window`-event dispatchers before deleting the listeners (a thin shim may be needed during transition).
- **Edge cases:** Events arriving while in 3D (keep state current, skip render); duplicate `navigateTo`/Today for the already-active month (no-op, no spurious `monthFocused`); apply state before emitting; ordering with the year view's emits (no double-emit when drilling year→month).
- **UI/UX considerations:** Invisible plumbing; payoff is top-bar "Month"/"Today" and Inkling "go to <month>" navigation now move the 2D month view, and Inkling receives `monthFocused` to summarize the month (§13.2 line 377).
- **Data flow notes:** bus `navigateTo {level:"month"}` → Calendar2D state → render `MonthView2D`; month entry → emit `monthFocused` → InklingPanel; day drill → emit `dayFocused`.
- **Testing notes:** `navigateTo {level:"month"}` shows the month; timeline/preference change re-renders only in 2D; entering a month emits `monthFocused` once; drilling a day emits `dayFocused` once; no `window`-event reliance remains (or shim documented).
- **Performance notes:** Subscribe once on mount; the container persists so unsubscribe is mount-time only; coalesce bursts via the 4.2.10 render guard.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 (`navigateTo`, `monthFocused`, `dayFocused`, `modeChanged`, `preferenceChanged`), §2.1.
- **Status:** **Missing** (uses `window` events + callbacks; emits nothing). **Gap:** not on EventBus; no `monthFocused`. **Next:** migrate `Calendar2D` to the bus (shared with 4.1.9) and add the `monthFocused` emit.

## 4.2.10 — Cross-check with §6.3, §6.1, §26.3, §13.2 and guard the shared grid

- **Purpose:** Confirm the month view honors the 2D-view contract, the event catalog, and the no-scroll rule before 4.3 (Week) and 4.4 (Day) build on the same shell — and ensure the pill/grid changes did not regress the year view's compact mini-grids.
- **Dependencies:** 4.2.1–4.2.9.
- **Acceptance criteria:** Verified against §6.3 (7 cols by preference, 4–6 rows, fill-height cells, dimmed out-of-month, day-number top-right, ≤3 pills + "…+N more", alert icon, dots, month nav, Today), §6.1 (shared data source; sub-view switch never changes `calendarMode`), §26.3 (no vertical month scroll), §13.2 (`navigateTo`/`monthFocused`/`dayFocused`/`modeChanged` usage), §11 naming (`MonthView2D`). The **compact year mini-grid (4.1.3) still renders dot-only with no pills/no "+N"** and remains laid out correctly. Deviations fixed or documented.
- **Implementation notes:** Walk the reconciliation list at the top of this file and confirm each gap is closed or documented: pills (gated on `!compact`), "+N more" popover, week-start preference, fill-height/no-scroll, dimmed out-of-month, month nav + Today, split tap routing, bus + `monthFocused`. Re-run the year view (4.1) visually to confirm **no regression** from shared `MonthGrid2D`/`DayCell2D` changes. Confirm a sub-view switch (year↔month↔day) never writes `calendarMode` (§6.1).
- **Edge cases:** Re-assert read-only (no event-store writes from the month view, §2.3); same-level/Today `navigateTo` does not double-emit; compact path untouched.
- **UI/UX considerations:** Confirm "immediate visual response" (§1.4) on month nav, Today, and day drill; popover and Event-Detail intents behave.
- **Data flow notes:** Confirms month view's bus sources/subscribers match §13.2 and share the model with year/week/day.
- **Testing notes:** Spec-to-implementation checklist passes for §6.3/§6.1/§26.3/§13.2; year compact grid regression test passes; no `calendarMode` writes from sub-view changes.
- **Performance notes:** Add/confirm a render guard so back-to-back model/nav/preference events coalesce into one re-render (the current `_render` rebuilds the whole grid each time).
- **Mobile vs desktop:** Both layouts verified at the §8.7 breakpoints, including the no-scroll fit on short viewports.
- **Integration points:** §6.1, §6.3, §26.3, §13.2, §11.
- **Status:** **Checklist** (gates the milestone). **Next:** run after 4.2.1–4.2.9, including the year-view regression pass.

---

### Milestone 4.2 — Definition of Done
- `MonthView2D` renders a single month as a 7-column grid (week start by user preference, 4–6 fill-height rows, no vertical scroll per §26.3), reading only from `timelineModel.js` (§2.3, §6.3).
- Each in-month day cell shows the day number (top-right), up to 3 **event pills** with truncated titles, a "…+N more" overflow popover when needed, plus the alert icon and category dots; out-of-month days are dimmed/non-interactive (or documented blank pads), and the **compact year mini-grid stays dot-only with no regression**.
- Prev/next-month navigation and a Today button work (controls + keyboard) and "today" is highlighted in the current month (§6.3).
- Tap routing is split per §6.3: day-number → Day View (→ 4.4), event pill → Event Detail panel (or documented fallback), "…+N more" → popover; the view is driven by the **EventBus** — subscribing to `navigateTo`/`modeChanged`/`preferenceChanged` and the timeline-changed event, emitting `monthFocused`/`dayFocused` (§13.2) — replacing the legacy `window` events and constructor callbacks.
- Switching the 2D sub-view never changes `calendarMode` (§6.1); the view performs no event-store writes.
- Carry-forward closed: the 4.1.3 week-start preference is now wired (§6.3) via the Phase 3.3 `preferenceChanged` seam.
- Next: Milestone 4.3 — Week View (2D).
