# Phase 4 — Milestone 4.4: Day View (2D) (Expanded)

**Goal:** Upgrade `DayView2D` from a flat event list into the §6.5 single-day detail view: the **same vertical time axis as Week View but full width**, events as wide positioned blocks (left-border category accent, full title, time range, body preview, priority indicator), a **current-time "now" line** on today, prev/next-day navigation + Today + swipe, split tap routing (block → Event Detail, empty slot → New Event), and bus-driven entry — reading exclusively from the timeline model (§2.3) and reusing the time-axis / overlap / bus machinery built for the week in 4.3.
**Spec alignment:** §6.5 (Day View: same vertical time axis as Week but full width, side margin for hourly labels, current-time indicator line — red horizontal line for today; blocks = full column width minus padding, category-color **left border accent**, **full** title, time range, **body preview first 80 chars**, **priority indicator**; tap event → Event Detail, tap empty slot → New Event, swipe ←/→ mobile → prev/next day, day nav arrows), §6.4 (the shared time-axis/positioning/overlap rules the day inherits), §6.1 (2D views share one data source; switching sub-views never changes `calendarMode`), §16.6 line 1489 (virtual scrolling: Day **and** Week — events outside the visible scroll area not rendered), §17.5 lines 1384–1390 (desktop drag-to-move + resize-bottom-edge in Week **and** Day), §26.x line 1734 (swipe ←/→ = prev/next day), line 1746 (swipe ↕ = scroll time axis), line 1783 (2D Day/Week time-axis scroll position **persists across day navigation within the session**), §2.3 (read from `timelineModel.js` only), §13.2 (`navigateTo {level:"day"}`, `dayFocused {date}`, `modeChanged`, `preferenceChanged`), §11 architecture tree (`DayView2D` under `Calendar2DContainer`).
**Sequencing:** Fourth and deepest level of the 2D drill (year → month → week → **day**). It is the natural **reuse milestone**: the time axis (4.3.3), positioned-block + interim-model decision (4.3.4), overlap helper (4.3.5), shared alert helper (4.3.6), nav/Today/swipe pattern (4.3.7), split tap routing (4.3.8), and the once-in-`Calendar2D` bus migration + render guard + virtual scroll (4.3.9) were all designed so the day could consume them at full width. Unlike the week, the **day level already exists** in the shell (`Calendar2D.view` includes `"day"`, `openDay`, a `view==="day"` render branch — Calendar2D.js:334,425,459) — so 4.4 is an **upgrade**, not an introduction. It receives drills from 4.3 (week header) and 4.2/4.1 (day-cell taps) and is the leaf (no deeper drill).

---

## Current implementation status (reconciliation)

The day level is wired but the view is a **flat list, not a timeline** — a strictly smaller surface than §6.5:

[`DayView2D`](../../src/wordweaver/Calendar2D.js) (Calendar2D.js:269–324) renders a centered title (`weekday, Month day, year`) then a vertical **list** of `.ww-day-view-2d__item` blocks — each a full-fill category color with text `"{time} — {text}"` — and, when there are events, appends a **no-op `WeekGrid2D` context strip** at the bottom (`onDaySelect: () => {}`, Calendar2D.js:313–320). There is no time axis, no positioning, no now-line, no body/priority, no day nav, no distinct tap targets, and the bottom strip is dead weight.

Headline deltas vs. §6.5:

- **No vertical time axis (same biggest gap as 4.3):** §6.5 reuses the Week axis at full width with a side margin of hourly labels. The current view is document-flow stacked items with no time coordinate. → reuse the 4.3.3 axis component at full column width.
- **Model lacks `startTime`/`endTime` — and the spec already says it shouldn't (sharper than 4.3):** §2 of the master spec (lines 217–237) **defines** `startTime`/`endTime` as ISO 8601 on the event model, yet the live `CalendarEventRecord` is `{ id, date, time, text, category, kind, alertId, dayId }` (timelineModel.js:16–25) — a **single** `time` (HH:MM), no end, no all-day flag. So this is not just a missing feature but a **spec/implementation divergence**: the implementation never adopted the spec's datetime model. Same resolution as 4.3.4: ship the **interim** (`time` = start, end = start+30 min, all timed, no all-day row), and flag the real `startTime`/`endTime`/`allDay` adoption as a Phase-1 model task — which **also** unblocks day drag/resize (§17.5) exactly as it does for the week.
- **No body-preview or priority data in the model (a NEW gap unique to Day):** §6.5 blocks want a **body preview (first 80 chars)** and a **priority indicator** — but `CalendarEventRecord` has neither a `body`/description field separate from `text` nor a `priority` field (timelineModel.js:16–25). The spec's §2 model does describe richer events; the live record does not. **Interim:** derive the "body preview" from `text` (or omit if `text` is just the title) and omit/neutralize the priority indicator until the model gains `priority` — documented, and folded into the **same** model-extension follow-up as start/end.
- **No current-time "now" line:** §6.5 requires a red horizontal indicator at the current minute **for today**. Absent today. Build it as a day-view absolute element positioned by the 4.3.3 pixels-per-minute constant, shown only when `selectedDate === today`, ticking on a minute timer.
- **Block style differs by design (full-fill vs left-accent):** the current list uses a **full** category-color fill; §6.5 specifies a **left-border category accent** on a neutral block with full (untruncated) title + time range + body preview + priority. This is a deliberate Day-vs-Week/Month difference (Week blocks are color-filled and title-**truncated**; Day blocks are accent-bordered and title-**full**).
- **No day navigation / Today / swipe:** §6.5 wants prev/next-day arrows, a Today jump, and mobile swipe ←/→ (line 1734). None exist in the 2D day path (the legacy overlay had week nav only). Reuse the 4.3.7 header-control pattern gated to `view === "day"`, step ±1 day.
- **Uniform/again-no-op interaction:** the list items have **no** click handlers at all (Calendar2D.js:304–311 build static `div`s), and the bottom week strip's taps are a no-op. §6.5 wants block → Event Detail and empty-slot → New Event prefilled with date+time. Reuse 4.3.8's split routing at full width.
- **Bus gap (same as 4.1/4.2/4.3):** the day re-renders off `window` `timelineUpdated` / `inkling:alerts-updated` (Calendar2D.js:383–388) and emits nothing — no `dayFocused`, no `navigateTo {level:"day"}`. Fixed by the **shared** `Calendar2D` bus migration (4.3.9); the day adds the `dayFocused` emit.
- **Dead bottom week strip:** the `WeekGrid2D` strip with `onDaySelect: () => {}` (Calendar2D.js:313–320) duplicates a week render inside the day and goes nowhere. 4.3.1 already flagged retiring it once the real week level lands; 4.4.8 removes it.

---

## 4.4.1 — Upgrade `DayView2D` to a full-width time-axis day view (reuse the 4.3 axis)

- **Purpose:** Replace the flat list with the §6.5 single-day timeline — the same vertical axis as the week, rendered full width — so events read by time, not document order.
- **Dependencies:** 4.3.3 (shared time axis + pixels-per-minute constant), 4.3.1 (back-chain now year←month←week←day); the day level already exists (Calendar2D.js:425,459).
- **Acceptance criteria:** `DayView2D` renders one full-width day column against the shared vertical axis (24h or 6am–10pm, 30-min increments, §6.5 line 718) with a side margin of hourly labels (line 720); it re-derives everything from `timelineModel.js` (§2.3); class name matches §11 (`DayView2D`); the day sits correctly in the year←month←week←day back-chain.
- **Implementation notes:** Factor the 4.3.3 axis into a shared component (axis gutter + 30-min grid background + `position: relative` column) and have **both** `WeekView2D` (7 columns) and `DayView2D` (1 full-width column) consume it — the spec explicitly says "same vertical time axis as Week View but full width" (line 718), so this must be one implementation, not two. Replace the current list-building body (Calendar2D.js:281–311) with axis + positioned blocks (4.4.2). Keep `openDay(dateIso)` and the `view === "day"` branch (Calendar2D.js:459) but swap the renderer. Confirm `_goBack` from day → **week** (4.3.1 changed this from the old day→month).
- **Edge cases:** Day requested while `calendarMode === "3d"` (no-op for 2D); first mount before any `navigateTo` (default to today); empty day still shows the full axis (not the old "No events this day." text — or keep that as an overlay on the empty axis); a day with events only outside the visible range (clamp/expand per 4.3.3).
- **UI/UX considerations:** Full-width column gives generous block width — no horizontal scroll in the common case; back button visible at day level (already true since `backBtn.hidden = view==="year"`, Calendar2D.js:435).
- **Data flow notes:** `navigateTo {level:"day", date}` → `Calendar2D` sets `view="day"`, `selectedDate` → renders `DayView2D` over the shared axis.
- **Testing notes:** Day renders the full-width axis with hourly labels; back steps day→week; class name matches §11; no timeline writes.
- **Performance notes:** Single view swap (`replaceChildren`); axis grid via CSS, not per-tick DOM (4.3.3).
- **Mobile vs desktop:** Same axis; mobile relies on vertical scroll (4.4.4 scroll-to-now helps).
- **Integration points:** §6.5, §6.1, §11, §2.3, shared axis (4.3.3).
- **Status:** **Partial** (day level + `openDay` exist; renderer is a flat list, no axis). **Next:** swap the list body for the shared full-width axis.

## 4.4.2 — Position event blocks full-width (start→end, no-end → 30-min, all-day row)

- **Purpose:** Render each event as a §6.5 positioned wide block instead of a stacked list item — the day twin of 4.3.4, gated on the same model gap.
- **Dependencies:** 4.4.1; `getEventsForDate` (already used — Calendar2D.js:428); `CategoryColors`; **the start/end model decision (shared with 4.3.4).**
- **Acceptance criteria:** Each event is a block in the day column, top = start, height = duration; no-`endTime` events render as 30-minute blocks (§6.5 inherits §6.4 line 697); all-day events sit in a dedicated top row **if** the model gains an all-day flag; block width = full column minus padding (§6.5 line 724); position uses the 4.3.3 pixels-per-minute constant.
- **Implementation notes:** **Same model block as 4.3.4** — record has only `time`, no `endTime`/`allDay` (timelineModel.js:16–25), and the spec's §2 datetime model was never adopted. **Interim:** `time` = start, end = start+30 min, all timed, no all-day row. **Full (flagged):** adopt `startTime`/`endTime`/`allDay` per spec §2 (the Phase-1 model task) → real-duration heights + all-day row. `getEventsForDate(dateIso)` is already the day's source (Calendar2D.js:428) — keep it; just position instead of list. Reuse the centralized `errand`→`errands` alias (per 4.1.4; the day's inline alias is at Calendar2D.js:307).
- **Edge cases:** No-end / zero-duration (30-min min height + min tappable height); events crossing the visible-range edge (clip + indicator, per 4.3.3); midnight-spanning (interim: single-day; document); empty day → no blocks, full axis.
- **UI/UX considerations:** Day blocks are wide and roomy — favor the §6.5 detailed content (4.4.3) the extra width allows; minimum height keeps 30-min events tappable.
- **Data flow notes:** `getEventsForDate(selectedDate)` → position each by `time` → block; same source as the day-cell dots so they never disagree.
- **Testing notes:** A 09:00 event sits at the 9am line; a no-end event is a 30-min block; (full path) a 2-hour event is twice as tall and an all-day event sits in the top row.
- **Performance notes:** Bounded by 4.4.9 virtual scroll; one `getEventsForDate` per render.
- **Mobile vs desktop:** Same positioning math; full width both.
- **Integration points:** §6.5, §6.4 (line 697), §3.x (`getEventsForDate`), §21, **model extension dependency.**
- **Status:** **Missing** (events listed, not positioned) and **partially blocked** (no start/end). **Next:** interim start+30 positioning; flag the shared model extension.

## 4.4.3 — Day block content: left-border accent, full title, time range, body preview, priority

- **Purpose:** Give day blocks the richer §6.5 content the full width allows — distinct from the week's compact color-filled blocks.
- **Dependencies:** 4.4.2; `CategoryColors`; **body/priority model fields (NEW gap — see reconciliation).**
- **Acceptance criteria:** Each block shows: a **category-color left-border accent** (not a full fill, §6.5 line 725); the **full, untruncated** title (line 726); the time range (line 727); a **body preview of the first 80 characters** (line 728); a **priority indicator** — colored dot or bar (line 729).
- **Implementation notes:** Restyle away from the current full-fill `.ww-day-view-2d__item` (Calendar2D.js:165–170, 308) to a neutral block with a left accent border in the category color. Title = full `text` (no truncation — the deliberate Day-vs-Week difference). Time range from the 4.4.2 interim (`time`–(+30)) or real start–end. **Body preview + priority hit the model gap:** `CalendarEventRecord` has neither a separate body/description nor a `priority` field (timelineModel.js:16–25). **Interim:** if `text` doubles as title+body, show a derived preview or omit; render the priority indicator as a neutral placeholder (or omit) until the model gains `priority`. Fold both into the **same** model-extension follow-up as start/end (4.4.2) so one schema change closes start/end + all-day + body + priority.
- **Edge cases:** Title longer than the block (day shows it full — wrap, don't truncate, unlike week); body exactly/under 80 chars (no ellipsis); missing body/priority (interim placeholders); very short (30-min) block still fits at least title + time (progressive disclosure: drop body preview first when cramped).
- **UI/UX considerations:** Left accent + neutral background keeps long titles legible (vs text-on-color contrast issues §21); priority dot/bar distinct from the alert icon (4.4.8) and the category accent so the three signals don't collide.
- **Data flow notes:** Pure presentation over the 4.4.2 per-event block; read-only.
- **Testing notes:** Block shows full title (not truncated), time range, ≤80-char body preview, left accent in category color, and a priority indicator (or documented placeholder); contrast holds.
- **Performance notes:** Trivial per visible block.
- **Mobile vs desktop:** Same content; on very narrow widths body preview may drop first.
- **Integration points:** §6.5 (lines 723–729), §21, **model extension dependency (`body`, `priority`).**
- **Status:** **Missing** (full-fill list item, `time — text` only). **Next:** restyle to left-accent + full content; flag `body`/`priority` model fields.

## 4.4.4 — Current-time "now" line + today awareness + scroll-to-now

- **Purpose:** Add the §6.5 red current-time indicator for today and make the day open at a useful scroll position.
- **Dependencies:** 4.4.1 (axis + pixels-per-minute).
- **Acceptance criteria:** When the displayed day is **today**, a red horizontal line marks the current minute on the axis (§6.5 line 721); it updates as time passes; it is absent on non-today days; on opening today the axis scrolls so the now-line is in view.
- **Implementation notes:** Absolute-positioned 1px line in the day column, `top` = pixels-per-minute × minutes-since-range-start (4.3.3 constant); show only when `selectedDate === isoFromDate(new Date())`. Tick on a minute interval (clear on unmount / when leaving the day / 3D). Scroll-to-now on entering today (and respect the §line-1783 persisted scroll position — see 4.4.6: don't fight a user's saved scroll). This is the day's distinctive feature; the week's "now line on today's column" (4.3.3 nice-to-have) can share the helper.
- **Edge cases:** Now outside the visible range (6am–10pm range, current time 11pm → clamp to edge or auto-expand to 24h); DST minute math (use real clock minutes); day rollover while open (line jumps / disappears at midnight — re-evaluate on tick); non-today day shows no line even if scrolled to "now" position.
- **UI/UX considerations:** Red line per spec; thin, above grid lines but below event blocks (or with a small "now" tab); scroll-to-now only on initial open, not on every re-render (don't yank the user's scroll).
- **Data flow notes:** Time-only; reads the clock, not the model.
- **Testing notes:** Today shows a red line at the current minute that advances; a non-today day shows none; opening today scrolls the now-line into view; out-of-range now clamps.
- **Performance notes:** One interval timer; reposition a single element per tick (no re-render).
- **Mobile vs desktop:** Identical; scroll-to-now especially helps mobile's tall axis.
- **Integration points:** §6.5 (line 721), §16.6 (within the virtual-scroll window), §1.4 (immediate feedback).
- **Status:** **Missing.** **Next:** build the now-line element + minute timer + scroll-to-now (shareable with the week today-column).

## 4.4.5 — Overlap layout at full width + responsive widths + tap targets

- **Purpose:** Handle overlapping events on the single wide column per §16.5, reusing the week's pure overlap helper.
- **Dependencies:** 4.4.2; **the 4.3.5 overlap helper (reuse, don't re-implement).**
- **Acceptance criteria:** Events overlapping in time split into side-by-side sub-columns, each narrower, **minimum block width 80px** (§16.5 line 1379); non-overlapping blocks use the full column width minus padding (§6.5 line 724); blocks meet the ≥28×28px mobile tap-target minimum (§8.7).
- **Implementation notes:** Call the **same** pure interval-graph cluster/column-assignment helper extracted in 4.3.5 — the day is just the week's single-column case, so there is no day-specific overlap code. Full width means fewer clusters exceed the 80px floor than in the week; if a cluster still can't fit (many concurrent events), fall back to horizontal scroll within the day or a "+N more" affordance.
- **Edge cases:** Many concurrent events (cluster > 80px×N → scroll or "+N more"); chained partial overlaps share one cluster; exact-touch boundaries (end == next start) non-overlapping; zero-overlap day uses full width.
- **UI/UX considerations:** With full width the common case is one column — keep the rich 4.4.3 content; only narrow into sub-columns on real overlap.
- **Data flow notes:** Layout-only over the 4.4.2 per-day event array.
- **Testing notes:** Two overlapping events render side-by-side ≥80px; three split into thirds or scroll; non-overlapping uses full width; ≤420px keeps blocks ≥28px.
- **Performance notes:** O(n log n) per day via the shared helper; bounded by events/day.
- **Mobile vs desktop:** Same helper; mobile may prefer the "+N more" fallback over cramped sub-columns.
- **Integration points:** §16.5 (line 1379), §6.5, §8.7, **4.3.5 overlap helper (reuse).**
- **Status:** **Missing** (events stacked, no overlap handling). **Next:** reuse the 4.3.5 helper at full width + responsive fallback.

## 4.4.6 — Day navigation (prev/next day), Today button, keyboard, swipe, scroll persistence

- **Purpose:** Let the user move across days and jump to today without leaving the day level (§6.5 lines 734–735), including the §line-1783 scroll-position persistence.
- **Dependencies:** 4.4.1; the 4.3.7 header-control + swipe pattern (reuse).
- **Acceptance criteria:** Left/right controls (and keyboard ◀/▶) shift the day by ∓1 and re-render; a Today button jumps to today and marks the now-line (4.4.4); **swipe ←/→ on touch = prev/next day** (§ line 1734); each change emits `navigateTo {level:"day", date}` and `dayFocused {date}` (4.4.9); the title updates; the **time-axis scroll position persists across day-to-day navigation within the session** (§ line 1783).
- **Implementation notes:** Reuse the 4.3.7 header controls gated to `view === "day"`; day step = `parseIsoDate(selectedDate) ± 1 day → isoFromDate`. Today = `isoFromDate(new Date())`. **Scroll persistence:** store the axis `scrollTop` on a `Calendar2D`/session field and restore it after a day-nav re-render (but allow 4.4.4 scroll-to-now to win on the *initial* open of today, not on subsequent nav). Swipe ←/→ shares the day-step handler; swipe ↕ scrolls the axis (§ line 1746) — native scroll, no special handler.
- **Edge cases:** Day crossing month/year boundary (title + axis correct); holding the arrow (debounce); nav only at day level (hide at year/month/week, like Back); Today while already on today (re-mark now-line, no double-emit — 4.4.9); scroll persistence vs scroll-to-now conflict (initial-open exception).
- **UI/UX considerations:** Arrows flank the day title; Today distinct; all controls ≥28px (§8.7); persisted scroll means flipping through days keeps your place on the axis (a deliberate §line-1783 nicety).
- **Data flow notes:** Day nav → set `selectedDate`, `_dayEvents = getEventsForDate(...)` → re-render → emit `navigateTo` + `dayFocused`; restore saved `scrollTop`.
- **Testing notes:** ◀/▶ step days with correct month/year rollover; Today returns to today + now-line; swipe maps to the same step; axis scroll position is retained when navigating day→day; one `navigateTo`/`dayFocused` per change.
- **Performance notes:** One full-day re-render per step; batch via 4.4.9's render guard.
- **Mobile vs desktop:** Desktop arrows + Today; mobile adds swipe ←/→; scroll persistence on both.
- **Integration points:** §6.5 (lines 734–735), §13.2 (`navigateTo`, `dayFocused`), § line 1734 (swipe), § line 1783 (scroll persistence).
- **Status:** **Missing** (no day nav/Today/swipe in the 2D day path). **Next:** port nav + Today + keyboard/swipe + emits + scroll persistence.

## 4.4.7 — Interaction routing: event block → Event Detail, empty slot → New Event (+ drag/resize, model-gated)

- **Purpose:** Wire the §6.5 tap targets so blocks open detail and empty slots create events — the day twin of 4.3.8 at full width.
- **Dependencies:** 4.4.2; Event Detail panel (§6.6) + New Event form (cross-milestone dependencies); 4.3.8's routing pattern (reuse).
- **Acceptance criteria:** Tapping an **event block** opens the Event Detail panel for that event (§6.5 line 732); tapping an **empty time slot** opens the New Event form pre-filled with that date **and** the slot's time (§6.5 line 733); targets don't interfere (slot tap must not fire when a block is tapped).
- **Implementation notes:** Today the list items have **no** handlers at all (Calendar2D.js:304–311). Add: block button → Event Detail (emit `openEventDetail {id}`, or fall back to no-op/existing behavior if the panel isn't built yet, mirroring 4.3.8); empty-slot click on the axis → New Event prefilled `{date: selectedDate, time: slotTime}`, where `slotTime` is the inverse of the 4.3.3 pixels-per-minute from the click's vertical offset. `e.stopPropagation()` on block clicks. **Drag-to-move / resize-bottom-edge (§17.5 lines 1384–1390) are desktop-only and require `startTime`/`endTime`** — flag as the same model-gated follow-up as the week (4.3.8); the day is explicitly in §17.5's scope ("Week/Day Views").
- **Edge cases:** Empty day (only empty-slot create applies); keyboard activation (Enter/Space on a focused block); rapid double-activation; out-of-range slot clicks clamp to the range; clicking the now-line area still resolves to the slot beneath it.
- **UI/UX considerations:** Blocks look tappable and distinct from empty axis; empty-slot affordance discoverable (hover cue desktop); fat-finger forgiveness mobile.
- **Data flow notes:** block → Event Detail (`openEventDetail {id}`); empty slot → New Event `{date, time}`.
- **Testing notes:** Block tap opens detail (or documented fallback) and does **not** create an event; empty-slot tap opens New Event prefilled with date+time; keyboard reaches each target.
- **Performance notes:** Per-block listeners bounded by visible events; grid-level delegation for the empty-slot handler (one listener computing slot from offset).
- **Mobile vs desktop:** Drag/resize desktop-only (model-gated); mobile relies on tap → detail + New Event form.
- **Integration points:** §6.5 (lines 732–733), §17.5 (drag/resize, model-gated), §6.6 (Event Detail), New Event form (dependency), §13.2.
- **Status:** **Missing** (static list items, no handlers; no empty-slot create; drag/resize model-blocked). **Next:** add block→detail + empty-slot→New Event; flag drag/resize.

## 4.4.8 — Retire the dead week strip; alert icon via the shared helper

- **Purpose:** Remove the no-op `WeekGrid2D` strip embedded in the day and surface alert state through the shared alerts helper, keeping day/week/month signals consistent.
- **Dependencies:** 4.3.1 (real week level lands → strip is redundant), 4.3.6 (shared `getActiveAlertSets`/`eventHasAlert` helper), 4.4.2.
- **Acceptance criteria:** The bottom `WeekGrid2D` context strip (`onDaySelect: () => {}`, Calendar2D.js:313–320) is **removed** from `DayView2D`; events with active (non-dismissed) alerts show the alert icon on their block, computed via the **shared** alert helper (not re-implemented); the day's alert logic matches the week/month.
- **Implementation notes:** Delete the `weekWrap`/`WeekGrid2D` block (Calendar2D.js:313–320) and the now-unused `WeekGrid2D`/`weekStartForDate` import if no longer referenced after 4.3 retires the legacy renderers (Calendar2D.js:3). Use the 4.3.6 shared `getActiveAlertSets()` + `eventHasAlert(ev, sets)` to mark blocks with the `⏰` icon (matching the week). The strip was a placeholder for "week context"; the real week level (4.3.1) + day↔week back-chain now provide that, so the strip adds nothing but a second week render inside the day.
- **Edge cases:** A day with an alerted event mid-range still shows ⏰; dismissed alerts excluded (shared helper); removing the import must not break the week path (which moved to `WeekView2D`); empty day → no alert icons, no strip.
- **UI/UX considerations:** Alert icon legible against the neutral block + left accent (4.4.3); doesn't collide with the priority indicator.
- **Data flow notes:** `loadAlerts()` → shared sets → per-event `hasAlert`; read-only.
- **Testing notes:** No `WeekGrid2D` rendered inside the day; an alerted event shows ⏰; the shared helper returns the same result the week/month use; no dead imports remain.
- **Performance notes:** Removing the strip drops a whole second week render from each day view — a net win.
- **Mobile vs desktop:** Identical signal logic.
- **Integration points:** §6.5, §7.x (alerts), 4.3.6 shared alert helper.
- **Status:** **Partial** (no-op strip present; no alert icon on day blocks). **Next:** delete the strip + dead imports; mark alerts via the shared helper.

## 4.4.9 — Bus integration + render guard + virtual scrolling (shared migration; emit `dayFocused`)

- **Purpose:** Put the day on the Phase 2 `EventBus` via the **shared** `Calendar2D` migration (4.1.9/4.2.9/4.3.9), coalesce re-renders, and meet the §16.6 virtual-scroll target — adding the day-specific `dayFocused` emit and retiring the `window` events.
- **Dependencies:** Phase 2 (EventBus), Phase 3.1 (view nav, `modeChanged`), Phase 3.3 (`preferenceChanged` for the hour-range), the shared migration done once in `Calendar2D` (4.3.9); 4.4.6, 4.4.7.
- **Acceptance criteria:** `Calendar2D` subscribes to `navigateTo` (incl. `level:"day"`), the timeline-changed bus event (re-render when in 2D), `modeChanged` (render only when `2d`), and `preferenceChanged` (the `weekHourRange` axis preference shared with the week); it emits `dayFocused {date}` on entering/navigating a day (§13.2) and `navigateTo {level:"day"}` from drills; `dayFocused`'s subscriber is `InklingPanel` (§13.2). The `window` `timelineUpdated` / `inkling:alerts-updated` listeners (Calendar2D.js:383–388) are migrated to the bus (shared with the week).
- **Implementation notes:** **No new subscription plumbing** — the bus migration is the same once-in-`Calendar2D` change from 4.3.9; the day only adds the `dayFocused` emit in `openDay` / day-nav (4.4.6). **Virtual scrolling (§16.6 line 1489, explicitly Day + Week):** only build blocks within the visible scroll window of the axis; recycle on scroll — pairs with the 4.3.3 axis and the 4.4.6 persisted scroll position. Apply state before emitting; coalesce back-to-back model/nav/preference events into one re-render via the shared render guard.
- **Edge cases:** Events arriving while in 3D (keep state, skip render); duplicate `navigateTo`/Today for the already-active day (no-op, no spurious `dayFocused`); drilling week→day must not double-emit; the now-line timer (4.4.4) keeps ticking independent of the render guard.
- **UI/UX considerations:** Invisible plumbing; payoff is top-bar "Day"/"Today" and Inkling "go to tomorrow" now move the 2D day view, and Inkling receives `dayFocused` to summarize the day.
- **Data flow notes:** bus `navigateTo {level:"day"}` → Calendar2D state → render `DayView2D`; day entry → emit `dayFocused` → InklingPanel.
- **Testing notes:** `navigateTo {level:"day"}` shows the day; timeline/preference change re-renders only in 2D; entering a day emits `dayFocused` once; no reliance on the `window` events remains; off-screen time rows aren't in the DOM.
- **Performance notes:** Subscribe once on mount (shared); render guard coalesces; virtual scroll bounds DOM to the visible window.
- **Mobile vs desktop:** Identical plumbing; swipe nav (4.4.6) and axis scroll (§ line 1746) ride existing handlers.
- **Integration points:** §13.2 (`navigateTo`, `dayFocused`, `modeChanged`, `preferenceChanged`), §16.6 (virtual scroll), §2.1.
- **Status:** **Missing** (`window` events; emits nothing; no virtual scroll). **Next:** ride the shared bus migration, add the `dayFocused` emit + render guard + virtual scroll.

## 4.4.10 — Cross-check with §6.5, §6.1, §16.5/§16.6, §17.5, §13.2, §11 — close out Phase 4

- **Purpose:** Confirm the day view honors the 2D-view contract, the shared time-axis/overlap/virtual-scroll rules, and the event catalog — and, as the **last milestone of Phase 4**, verify the four sub-views (year/month/week/day) form one coherent drill on one data source and one bus.
- **Dependencies:** 4.4.1–4.4.9 (and, by extension, 4.1–4.3).
- **Acceptance criteria:** Verified against §6.5 (full-width vertical time axis, hourly-label margin, now-line on today; blocks = full width, left accent, full title, time range, body preview, priority; tap → Detail, empty slot → New Event, swipe ←/→, day nav), §16.5 (overlap sub-columns, 80px min), §16.6 (virtual scrolling — Day **and** Week), §17.5 (desktop drag/resize — model-gated, documented), §6.1 (shared data source; sub-view switch never changes `calendarMode`), §13.2 (`navigateTo`/`dayFocused`/`modeChanged`/`preferenceChanged`), §11 naming (`DayView2D`). The dead week strip is **removed**; the year→month→week→day **back-chain and drill are coherent**; deviations fixed or **documented** (the start/end + all-day + body + priority model adoption, and the deferred drag/resize).
- **Implementation notes:** Walk the reconciliation list and confirm each gap is closed or documented: full-width axis, positioned blocks (interim-vs-full model), left-accent rich content, now-line, overlap (reused helper), day nav + Today + swipe + scroll persistence, split tap routing, strip removal + shared alert icon, bus + `dayFocused` + virtual scroll. **Phase-4 close-out:** confirm a sub-view switch (year↔month↔week↔day) never writes `calendarMode` (§6.1); no view performs event-store writes (§2.3); the bus migration is genuinely **once** in `Calendar2D` (not duplicated per view); the shared axis/overlap/alert helpers are each single implementations; and the hour-range + week-start preferences are consistent across week and day. Compile the cross-milestone follow-ups (model adoption of `startTime`/`endTime`/`allDay`/`body`/`priority` per spec §2; drag/resize; legacy `WeekView` overlay retirement) into one Phase-1/follow-up list.
- **Edge cases:** Re-assert read-only; same-day/Today `navigateTo` no double-emit; day crossing month/year correct; DST + now-line documented; out-of-range now/events clamped.
- **UI/UX considerations:** Confirm "immediate visual response" (§1.4) on day nav, Today, now-line tick, block tap, and empty-slot create.
- **Data flow notes:** Confirms the day's bus sources/subscribers match §13.2 and it shares the model with year/month/week.
- **Testing notes:** Spec-to-implementation checklist passes for §6.5/§6.1/§16.5/§16.6/§17.5/§13.2; the year→month→week→day drill + back-chain is verified end-to-end on one data source; no `calendarMode` writes from sub-view changes; the consolidated model-extension follow-up is recorded.
- **Performance notes:** Confirm the render guard + virtual scroll hold under back-to-back model/nav/preference events across all four sub-views.
- **Mobile vs desktop:** Both layouts verified at §8.7 breakpoints, including overlap and swipe nav; drag/resize desktop-only and documented as model-gated.
- **Integration points:** §6.1, §6.5, §16.5, §16.6, §17.5, §13.2, §11 — and the whole §6 2D-view family.
- **Status:** **Checklist** (gates the milestone **and** Phase 4). **Next:** run after 4.4.1–4.4.9; record the consolidated model + drag/resize + overlay-retirement follow-up list.

---

### Milestone 4.4 — Definition of Done
- `DayView2D` is upgraded from a flat list to the §6.5 single-day timeline: the **same vertical time axis as the Week View, full width** (one shared axis component, not a second implementation), with a side margin of hourly labels, reading only from `timelineModel.js` (§2.3), sitting correctly in the year→month→week→day back-chain.
- Events render as **full-width positioned blocks** (start→end, no-end → 30-min, all-day row when the model allows) with the §6.5 rich content — **left-border category accent, full (untruncated) title, time range, ≤80-char body preview, priority indicator** — and **overlap split into ≥80px side-by-side sub-columns** via the reused 4.3.5 helper.
- A red **current-time "now" line** marks today at the current minute (ticking), absent on other days, with scroll-to-now on initial open of today.
- **Day navigation** (prev/next day), a **Today** button, keyboard ◀/▶, and **swipe ←/→** all work and emit; the **time-axis scroll position persists across day-to-day navigation within the session** (§ line 1783).
- Tap routing is split per §6.5 — event block → Event Detail (§6.6, or documented fallback), empty slot → New Event prefilled with date+time; the dead no-op `WeekGrid2D` strip is **removed** and alert icons come from the **shared** alerts helper.
- The day is driven by the **EventBus** — riding the shared once-in-`Calendar2D` migration (subscribing to `navigateTo {level:"day"}`/`modeChanged`/`preferenceChanged` + the timeline-changed event, emitting `dayFocused`, §13.2) — with a render guard and **virtual scrolling** of the time axis (§16.6, explicitly Day + Week), replacing the legacy `window` events.
- Switching the 2D sub-view never changes `calendarMode` (§6.1); the view performs no event-store writes; the hour-range/week-start preferences stay consistent with the week.
- **Documented carry-forwards (consolidated for Phase 4):** the live event model never adopted the spec §2 datetime model — shipped on the interim "start + 30 min, all timed" positioning with **no** body/priority data; the real adoption of `startTime`/`endTime`/`allDay`/`body`/`priority` is one Phase-1 model task that also unblocks **desktop drag-to-move and resize** (§17.5) in both Week and Day; the legacy `WeekView` overlay retirement (from 4.3) is in the same follow-up list.
- **Phase 4 (Calendar 2D Core) complete:** year, month, week, and day all render from one data source on one bus through one shared axis/overlap/alert/preference layer, with the coherent year→month→week→day drill and a single consolidated model-extension follow-up list.
