# Phase 4 — Milestone 4.3: Week View (2D) (Expanded)

**Goal:** A first-class `WeekView2D` sub-view that renders 7 day columns against a **vertical time axis** (§6.4), reads exclusively from the timeline model (§2.3), positions each event as a block from its start to end time (with an all-day row and overlap handling), supports prev/next-week navigation and a Today button, drills a day-header into the Day View and an event block into Event Detail, and is driven by the Phase 3 top-bar view nav via the event bus — not by the legacy `document`/`window` events of the two parallel week implementations.
**Spec alignment:** §6.1 (2D views share one data source; switching sub-views does not change `calendarMode`), §6.4 (Week View: 7 days side-by-side, vertical time axis 24h or 6am–10pm in 30-min increments, all-day row at top, blocks positioned start→end, no-`endTime` events render as 30-min blocks, block = category color + truncated title + time range, week nav arrows, Today button), §16.5 line 1379 (overlapping events → side-by-side sub-columns, min block width 80px), §16.6 line 1489 (virtual scrolling: events outside the visible scroll area not rendered), §26.x swipe nav (line 1745 swipe ←/→ = prev/next week; line 1746 swipe ↕ = scroll time axis), §2.3 (read from `timelineModel.js` only), §13.2 (`navigateTo {level:"week"}`, `weekFocused {weekStart}`, `dayFocused`, `modeChanged`), §11 architecture tree (`WeekView2D` under `Calendar2DContainer`), §3.x `getEventsForWeek/Date`.
**Sequencing:** Third level of the 2D drill (year → month → **week** → day). Reuses the bus-integration pattern shared by 4.1.9/4.2.9 (do it once in `Calendar2D`); receives drills from 4.2 (month) and hands off to 4.4 (Day). Unlike 4.1/4.2, the week level **does not yet exist as a `Calendar2D` view** — `this.view` is only `"year" | "month" | "day"` (Calendar2D.js:334) — so 4.3.1 must first *introduce* the week level. The two existing week renderers (`WeekGrid2D`, `WeekView`) are column-lists, not time-axis grids, so 4.3 is more build-from-spec than the prior two milestones.

---

## Current implementation status (reconciliation)

There are **two parallel, divergent week implementations today, neither wired as a 2D sub-view, and neither is a time-axis grid:**

1. [`src/wordweaver/WeekGrid2D.js`](../../src/wordweaver/WeekGrid2D.js) — a Mon→Sun **column-list**. Each column is a header button + a stack of category-colored event buttons showing `⏰ + time` and `text`. It is **not** mounted as a top-level view; `Calendar2D` only uses it as a small **context strip at the bottom of the Day View** (Calendar2D.js:313–320) with `onDaySelect: () => {}` (a no-op). It has no time axis, no nav, no today marker.
2. [`src/calendar/views/WeekView.js`](../../src/calendar/views/WeekView.js) — a separate **overlay panel** (`#week-view-panel` in `#ui-overlay`) with its own prev/next-week nav, opened via `document` `inkling:open-panel {panelId:"weekView"}` and closed via `inkling:close-all-panels`. Same column-list render (`.day-column` / `.event-block`), full day names. It re-renders off `document` `timelineUpdated` / `inkling:alerts-updated`. This is a **different** surface from the 2D shell and duplicates the week-list logic.

Headline deltas vs. §6.4:

- **No vertical time axis (biggest gap):** §6.4 requires a vertical axis (24h or 6am–10pm, 30-min increments) with events **positioned** from start to end. Both current renderers stack events in document order inside a column — no time positioning at all.
- **Event model lacks start/end (root dependency):** the model's `CalendarEventRecord` is `{ time, text, category, date, id, alertId }` (timelineModel.js:16–25) — a **single** `time` (HH:MM) string, **no `startTime`/`endTime`, no all-day flag, no separate title vs description**. §6.4's positioned blocks, all-day row, no-`endTime`→30-min rule, and drag/resize all assume a richer model that **does not exist yet**. This is the milestone's central reconciliation: either (a) extend the timeline model with `startTime`/`endTime`/`allDay` (a real schema change, likely its own Phase-1 follow-up task), or (b) ship an interim where `time` is the start and end is derived as start+30 min, all events timed (no all-day row) — documented as a known limitation. This spec recommends (b) now, (a) flagged as a dependency.
- **No "week" level in the 2D shell:** `Calendar2D.view` is `"year" | "month" | "day"` (Calendar2D.js:334); `_goBack` and `_render` have no week branch (Calendar2D.js:401–469). The top bar / bus cannot reach a standalone week. Must be introduced (4.3.1).
- **Week start hardcoded to Monday:** `getWeekStartMonday` + `DAY_NAMES = [Monday…Sunday]` (WeekGrid2D.js:11, timelineModel.js:426). §6.4 inherits the §6.3 week-start preference closed for the month in 4.2.2 — week must honor `weekStartsOn` via the same Phase 3.3 `preferenceChanged` seam.
- **No today highlight / no week nav / no Today button in the 2D path:** `WeekGrid2D` has none; only the *legacy overlay* `WeekView` has prev/next-week buttons — and that surface is the one we're trying to supersede, not extend.
- **No overlap handling:** §16.5 (line 1379) requires overlapping events to split into side-by-side sub-columns (min 80px). Current stacking ignores overlap.
- **Interaction too coarse / wrong targets:** §6.4 wants event block → Event Detail, empty time-slot → New Event prefilled with that date+time, header → (day context). Current blocks/headers all call `onDaySelect` (a no-op in the day strip). New Event form and Event Detail panel are cross-milestone dependencies.
- **Bus gap (same as 4.1/4.2):** neither surface is on the Phase 2 `EventBus`; `WeekView` listens to `document` events, `WeekGrid2D` is callback-driven. No `weekFocused` / `dayFocused` / `navigateTo {level:"week"}` (§13.2, which **does** define `weekFocused { weekStart }` at line 376/1168 and `navigateTo level:"week"` at line 1171 — so unlike `preferenceChanged`, the catalog already covers week).

---

## 4.3.1 — Introduce a `WeekView2D` sub-view and a `"week"` level in the 2D shell

- **Purpose:** Give the week its own addressable level in the year→month→week→day drill, matching the §11 architecture tree (`WeekView2D`) — the prerequisite that 4.1/4.2 already had but the week does not.
- **Dependencies:** Phase 3.1 (2D container + view nav); 4.1.1/4.2.1 (shell patterns); Phase 1 timeline model.
- **Acceptance criteria:** `Calendar2D.view` accepts `"week"`; a `WeekView2D` class renders under `Calendar2DContainer`; selecting "Week" in the top bar shows it; it owns a `weekStartIso` and re-derives everything from `timelineModel.js` (§2.3); class name matches §11; `_goBack` from week → month and from day → week (revise the current day→month shortcut).
- **Implementation notes:** Promote `WeekGrid2D` into a real `WeekView2D` (or wrap it) and add a `view === "week"` branch to `Calendar2D._render` (Calendar2D.js:432). Widen the `this.view` typedef (Calendar2D.js:334) and fix `_goBack` (Calendar2D.js:401) so the back chain is year←month←week←day, not the current year←month←day. Add `openWeek(weekStartIso)` paralleling `openMonth`/`openDay`. **Keep the Day View's bottom week-strip** (Calendar2D.js:313–320) working or retire it in favor of the real week level — decide and document (recommend: retire the no-op strip once the real week level lands, to avoid two week renders).
- **Edge cases:** Week requested while `calendarMode === "3d"` (no-op for 2D); first mount before any `navigateTo` (default to current week via `getWeekStartMonday()`); a week spanning two months/years (title must show the span, see 4.3.2).
- **UI/UX considerations:** Back button visible at week level (extend the `backBtn.hidden = this.view === "year"` rule, Calendar2D.js:435); title shows the week range.
- **Data flow notes:** `navigateTo {level:"week", date}` → `Calendar2D` sets `view="week"`, `weekStartIso` from `date` → renders `WeekView2D`.
- **Testing notes:** Selecting Week renders 7 columns for the current week; back chain steps week→month and day→week; no timeline writes; class name matches spec.
- **Performance notes:** Single view swap (`replaceChildren`), no renderer teardown.
- **Mobile vs desktop:** Identical entry path; layout in 4.3.5.
- **Integration points:** §6.1, §11, §2.3.
- **Status:** **Missing** (no `"week"` view; `WeekGrid2D` only used as a Day-View strip). **Next:** add the week level + `WeekView2D` + `openWeek` + back-chain fix.

## 4.3.2 — 7 day columns with header (abbrev + date), today marker, and week-start preference

- **Purpose:** Lay out the canonical 7-column week with a correct, preference-aware start and a clear "today" column (§6.4 header row).
- **Dependencies:** 4.3.1; Phase 3.3 `preferenceChanged` (week-start), reusing the seam closed for the month in 4.2.2.
- **Acceptance criteria:** 7 columns, each with a header showing the day **abbreviation + date number** (§6.4 line 693); the week start (Mon vs Sun) follows the user preference; the current day's column is visually marked when the current week is shown; a header tap drills that day (4.3.8).
- **Implementation notes:** Today `WeekGrid2D` hardcodes Monday start (`getWeekStartMonday`) and `DAY_NAMES` Mon→Sun (WeekGrid2D.js:11,38–39). Parameterize on `weekStartsOn` (0=Sun/1=Mon): pick the week-start helper accordingly (add `getWeekStartFor(date, weekStartsOn)` to the model, generalizing `getWeekStartMonday`), and order the 7 day labels from it. Source the preference from Phase 3.3 (`preferenceChanged {key:"weekStartsOn"}`) — **the same value the month uses (4.2.2)**, so week and month agree. Header text per §6.4 is abbrev+date (e.g. "Wed 4"), shorter than the current "Monday, Jun 4"; mark today's header with an `is-today` class.
- **Edge cases:** Sunday-start vs Monday-start ordering; week spanning a month/year boundary (headers still correct per-day); preference change while open (re-render); locale abbreviations of varying length must not break columns; "today" only marked when the displayed week contains today.
- **UI/UX considerations:** Headers legible and tappable; today column subtly highlighted (full-column tint, not just header) so it reads at a glance.
- **Data flow notes:** Pure layout from `{weekStartIso, weekStartsOn}`; per-column content from 4.3.3/4.3.4.
- **Testing notes:** Sun-start and Mon-start both order columns correctly; today highlighted only in the current week; preference change re-renders with new order; cross-month week labels correct.
- **Performance notes:** 7 columns built per render; trivial.
- **Mobile vs desktop:** Same 7 columns; horizontal scroll/condensation handled in 4.3.5.
- **Integration points:** §6.4, §2.3, Phase 3.3 `preferenceChanged`.
- **Status:** **Partial** (7 Mon→Sun columns + headers built; today/preference absent). **Next:** generalize week-start, add today marking, wire `preferenceChanged`.

## 4.3.3 — Vertical time axis (configurable range, 30-min increments)

- **Purpose:** Add the §6.4 time grid that turns the column-list into a real week view — a vertical axis the columns share so events can be positioned by time.
- **Dependencies:** 4.3.2.
- **Acceptance criteria:** A vertical axis spanning either 24h or a configurable 6am–10pm range in 30-minute increments; hour labels down one side; the 7 day columns align to the same axis; the axis scrolls vertically (with the option range as a preference).
- **Implementation notes:** **Not present today** — both renderers are document-flow stacks. Build an axis gutter (hour labels) + a grid background (30-min rows) shared by all 7 columns; columns become positioned containers (`position: relative`) so event blocks (4.3.4) can be absolutely placed by minute offset. Default range 6am–10pm per §6.4 with a preference to switch to full 24h (route via the same `preferenceChanged` seam, key e.g. `weekHourRange`). Pixels-per-minute is derived from the axis height / range; keep it in one constant so blocks and grid agree.
- **Edge cases:** Events outside the visible range (e.g. a 5am event when range is 6am–10pm) — clamp to the edge with an indicator, or auto-expand to 24h; DST days (23/25-hour days) — keep a fixed 24-slot model, accept the once-a-year visual skew (document); empty days still show the full axis.
- **UI/UX considerations:** "Now" line on today's column at the current minute (nice-to-have, aligns with the today marking in 4.3.2); axis labels not overwhelming (label hours, tick half-hours).
- **Data flow notes:** Layout-only; the axis itself reads no data — it's the coordinate system for 4.3.4.
- **Testing notes:** 6am–10pm and 24h ranges both render correct increments; a block's vertical position matches its time; out-of-range events are clamped/flagged.
- **Performance notes:** Grid background via CSS (repeating-linear-gradient) rather than per-tick DOM; see virtual scrolling in 4.3.9.
- **Mobile vs desktop:** Mobile may default to a tighter range and rely on vertical scroll; desktop can show more at once.
- **Integration points:** §6.4, §16.6 (virtual scroll), Phase 3.3 (`weekHourRange` preference).
- **Status:** **Missing.** **Next:** build the shared axis + grid + pixels-per-minute constant before positioning blocks.

## 4.3.4 — Position event blocks on the axis (start→end, all-day row, no-end → 30-min)

- **Purpose:** Render each event as a §6.4 positioned block instead of a stacked list item — the core upgrade, gated on resolving the model's missing start/end.
- **Dependencies:** 4.3.3; `getEventsForWeek` (§3.x); `CategoryColors`; **the start/end model decision (see reconciliation).**
- **Acceptance criteria:** Each event is a block in its day column, top = start time, height = duration; events with no end render as 30-minute blocks (§6.4 line 697); all-day events sit in a dedicated row at the top of the column (§6.4 line 696) **if** the model gains an all-day flag; block shows category color (§21), truncated title, and time range (§6.4 lines 700–702).
- **Implementation notes:** **Blocked on the model gap.** The record has only `time` (start), no `endTime`, no `allDay`, and `text` is a combined title/description (timelineModel.js:16–25, 455–456). **Interim (recommended now):** treat `time` as start, end = start+30 min, all events timed (no all-day row), title = `text` truncated, time-range = `formatTimelineDisplayTime(time)`–(+30). **Full (flagged dependency):** add `startTime`/`endTime`/`allDay` to `CalendarEventRecord` and the event-create path (a Phase-1 model task), then height tracks real duration and the all-day row activates. Keep the `errand`→`errands` category alias (centralize per 4.1.4; currently duplicated in WeekGrid2D.js:76 and WeekView.js:155). Position via the 4.3.3 pixels-per-minute constant.
- **Edge cases:** Zero-duration / no-end events (30-min minimum height); events crossing the visible-range edge (clip + indicator); midnight-spanning events (interim: single-day only — document); very short events still meet a minimum tappable height; starter/initial notes injected for empty days must position too.
- **UI/UX considerations:** Title legible on the category color (§21 contrast rule); time range readable; minimum block height for tappability even at 30 min.
- **Data flow notes:** `getEventsForWeek(weekStartIso)` → per-day filter (`ev.date === iso`, as today WeekGrid2D.js:47) → position each by `time` → block; same source as any dots so they never disagree.
- **Testing notes:** A 09:00 event sits at the 9am line; a no-end event is a 30-min block; (full path) a 2-hour event is twice as tall; (full path) an all-day event sits in the top row; title truncates without overflow.
- **Performance notes:** Bounded per visible range via 4.3.9 virtual scroll; one `getEventsForWeek` per render.
- **Mobile vs desktop:** Narrower blocks on mobile (4.3.5); same positioning math.
- **Integration points:** §6.4, §3.x, §21, `CategoryColors`, **model extension dependency (`startTime`/`endTime`/`allDay`).**
- **Status:** **Missing** (events stacked, not positioned) and **partially blocked** (no start/end in model). **Next:** ship the interim start+30 positioning; flag the model extension for a Phase-1 follow-up.

## 4.3.5 — Overlap layout (side-by-side sub-columns) + responsive widths + tap targets

- **Purpose:** Keep overlapping events readable per §16.5 and the week usable across breakpoints (§6.4, §8.7).
- **Dependencies:** 4.3.4.
- **Acceptance criteria:** Events overlapping in time within a day split into side-by-side sub-columns, each narrower, with a **minimum block width of 80px** (§16.5 line 1379); non-overlapping blocks use ~95% column width (§6.4 line 700); blocks meet the ≥28×28px mobile tap-target minimum (§8.7); on narrow screens the week scrolls horizontally or condenses gracefully.
- **Implementation notes:** Compute overlap clusters per day (sort by start, group transitively overlapping events), assign each event a sub-column index within its cluster, width = `100% / clusterColumns` (floored at 80px → switch to horizontal scroll within the day if it can't fit). This is a classic interval-graph column-assignment; keep it in a small pure helper (testable without DOM). Below a width breakpoint, fall back to the simple stacked list (the current WeekGrid2D behavior) as graceful degradation.
- **Edge cases:** Many concurrent events (cluster wider than 80px×N → horizontal scroll or "+N more" in the day); chained partial overlaps (A–B, B–C, A∤C) still share one cluster; zero-overlap day uses full width; exact-touch boundaries (end == next start) treated as non-overlapping.
- **UI/UX considerations:** Sub-columns visually distinct but clearly the same day; on mobile prefer drilling into Day View (4.4) over cramped sub-columns.
- **Data flow notes:** Layout-only over the per-day event array from 4.3.4.
- **Testing notes:** Two overlapping events render side-by-side ≥80px; three overlapping split into thirds or scroll; non-overlapping day uses full width; ≤420px keeps blocks ≥28px or degrades to the stacked list.
- **Performance notes:** Overlap computation is O(n log n) per day; bounded by events/day.
- **Mobile vs desktop:** Primary divergence point — desktop shows sub-columns; mobile degrades to stack/drill.
- **Integration points:** §16.5 (overlap, 80px min), §6.4, §8.7.
- **Status:** **Missing** (events stack, no overlap handling). **Next:** add the pure cluster/column-assignment helper + responsive fallback.

## 4.3.6 — Today marker, alert icon, and signal reconciliation across the two renderers

- **Purpose:** Keep per-event/per-day signals (today column, alert icon) correct and consistent with the month/day views, and converge the duplicated alert logic.
- **Dependencies:** 4.3.2, 4.3.4; alerts model (`loadAlerts`).
- **Acceptance criteria:** The current day's column is marked when the current week is shown (4.3.2); events with active (non-dismissed) alerts show the alert icon (matching `WeekGrid2D`'s current `⏰`); the alert-resolution logic (`alertId` set + `timelineEntryId` set) is shared, not re-implemented per renderer.
- **Implementation notes:** `WeekGrid2D.render` and `WeekView.render` currently **duplicate** the exact same alert-set construction (WeekGrid2D.js:31–36 ≈ WeekView.js:110–117) and the `hasAlert` test (WeekGrid2D.js:80–81 ≈ WeekView.js:158–160). Extract a shared `getActiveAlertSets()` / `eventHasAlert(ev, sets)` helper in the alerts model and use it from the week, month, and day cells so they never drift (this also helps 4.2.6's alert icon). Recompute "today" on day rollover and on the timeline/`modeChanged` re-render (4.3.9).
- **Edge cases:** Viewing a non-current week (no today marker); midnight rollover while open (re-mark on next render); an event with an alert but mid-range still shows ⏰; dismissed alerts excluded (already filtered in both renderers).
- **UI/UX considerations:** Today column tint vs alert icon vs category color must not visually collide; alert icon stays legible on the block's category background.
- **Data flow notes:** `loadAlerts()` → shared sets → per-event `hasAlert`; read-only.
- **Testing notes:** Current week marks today's column; an event with an undismissed alert shows ⏰; non-current week marks nothing; the shared helper returns identical results to the old inline logic.
- **Performance notes:** One `loadAlerts()` per render (already the case in both renderers); fine.
- **Mobile vs desktop:** Identical signal logic.
- **Integration points:** §6.4, §7.x (alerts), `CategoryColors`.
- **Status:** **Partial** (alert icon built in both renderers but **duplicated**; today marker absent). **Next:** extract shared alert helper; add today-column marking.

## 4.3.7 — Week navigation (prev/next week) and Today button

- **Purpose:** Let the user move across weeks and jump back to the current week without leaving the week level (§6.4 lines 710–711).
- **Dependencies:** 4.3.1.
- **Acceptance criteria:** Left/right controls (and keyboard ◀/▶) shift the week by ∓7 days and re-render; a Today button jumps to the current week and marks today; each change emits `navigateTo {level:"week", date}` and `weekFocused {weekStart}` (4.3.9); the title updates to the new week range.
- **Implementation notes:** The legacy overlay `WeekView` already implements ∓7-day nav (WeekView.js:76–84) — **port that arithmetic** into `WeekView2D`/`Calendar2D` header controls (reuse/extend the 4.1.7/4.2.7 header-control pattern, gated to show only at `view === "week"`). Week step: `parseIsoDate(weekStartIso)` ± 7 days → `isoFromDate`. Today button: `getWeekStartFor(new Date(), weekStartsOn)` and ensure `view === "week"`. Changing the week re-derives columns + signals (4.3.4, 4.3.6).
- **Edge cases:** Week crossing month/year boundary (title span + per-day headers stay correct); holding the arrow (debounce repeat); nav only meaningful at week level (hide at year/month/day, like Back); Today while already on the current week (re-mark, no spurious double-emit — 4.3.9).
- **UI/UX considerations:** Arrows flank the week-range title; Today distinct; all controls ≥28px tap targets (§8.7); **swipe ←/→ = prev/next week** on touch (§ line 1745) shares this handler.
- **Data flow notes:** Week nav → set `weekStartIso` → re-render → emit `navigateTo` + `weekFocused`.
- **Testing notes:** ◀/▶ step weeks with correct month/year rollover; Today returns to the current week and marks today; title matches; one `navigateTo`/`weekFocused` per change; swipe maps to the same step.
- **Performance notes:** One full week re-render per step; batch via 4.3.9's render guard.
- **Mobile vs desktop:** Desktop arrows + Today; mobile adds swipe ←/→.
- **Integration points:** §6.4, §13.2 (`navigateTo`, `weekFocused`), § line 1745 (swipe).
- **Status:** **Partial** (∓7 nav exists only in the legacy overlay `WeekView`, not the 2D shell). **Next:** port nav + add Today + keyboard/swipe + emits into the 2D week level.

## 4.3.8 — Interaction routing: header → Day View, event block → Event Detail, empty slot → New Event

- **Purpose:** Distinguish the §6.4 tap targets so each gesture goes to the right destination, instead of the current uniform `onDaySelect` no-op.
- **Dependencies:** 4.3.4; 4.4 (Day View target); Event Detail panel + New Event form (cross-milestone dependencies).
- **Acceptance criteria:** Tapping a **day header** opens that day (→ 4.4 / `dayFocused`); tapping an **event block** opens the Event Detail panel for that event (§6.4 line 706); tapping an **empty time slot** opens the New Event form pre-filled with that date **and** the slot's time (§6.4 line 707); targets don't interfere (block tap must not also create an event).
- **Implementation notes:** Today both renderers route header **and** block clicks to `onDaySelect` (WeekGrid2D.js:59,90) — and in the Day-strip usage it's a no-op. Restructure: header button → `openDay(iso)`/`dayFocused`; block button → Event Detail (emit `openEventDetail {id}` or fall back to opening the Day View, mirroring 4.2.8); empty-slot click on the axis → New Event prefilled with `{date: iso, time: slotTime}` derived from the click's vertical offset (inverse of the 4.3.3 pixels-per-minute). Each inner target calls `e.stopPropagation()`. **Drag-to-move / resize-bottom-edge (§6.4 lines 708–709) are desktop-only and require the start/end model (4.3.4) — flag as a follow-up once the model gains `startTime`/`endTime`.**
- **Edge cases:** Empty day (only header drill + empty-slot create apply); keyboard activation (Enter/Space on focused header vs block); rapid double-activation; clicking the all-day row vs a timed slot prefills differently (all-day vs timed New Event); out-of-range slot clicks clamp to the range.
- **UI/UX considerations:** Blocks look tappable and distinct from empty axis; empty-slot affordance discoverable (hover cue on desktop); fat-finger forgiveness on mobile.
- **Data flow notes:** header → `openDay(iso)` + `dayFocused`; block → Event Detail (or `openEventDetail`); empty slot → New Event `{date, time}`.
- **Testing notes:** Block tap opens detail (or documented fallback) and does **not** create an event; header tap opens Day View; empty-slot tap opens New Event prefilled with that date+time; keyboard reaches each target.
- **Performance notes:** Per-block listeners bounded by visible events; consider grid-level delegation for the empty-slot handler (one listener computing slot from offset).
- **Mobile vs desktop:** Drag/resize desktop-only (and model-gated); mobile relies on tap → detail and the New Event form.
- **Integration points:** §6.4, §13.2 (`dayFocused`), Event Detail panel + New Event form (dependencies), §26.2 (future long-press menu).
- **Status:** **Missing** (uniform `onDaySelect`, no-op in the Day strip; no empty-slot create; drag/resize model-blocked). **Next:** split header/block/empty-slot targets; wire detail + New Event intents; flag drag/resize.

## 4.3.9 — Bus integration + render guard + virtual scrolling

- **Purpose:** Put the week on the Phase 2 `EventBus` (the shared 4.1.9/4.2.9 migration, plus the week-specific `weekFocused`), coalesce re-renders, and meet the §16.6 virtual-scroll target — while retiring the legacy `document`/`window` week events.
- **Dependencies:** Phase 2 (EventBus), Phase 3.1 (view nav, `modeChanged`), Phase 3.3 (`preferenceChanged` for 4.3.2/4.3.3); 4.3.7, 4.3.8.
- **Acceptance criteria:** `Calendar2D` subscribes to `navigateTo` (incl. `level:"week"`), the timeline-changed bus event (re-render when in 2D), `modeChanged` (render only when `2d`), and `preferenceChanged` (week-start + hour-range); it emits `weekFocused {weekStart}` on entering/navigating a week and `dayFocused {date}` / `navigateTo {level:"day"}` on a header drill (§13.2); `weekFocused`'s subscriber is `InklingPanel` (§13.2 line 1168). The legacy `WeekView` overlay's `document` listeners (WeekView.js:38–53) and `WeekGrid2D`/`Calendar2D`'s `window` `timelineUpdated` (Calendar2D.js:383–388) are migrated or shimmed.
- **Implementation notes:** Do the bus migration **once** in `Calendar2D` (shared with 4.1.9/4.2.9), adding the `weekFocused` emit here. Decide the fate of the **standalone `WeekView` overlay**: either (a) retire it in favor of the 2D week level (preferred — removes the duplicate and its `document`-event coupling), or (b) keep it but move it onto the same bus and shared renderer. Grep for `inkling:open-panel {panelId:"weekView"}` and `timelineUpdated` dispatchers before deleting listeners (a thin shim may bridge during transition). **Virtual scrolling (§16.6 line 1489):** only build blocks for the visible scroll window of the time axis; recycle on scroll — pairs with the 4.3.3 axis.
- **Edge cases:** Events arriving while in 3D (keep state, skip render); duplicate `navigateTo`/Today for the already-active week (no-op, no spurious `weekFocused`); apply state before emitting; ordering with the month view's emits (no double-emit when drilling month→week); both week surfaces must not both respond during the transition (avoid double render).
- **UI/UX considerations:** Invisible plumbing; payoff is top-bar "Week"/"Today" and Inkling "go to next week" now move the 2D week view, and Inkling receives `weekFocused` to summarize the week (§13.2 line 376).
- **Data flow notes:** bus `navigateTo {level:"week"}` → Calendar2D state → render `WeekView2D`; week entry → emit `weekFocused` → InklingPanel; header drill → emit `dayFocused`.
- **Testing notes:** `navigateTo {level:"week"}` shows the week; timeline/preference change re-renders only in 2D; entering a week emits `weekFocused` once; header drill emits `dayFocused` once; no reliance on the legacy `document`/`window` week events remains (or shim documented); off-screen time rows aren't in the DOM.
- **Performance notes:** Subscribe once on mount; render guard coalesces back-to-back model/nav/preference events into one re-render; virtual scroll bounds DOM to the visible window.
- **Mobile vs desktop:** Identical plumbing; swipe nav (4.3.7) and time-axis scroll (§ line 1746) ride the same handlers.
- **Integration points:** §13.2 (`navigateTo`, `weekFocused`, `dayFocused`, `modeChanged`, `preferenceChanged`), §16.6 (virtual scroll), §2.1.
- **Status:** **Missing** (legacy `document`/`window` events; emits nothing; no virtual scroll). **Next:** migrate `Calendar2D` to the bus (shared), add `weekFocused`, retire/converge the overlay, add the render guard + virtual scroll.

## 4.3.10 — Cross-check with §6.4, §6.1, §16.5/§16.6, §13.2 and converge the duplicate week renderers

- **Purpose:** Confirm the week view honors the 2D-view contract, the time-axis/overlap/virtual-scroll rules, and the event catalog before 4.4 (Day) reuses the axis — and ensure the two legacy week renderers are converged (not left to drift).
- **Dependencies:** 4.3.1–4.3.9.
- **Acceptance criteria:** Verified against §6.4 (7 columns, vertical time axis 24h/6am–10pm in 30-min increments, all-day row, blocks positioned start→end, no-end → 30-min, block = color+title+time-range, week nav, Today), §16.5 (overlap sub-columns, 80px min), §16.6 (virtual scrolling), §6.1 (shared data source; sub-view switch never changes `calendarMode`), §13.2 (`navigateTo`/`weekFocused`/`dayFocused`/`modeChanged`), §11 naming (`WeekView2D`). The duplicate `WeekGrid2D` / `WeekView` logic is **converged or one is retired**; the **month/year compact paths are unaffected**. Deviations fixed or **documented** (notably the start/end model gap and the deferred drag/resize).
- **Implementation notes:** Walk the reconciliation list at the top and confirm each gap is closed or documented: week level introduced, time axis, positioned blocks (incl. the interim-vs-full model decision), overlap layout, week-start preference, today marker, week nav + Today, split tap routing + empty-slot create, bus + `weekFocused`, virtual scroll, and the retire/converge of the legacy overlay. Confirm a sub-view switch (year↔month↔week↔day) never writes `calendarMode` (§6.1) and the view performs no event-store writes (§2.3).
- **Edge cases:** Re-assert read-only; same-week/Today `navigateTo` does not double-emit; week crossing month/year boundary renders correctly; DST day documented.
- **UI/UX considerations:** Confirm "immediate visual response" (§1.4) on week nav, Today, day drill, and empty-slot create.
- **Data flow notes:** Confirms the week's bus sources/subscribers match §13.2 and it shares the model with year/month/day.
- **Testing notes:** Spec-to-implementation checklist passes for §6.4/§6.1/§16.5/§16.6/§13.2; the duplicate-renderer convergence is verified (only one week render path active); no `calendarMode` writes from sub-view changes.
- **Performance notes:** Confirm the render guard + virtual scroll hold under back-to-back model/nav/preference events.
- **Mobile vs desktop:** Both layouts verified at §8.7 breakpoints, including overlap degradation and swipe nav.
- **Integration points:** §6.1, §6.4, §16.5, §16.6, §13.2, §11.
- **Status:** **Checklist** (gates the milestone). **Next:** run after 4.3.1–4.3.9, including the duplicate-renderer convergence and the documented model-gap call-outs.

---

### Milestone 4.3 — Definition of Done
- A first-class `WeekView2D` exists as a `"week"` level in the 2D drill (year→month→week→day, back-chain fixed), reading only from `timelineModel.js` (§2.3), with the legacy no-op Day-View week strip and the standalone `WeekView` overlay **retired or converged** onto the same renderer/bus.
- The week renders 7 day columns (abbrev+date headers, week start by user preference, today column marked) against a **vertical time axis** (24h or 6am–10pm, 30-min increments, §6.4), with events **positioned** as start→end blocks (no-end → 30-min), an all-day row, and **overlap split into ≥80px side-by-side sub-columns** (§16.5).
- Prev/next-week navigation, a Today button, keyboard ◀/▶, and swipe ←/→ all work and emit (§6.4); tap routing is split per §6.4 — header → Day View (→ 4.4 / `dayFocused`), event block → Event Detail (or documented fallback), empty slot → New Event prefilled with date+time.
- The view is driven by the **EventBus** — subscribing to `navigateTo {level:"week"}`/`modeChanged`/`preferenceChanged` and the timeline-changed event, emitting `weekFocused`/`dayFocused` (§13.2) — with a render guard and **virtual scrolling** of the time axis (§16.6), replacing the legacy `document`/`window` events.
- Switching the 2D sub-view never changes `calendarMode` (§6.1); the view performs no event-store writes; the week-start preference stays consistent with the month (4.2.2).
- **Documented carry-forwards:** (1) the event model lacks `startTime`/`endTime`/`allDay` — shipped on the interim "start + 30 min, all timed" positioning, with the real model extension flagged as a Phase-1 follow-up that also unblocks drag-to-move and resize (§6.4 lines 708–709); (2) the duplicate week-alert logic is centralized into a shared alerts helper.
- Next: Milestone 4.4 — Day View (2D).
