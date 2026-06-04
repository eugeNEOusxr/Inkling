# Phase 2 — Milestone 2.3: Alerts UI Shell Integration (Expanded)

**Goal:** Reconcile the **already-existing** alerts UI — [`AlertsDropdown.js`](../../src/calendar/alerts/AlertsDropdown.js) (top-bar dropdown), [`AlertsPanel.js`](../../src/calendar/alerts/AlertsPanel.js) (a separate full-screen panel), and [`InAppAlert.js`](../../src/calendar/notifications/InAppAlert.js) (the §7.5 toast) — toward §7.3/§7.5/§7.6, **migrate them off `document` events onto the canonical bus** (the 2.2 carry-forward), add the **missing snooze/dismiss rows + missed section** to the dropdown, and converge the **three** surfaces. Grounded against the live files — reconcile **built / gap / next-step**, not greenfield.

> ⚠️ **Three live surfaces, not one.** The old greenfield 2.3 said "create `AlertsDropdown.js`." It **already exists** and is fairly complete — plus there are **two more** alerts UIs: `AlertsPanel.js` (full-screen, has the dismiss the dropdown lacks + its own toast) and `InAppAlert.js` (toast with snooze chips). All three signal on **`document` events**, none on the canonical bus. This is the duplicate-surface pattern (like the two 2D views / two buses). 2.3.2 decides which is canonical for which §7 role.

**Spec alignment:** §7.3 line 817-832 (anchored dropdown; "Upcoming Alerts" header; list **sorted by `alert.time`**; per-row **title + time-until + kind icon + Snooze/Dismiss**; **badge = upcoming un-dismissed within 24h**; `alertsOpened` → Inkling), §7.4 line 834-836 (sound per `kind`), §7.5 line 838-840 (**popup toast**, top-right desktop / top mobile, title+time+Snooze/Dismiss, **auto-dismiss after 30s** without marking dismissed), §7.6 line 842-844 (**Missed Alerts** section at top), §8.1 (top-bar Alerts slot), §8.6 (z-index 300, below toasts 400), §8.7 (responsive: mobile sheet/full-screen, desktop ~380px anchored), §13.2 (`alertTriggered`/`eventUpdated`/`alertsOpened`/`navigateTo`), §13.3 (mount/unmount subscriptions).

**Sequencing:** Final Phase-2 milestone. Depends on 2.1 (canonical bus) and 2.2 (the alerts engine + `alertTriggered` on the bus + `getMissedAlerts`/`getBadgeAlertCount`/snooze/dismiss helpers). It **closes the 2.2 carry-forward** (migrate the `document`-event consumers to the bus). Full UI Shell/top bar is Phase 3 — here the button slots into the existing `btn-inkling-alerts` anchor. **Note for Phase 3:** the [UI change requests](../../#) include removing the "constellation/memory-tree" column and the mobile-back-button-hidden-on-2D-day bug — not this milestone, but adjacent top-bar work.

---

## Current implementation status (reconciliation)

A **substantial alerts UI already exists** across **three surfaces**, all wired to **`document` events** rather than the canonical bus, with the dropdown **missing snooze/dismiss + the missed section**, a **non-spec z-index**, and a **badge that counts "active" not "within 24h."** This is a reconcile + converge + bus-migration milestone, not greenfield.

- **`AlertsDropdown` exists and is fairly complete — but on `document` events, with gaps.** [AlertsDropdown.js](../../src/calendar/alerts/AlertsDropdown.js): singleton anchored under `btn-inkling-alerts` (:135), glass dropdown, "Upcoming alerts" header (:169), renders from the **real** `alertsModel.getUpcomingAlerts()` `{alert, triggerAt}` (:243), priority icons (:10-15), time-until via `getTimeUntil` (:255), click → navigate, outside-click + Escape close (:180-189), empty state ✓. **Gaps vs §7.3:** refreshes on **`document`** `inkling:alerts-updated`/`alerts-tick`/`alert-fired` (:192-200) **not** the canonical `alertTriggered`/`eventUpdated` (2.3.3); **no per-row Snooze/Dismiss** (§7.3); **no Missed section** (§7.6); navigate dispatches **`document` `inkling:navigate-to-alert`** (:139/:279-282) not bus `navigateTo {date, level:"day"}` (2.3.5); `alertsOpened` is a **direct `handleSystemEvent` call** (:226) not a bus emit (2.3.6); **z-index 10320** (:38) not §8.6's 300; a **30s `setInterval` re-render** for stale labels (:292) instead of event-driven.
- **A SECOND surface — `AlertsPanel.js` (full-screen) duplicates much of the dropdown + has the dismiss the dropdown lacks.** [AlertsPanel.js](../../src/calendar/alerts/AlertsPanel.js): `class AlertsPanel` ("Full-screen alerts panel — list, priority styling, dismiss", :12-14), imports `dismissAlert`/`getActiveAlerts`/`syncAlertsBadge` (:1), renders its **own** list + **its own toast** (`alerts-panel__toast` + a body `inkling-alert-toast`, :46/:83-95), on `document` `inkling:alerts-updated`/`alert-fired` (:61-62). So there are **two list UIs** (dropdown + panel) and the **dismiss action lives in the panel, not the dropdown**. 2.3.2 decides their roles (e.g. dropdown = desktop anchored list per §7.3; panel = the §8.7 mobile full-screen sheet — converge, don't run two divergent lists).
- **A THIRD surface — `InAppAlert.js` is the §7.5 toast (with snooze) + `snoozePrefs`.** [InAppAlert.js](../../src/calendar/notifications/InAppAlert.js): `class InAppAlert` ("In-app alert toasts (app open)", :10), `show({title, message, kind, level, feedId, onSnooze})` (:30), **snooze chips 5/10/15 min** (:42-44) via `snoozePrefs.js`, dismiss ✕ (:56), auto-remove. This is the §7.5 popup + the §7.2 snooze UI. **But** `AlertsPanel` *also* renders a toast (`inkling-alert-toast`) — two toast paths. And `InAppAlert.kind` = `'reminder'|'alarm'|'appointment'|'note'|'info'` (:24) ≠ the §3.1 `'popup'|'sound'` `kind` (the 2.2.9 field). 2.3 reconciles the toast surface (InAppAlert canonical) + the `kind` taxonomy.
- **Signaling is `document`-events end-to-end — the 2.2 carry-forward.** All three surfaces listen on `document` (`inkling:alerts-updated`, `inkling:alert-fired`, `inkling:alerts-tick`) — the transitional shim 2.2.8 left with a "retire in 2.3" TODO. None subscribe to the canonical bus `alertTriggered`/`eventUpdated`/`eventDeleted`. 2.3.3 migrates them; once migrated, the 2.2 `inkling:alert-fired`/`inkling:alerts-updated` shims can retire.
- **Snooze/Dismiss exist but aren't wired into the §7.3 dropdown rows, and snooze predates 2.2's `snoozeAlert`.** `dismissAlert` (alertsModel) is used by `AlertsPanel` + the toast; `InAppAlert` snooze uses `snoozePrefs`/`onSnooze`. But 2.2 added the canonical `snoozeAlert`/`dismissAlert` engine methods — the UI snooze/dismiss must route through **those** (so the schedule reschedules, 2.2.5). The §7.3 dropdown has **neither** action on its rows. 2.3 adds Snooze/Dismiss to the dropdown rows wired to the 2.2 engine.
- **Badge counts "active", not §7.3's "within 24h"; written directly to the DOM.** The dropdown calls `syncAlertsBadge()` (AlertsDropdown.js:287) which (pre-2.2) counted all active alerts and wrote `[data-inkling-alerts-badge]` directly. 2.2 added `getBadgeAlertCount` (24h). 2.3.1 reconciles the badge to the §7.3 24h count + the "9+" cap, recomputed on bus events (not the 30s poll).
- **No keyboard arrow-nav; no real mobile sheet.** The dropdown has Escape + outside-click ✓ but **no arrow-key row navigation** (§7.3/2.3.9); it's a fixed `min(360px, 92vw)` anchored panel (:30) — responsive-ish but not the §8.7 mobile **top-sheet** (which is arguably what `AlertsPanel` should become, 2.3.2/2.3.8).
- **What's already right (keep):** renders from the **real** `getUpcomingAlerts` (alertsModel, not the hollow timeline one) ✓; priority **kind icons** + category color bar ✓; **time-until** labels via the shared `getTimeUntil` ✓ (§7.3); **outside-click + Escape** close ✓; `role="menu"`/`menuitem` semantics started ✓; glass aesthetic ✓ (§7.3); `aria-expanded` on the trigger ✓; `InAppAlert` already has the §7.5 toast + snooze-chip UX ✓; `AlertsPanel` already has dismiss + a full-screen layout (a head start on the §8.7 mobile sheet) ✓; singletons with mount guards ✓.

---

## 2.3.1 — Reconcile the top-bar Alerts button + 24h badge

- **Purpose:** Reconcile the badge to §7.3 — count of upcoming, un-dismissed alerts **within 24h**, "9+" capped, hidden at 0, recomputed on bus events — replacing the live "active"-count `syncAlertsBadge` written directly to the DOM and refreshed by a 30s poll.
- **Dependencies:** 2.2 (`getBadgeAlertCount`/`getUpcomingAlerts`), 2.1 (bus), 2.3.3 (refresh source); §7.3 line 828-829, §8.1.
- **Acceptance criteria:** The Alerts button sits in the top bar's slot (`btn-inkling-alerts`, §8.1) ✓; the badge shows the **24h** un-dismissed count (the 2.2 `getBadgeAlertCount`, not the all-active count), hidden at 0, **"9+"** when >9; the count recomputes on the relevant **bus** events (2.3.3), not the 30s `setInterval`; the badge derives from the model, not the Scheduler internals (§2.4).
- **Implementation notes:** Replace the dropdown's `syncAlertsBadge()` (AlertsDropdown.js:287) reliance with the 24h `getBadgeAlertCount` (2.2); keep the `[data-inkling-alerts-badge]` DOM target (existing markup) but feed it the correct count + "9+" cap; drive updates from 2.3.3's bus subscriptions and drop the 30s poll for badge purposes.
- **Edge cases:** Count >9 → "9+"; count 0 → no dot; badge legible on the glass top bar (§8.1 contrast).
- **UI/UX considerations:** At-a-glance pending count; legible against translucent top bar.
- **Data flow notes:** Badge derives from the model's 24h query; refreshed by 2.3.3.
- **Testing notes:** Badge shows correct 24h count; hidden at 0; "9+" cap; updates on `alertTriggered`/`eventUpdated`/dismiss.
- **Performance notes:** Recompute on events, not a timer.
- **Mobile vs desktop:** Present in both (§8.1).
- **Integration points:** §7.3, §8.1, 2.2 (`getBadgeAlertCount`), 2.3.3.
- **Status:** **Partial (badge exists, wrong window + poll-driven).** `syncAlertsBadge` counts active + writes DOM directly; refreshed by a 30s poll. **Next:** 24h `getBadgeAlertCount` + "9+" cap, event-driven via the bus (2.3.3).

## 2.3.2 — Converge the three surfaces (dropdown / panel / toast roles)

- **Purpose:** Decide the canonical role of each existing surface — `AlertsDropdown` (desktop anchored §7.3 list), `AlertsPanel` (the §8.7 mobile full-screen sheet?), `InAppAlert` (the §7.5 toast) — and converge the duplicated list + toast logic so there aren't two divergent alert lists or two toasts.
- **Dependencies:** 2.3.1, 2.2; §7.3, §7.5, §8.7.
- **Acceptance criteria:** A documented role split: **`AlertsDropdown`** = the §7.3 anchored dropdown (desktop) and the **source** for the §8.7 mobile presentation; **`AlertsPanel`** = either the mobile **full-screen sheet** of the *same* list (2.3.8) **or** retired in favor of the dropdown's responsive layout (don't keep two independent lists with divergent content/dismiss); **`InAppAlert`** = the single §7.5 toast (the duplicate `inkling-alert-toast` in `AlertsPanel`, :83-95, is retired/converged); all three read the **same** upcoming/missed data and route actions through the **same** 2.2 engine.
- **Implementation notes:** Recommend: keep `AlertsDropdown` as the canonical list, make its mobile layout a top-sheet (2.3.8) and **either** fold `AlertsPanel` into that sheet **or** scope `AlertsPanel` to a distinct purpose and stop it rendering a second toast; make `InAppAlert` the one toast (§7.5) fired from `alertTriggered` (2.3.3). Eliminate the `AlertsPanel` body-toast duplication.
- **Edge cases:** `AlertsPanel` has `dismiss` the dropdown lacks — when converging, the dropdown must gain Snooze/Dismiss (2.3.x) so nothing is lost; two toasts firing for one alert (InAppAlert + AlertsPanel toast) must collapse to one.
- **UI/UX considerations:** One coherent alerts surface per context (desktop dropdown, mobile sheet, transient toast) — not three overlapping ones.
- **Data flow notes:** One list source + one toast, both off the bus.
- **Testing notes:** One toast per fire; the list content is identical wherever shown; no orphaned second-list.
- **Performance notes:** Less duplicate rendering/listeners.
- **Mobile vs desktop:** Dropdown (desktop) vs sheet (mobile) is the §8.7 split (2.3.8).
- **Integration points:** §7.3, §7.5, §8.7, 2.3.8, 2.2.
- **Status:** **Duplicated (three surfaces, two lists, two toasts).** `AlertsDropdown` + `AlertsPanel` (both lists) + `InAppAlert` + the panel's own toast. **Next:** dropdown canonical list; InAppAlert canonical toast; converge/retire AlertsPanel's list+toast; one engine for actions.

## 2.3.3 — Migrate refresh to the canonical bus (`alertTriggered`/`eventUpdated`/`eventDeleted`); retire the document shims

- **Purpose:** Close the 2.2 carry-forward — subscribe the alerts UI to the **canonical bus** (`alertTriggered`, `eventUpdated`, `eventDeleted`) instead of `document` events — so the badge + open dropdown stay live, and the 2.2 `inkling:alert-fired`/`inkling:alerts-updated` shims can retire.
- **Dependencies:** 2.3.1-2.3.2, 2.2.8 (`alertTriggered` on the bus), 2.1.8 (`eventUpdated`/`eventDeleted`); §13.2, §13.3, §12.4.
- **Acceptance criteria:** The dropdown (and toast/panel) subscribe on the **canonical bus** to `alertTriggered` (toast + refresh), `eventUpdated` (membership/snooze/dismiss change), and `eventDeleted` (drop a stale row) — recomputing the badge and (if open) re-rendering; subscriptions added on mount, removed on unmount (§13.3, no leak); once all consumers are migrated, the 2.2 transitional `document.dispatchEvent("inkling:alert-fired")` (alertsScheduler.js) and `inkling:alerts-updated` (alertsModel `notifyAlertsUpdated`) shims are **removed** (or kept only if a non-migrated consumer remains, documented).
- **Implementation notes:** Replace the `document.addEventListener("inkling:alerts-updated"/"alert-fired"/"alerts-tick")` blocks (AlertsDropdown.js:192-200, AlertsPanel.js:61-62) with `bus.on("alertTriggered"/"eventUpdated"/"eventDeleted", …)` returning disposers stored for unmount. Recompute from the model (don't hand-patch the list). On `alertTriggered`, fire the `InAppAlert` toast (2.3 §7.5). Keep the badge update here. Then delete the 2.2 shims (alertsScheduler.js:92-97, the `notifyAlertsUpdated` document dispatch) once nothing depends on them.
- **Edge cases:** Rapid fires; dismiss/snooze while open (row updates, badge changes); unmount mid-subscription must `off` (§13.3); a since-deleted event's row drops on `eventDeleted`.
- **UI/UX considerations:** Live updates prevent a stale "in 2 minutes" after fire.
- **Data flow notes:** §12.4 fan-out → bus → AlertsDropdown/InAppAlert; this implements the AlertsDropdown subscriber row of §13.2.
- **Testing notes:** `alertTriggered`/`eventUpdated`/`eventDeleted` each refresh badge + open list; toast fires on `alertTriggered`; unmount removes handlers; shims gone (or documented).
- **Performance notes:** Recompute cheap; gate re-render on "is open"; drop the 30s poll.
- **Mobile vs desktop:** Identical.
- **Integration points:** §12.4, §13.2, §13.3, 2.2.8 (shim retirement).
- **Status:** **Divergent (document events).** All three surfaces on `document` `inkling:*`; the 2.2 shims still firing. **Next:** subscribe to the canonical bus, fire the toast on `alertTriggered`, retire the document shims, unmount-safe.

## 2.3.4 — Reconcile "time until" labels + missed wording

- **Purpose:** Confirm/centralize the §7.3 time-until labels (the dropdown has them) and add the §7.6 **missed** wording ("missed" / "N minutes ago") for the missed section (2.3 §7.6).
- **Dependencies:** 2.3.2, 2.2 (`getTimeUntil`, `getMissedAlerts`); §7.3 line 824, §7.6.
- **Acceptance criteria:** Each upcoming row shows a relative label ("in 15 minutes" / "in 2 hours" / "tomorrow") from `triggerAt - now` (live `getTimeUntil`, AlertsDropdown.js:255 ✓); **missed** rows show past-framed wording ("missed" / "5 minutes ago"); the formatter is shared (one place, reused by Inkling summaries 2.3.6) and recomputed on the 2.3.3 refresh (labels go stale).
- **Implementation notes:** `getTimeUntil` (alertsModel.js) already produces "in X" forms ✓ — extend/centralize for the **past** (missed) direction. The dropdown's inline normalization of `getTimeUntil` output (AlertsDropdown.js:255-263) should move into the shared formatter so missed + Inkling read the same.
- **Edge cases:** <1 min ("less than a minute"/"now"); at fire time; missed/past wording; day-boundary ("tomorrow"/"in 3 days").
- **UI/UX considerations:** Human phrasing, not raw timestamps (§7.3); absolute time as tooltip optional.
- **Data flow notes:** Pure derivation; no writes.
- **Testing notes:** Formatter returns expected strings across boundaries incl. past/missed.
- **Performance notes:** Trivial; recompute on refresh.
- **Mobile vs desktop:** Identical; mobile may shorten.
- **Integration points:** §7.3, §7.6, 2.2 (`getTimeUntil`), 2.3.6.
- **Status:** **Partial (upcoming labels ✓; missed wording missing).** `getTimeUntil` gives "in X"; no past/missed framing. **Next:** centralize the formatter + add missed/past wording for the §7.6 section.

## 2.3.5 — Clicking an alert emits `navigateTo` on the bus (not a document event)

- **Purpose:** Reconcile alert-click navigation to §13.2 — emit `navigateTo { date, level: "day" }` on the **canonical bus** and close the dropdown — replacing the live `document` `inkling:navigate-to-alert` dispatch.
- **Dependencies:** 2.3.2, 2.1 (bus), the §13.2 `navigateTo` consumers (WordWeaverScene/Calendar2D); §13.2 line 1171, §2.4.
- **Acceptance criteria:** Clicking an alert row emits `navigateTo { date, level:"day" }` for the alert's event date on the canonical bus and closes the dropdown; WordWeaverScene/Calendar2D (the §13.2 `navigateTo` subscribers) focus that day in the active mode; the legacy `onNavigateToAlert`→`document` `inkling:navigate-to-alert` path (AlertsDropdown.js:136-142/:279-282) is migrated (or kept as a documented shim if a consumer still needs it).
- **Implementation notes:** Resolve the alert's date (`alert.date` or via `timelineEntryId`→event), emit `navigateTo` on the bus instead of the `document` CustomEvent. Note: the §13.2 `navigateTo`→3D/2D focus wiring is itself a Phase-4/5 carry (the 5.5.9 finding: WordWeaverScene doesn't yet *listen* to `navigateTo`) — so this task **emits** correctly now; the **consumer** side lands in Phase 4/5. Document that.
- **Edge cases:** Event since deleted (row gone via 2.3.3, but guard the click); event in another month/year — `navigateTo` carries the full date.
- **UI/UX considerations:** One-tap jump to the alert's day; immediate, obvious.
- **Data flow notes:** AlertsDropdown → `navigateTo` (bus) → renderers focus day (§12 navigation).
- **Testing notes:** Click emits `navigateTo {date, level:"day"}` on the bus + closes the dropdown.
- **Performance notes:** Single emit.
- **Mobile vs desktop:** Identical; touch-sized tap target (2.3.8).
- **Integration points:** §13.2 (`navigateTo`), §2.4, 5.5.9 (consumer side in 3D).
- **Status:** **Divergent (document event).** Click dispatches `inkling:navigate-to-alert` on `document`. **Next:** emit `navigateTo {date, level:"day"}` on the canonical bus + close; note the 3D/2D consumer wiring is a Phase-4/5 carry.

## 2.3.6 — Emit `alertsOpened` on the bus (not a direct `handleSystemEvent` call)

- **Purpose:** Reconcile the open-summary trigger to §7.3/§13.2 — emit `alertsOpened` on the **canonical bus** (InklingPanel subscribes) — replacing the live direct `handleSystemEvent({type:"alertsOpened"})` call into `InklingAI`.
- **Dependencies:** 2.3.2, 2.1; §7.3 line 831-832, §13.2 (`alertsOpened`), §2.4.
- **Acceptance criteria:** Opening the dropdown emits `alertsOpened` on the canonical bus **once per genuine open** (debounced against rapid open/close, not per re-render); InklingPanel subscribes and (if open) summarizes / (if closed) queues; the dropdown does **not** call Inkling directly (§2.4) — the live `handleSystemEvent({type:"alertsOpened", alerts})` (AlertsDropdown.js:226) is replaced/wrapped by the bus emit.
- **Implementation notes:** Replace the direct `handleSystemEvent` call with `bus.emit("alertsOpened")` (payload-less per §13.2, or include the upcoming rows if Inkling needs them — document). Keep `InklingAI` reacting, but via a bus subscription, not a direct import call. Emit on `open()`, not `render()`.
- **Edge cases:** Rapid open/close → debounce (emit once per real open); Inkling closed → summary queued (Inkling side).
- **UI/UX considerations:** Summary is a nicety, never blocking; list works with Inkling closed.
- **Data flow notes:** AlertsDropdown → `alertsOpened` (bus) → InklingPanel.
- **Testing notes:** Open emits `alertsOpened` once; re-render doesn't re-emit.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.3, §13.2 (`alertsOpened`), §2.4.
- **Status:** **Divergent (direct call).** `open()` calls `handleSystemEvent` directly. **Next:** emit `alertsOpened` on the bus once per open; Inkling subscribes (no direct call).

## 2.3.7 — Add Snooze/Dismiss to dropdown rows + reconcile §7.5 toast actions (via the 2.2 engine)

- **Purpose:** Add the §7.3 per-row **Snooze/Dismiss** the dropdown lacks, and ensure the toast's (`InAppAlert`) snooze/dismiss route through the **2.2 engine** (`snoozeAlert`/`dismissAlert`) so the schedule reschedules — converging the action paths.
- **Dependencies:** 2.2 (`snoozeAlert`/`dismissAlert`), 2.3.2/2.3.3; §7.3 line 825, §7.5 line 840, §7.2 (snooze 5/10/30; dismiss).
- **Acceptance criteria:** Each dropdown row has **Snooze** (5/10/30 min, §7.2) and **Dismiss** actions wired to the 2.2 `snoozeAlert`/`dismissAlert` (which persist + recompute the schedule, 2.2.5); the `InAppAlert` toast's existing snooze chips (5/10/15, InAppAlert.js:42-44) are reconciled to the §7.2 set (5/10/30) and routed through `snoozeAlert` (not just `snoozePrefs`/`onSnooze`); `dismissAlert` is the single dismiss path (used by dropdown row, toast, and panel); a dismissed alert drops from upcoming + decrements the badge (via 2.3.3).
- **Implementation notes:** The dropdown rows are currently click-to-navigate only (AlertsDropdown.js:279-282) — add Snooze/Dismiss controls (keyboard-reachable, 2.3.9) that call the 2.2 engine. Reconcile `InAppAlert`'s snooze (5/10/15 + `snoozePrefs`) to §7.2's 5/10/30 and the engine's `snoozeAlert`. Ensure all three surfaces share **one** dismiss path (`dismissAlert`) and one snooze path (`snoozeAlert`).
- **Edge cases:** Snooze re-adds a later trigger (the original phase stays fired, §7.2); dismiss is idempotent; actions must not also trigger the row's navigate-click (stop propagation).
- **UI/UX considerations:** Snooze/Dismiss must be comfortably tappable (≥44px, 2.3.8) and not adjacent enough to mis-tap; clear labels.
- **Data flow notes:** Row/toast action → 2.2 `snoozeAlert`/`dismissAlert` → persist + recompute (2.2.5) + `eventUpdated`/refresh (2.3.3).
- **Testing notes:** Snooze reschedules + the row updates; dismiss removes + badge decrements; action click doesn't navigate.
- **Performance notes:** One engine write per action.
- **Mobile vs desktop:** Touch-sized on mobile (2.3.8).
- **Integration points:** §7.2/§7.3/§7.5, 2.2 (`snoozeAlert`/`dismissAlert`), 2.3.3/2.3.8/2.3.9.
- **Status:** **Missing (dropdown) / divergent (toast snooze set).** Dropdown rows have no Snooze/Dismiss; `InAppAlert` snooze is 5/10/15 via `snoozePrefs`, not the §7.2 set via the engine. **Next:** add Snooze/Dismiss to dropdown rows via the 2.2 engine; reconcile the toast snooze set + one dismiss/snooze path.

## 2.3.8 — Missed Alerts section + §8.7 responsive (mobile sheet) + §8.6 z-index

- **Purpose:** Add the §7.6 **Missed Alerts** section the dropdown lacks (data ready via 2.2 `getMissedAlerts`), make the mobile layout a §8.7 **top-sheet** (converging `AlertsPanel`'s full-screen role), and reconcile the **z-index** to §8.6 (300, below toasts 400) from the live 10320.
- **Dependencies:** 2.2 (`getMissedAlerts`), 2.3.2 (surface roles), 2.3.4 (missed wording); §7.6, §8.6, §8.7.
- **Acceptance criteria:** When `getMissedAlerts()` is non-empty, a **"Missed Alerts"** section renders at the **top** of the dropdown (§7.6), above "Upcoming"; on mobile (<640px, §8.7) the dropdown presents as a **full-width top sheet** (touch-sized rows/actions ≥44px) — reusing/superseding `AlertsPanel`'s full-screen layout (2.3.2); desktop stays an anchored ~360-380px panel; **z-index = 300** (§8.6, below toasts 400) replacing 10320; empty states handle "no missed, no upcoming" and "missed only".
- **Implementation notes:** Add a Missed section rendered from `getMissedAlerts()` (2.2); reconcile the dropdown's `z-index: 10320` (AlertsDropdown.js:38) to §8.6's 300 (verify it still sits above Phase-3 panels @200 and below toasts @400 — the spec's layering); for mobile, either make the dropdown responsive into a sheet **or** route to `AlertsPanel` as the sheet (2.3.2 decision) — one of them, not both.
- **Edge cases:** Many missed → internal scroll; missed-only → Missed section + "no upcoming" empty; safe-area insets (notches) on the mobile sheet; landscape.
- **UI/UX considerations:** Missed at top (don't bury), touch ergonomics on the sheet, glass contrast (§7.3).
- **Data flow notes:** `getMissedAlerts()` (2.2) → Missed section; same component, responsive presentation.
- **Testing notes:** Missed section shows when present + at top; mobile renders a sheet <640px; z-index = 300; tap targets ≥44px.
- **Performance notes:** Watch backdrop-blur cost on low-end mobile; degrade gracefully.
- **Mobile vs desktop:** This is the §8.7 divergence point.
- **Integration points:** §7.6, §8.6, §8.7, 2.2 (`getMissedAlerts`), 2.3.2.
- **Status:** **Missing (missed section + mobile sheet) / wrong z-index.** No §7.6 section; fixed anchored panel; z-index 10320. **Next:** add Missed section (top), mobile top-sheet (converge AlertsPanel), z-index → 300.

## 2.3.9 — Keyboard navigation for the alerts list

- **Purpose:** Add the §7.3/accessibility keyboard operation the dropdown lacks — Arrow keys move row focus, Enter activates (navigate, 2.3.5), Escape closes + restores focus to the trigger — building on the existing Escape/`role="menu"`.
- **Dependencies:** 2.3.2, 2.3.5, 2.3.7; §7.3, accessibility (§27 / Phase 8 focus mgmt).
- **Acceptance criteria:** With the dropdown open, Arrow keys move focus between rows (roving-tabindex or `aria-activedescendant`), Enter activates the focused row's navigate (2.3.5), per-row **Snooze/Dismiss** (2.3.7) are keyboard-reachable, **Escape** closes and returns focus to `btn-inkling-alerts` (live Escape closes ✓ but doesn't restore focus); rows in logical order (missed then upcoming); visible focus ring.
- **Implementation notes:** Build on the existing `role="menu"`/`menuitem` (AlertsDropdown.js:167/:251) + Escape handler (:187-189); add roving focus + Enter activation + focus-restore-on-close. Mirror the panel-close focus conventions Phase 3 (3.2/3.3) will share.
- **Edge cases:** Empty list (focus stays on panel/close); Tab-out vs trap; Snooze/Dismiss reachable without a pointer.
- **UI/UX considerations:** Visible focus; order matches visual (missed→upcoming).
- **Data flow notes:** Enter reuses the 2.3.5 `navigateTo` path.
- **Testing notes:** Arrow/Enter/Escape behave; focus returns to the trigger on close; actions keyboard-reachable.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Primarily desktop; harmless with a mobile keyboard.
- **Integration points:** §7.3, §27, Phase 8 focus mgmt.
- **Status:** **Partial (Escape ✓; no arrow-nav/focus-restore).** Escape + outside-click close exist; no row arrow-navigation, no focus restore. **Next:** roving focus + Enter + Escape-restores-focus + keyboard-reachable actions.

## 2.3.10 — Cross-check §7.0 + close out Phase 2 (bus, shims, three-surface convergence)

- **Purpose:** Confirm the Alerts UI matches §7 and that Phase 2's bus convergence is complete — the document-event shims (2.2 + this milestone) are retired, the three surfaces are converged, and snooze/dismiss route through the engine — before Phase 3 builds the shell around it.
- **Dependencies:** 2.3.1-2.3.9, all of Phase 2; §7.0, §8.1/§8.6/§8.7, §13.2.
- **Acceptance criteria:** Verified against §7.3 (anchored panel, "Upcoming" header, ascending sort by time, per-row title/time-until/kind icon/**Snooze**/**Dismiss**, **24h badge**, `alertsOpened`→Inkling), §7.5 (one toast, auto-dismiss 30s, snooze/dismiss), §7.6 (Missed section), §8.1/§8.6 (z-index 300)/§8.7 (responsive); **snooze/dismiss route through the 2.2 engine** (no direct mutation, §7.2); the `document` `inkling:alert-fired`/`inkling:alerts-updated`/`inkling:alerts-tick` shims are **retired** (or documented if a consumer remains); the three surfaces are converged (one list source, one toast); deviations fixed/documented.
- **Implementation notes:** Walk §7.3/§7.5/§7.6 point by point against the converged UI; confirm the 2.2 shims (alertsScheduler `inkling:alert-fired`, alertsModel `inkling:alerts-updated`) have no remaining listeners and are removed; confirm the badge "within 24h" vs Scheduler "7d" windows are both correct/intentional (Phase-1 carry).
- **Edge cases:** A surface still on `document` events would keep a shim alive — find it; the §7.5 toast auto-dismiss (30s spec vs the live 6s panel-toast / 400ms InAppAlert remove) — reconcile to §7.5's 30s.
- **UI/UX considerations:** Glass/readability under real content; consistent behavior across the three surfaces.
- **Data flow notes:** Confirms the §12.4 subscriber set is fully on the bus.
- **Testing notes:** Spec-to-implementation checklist passes; no `document` `inkling:alert*` listeners remain (or documented).
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both layouts verified (§8.7).
- **Integration points:** §7.0, §8.1/§8.6/§8.7, §13.2, 2.2 (shim retirement).
- **Status:** **Open (cross-check + shim retirement + convergence).** Three surfaces on document events; shims live; dropdown missing actions/missed; toast auto-dismiss timings diverge from §7.5's 30s. **Next:** row-by-row §7 check, retire the document shims, confirm convergence + engine-routed actions.

---

### Milestone 2.3 — Definition of Done
- The Alerts button + **24h** badge are live; `AlertsDropdown` lists **Missed + Upcoming** sorted by time, with time-until labels, kind icons, and **Snooze/Dismiss routed through the 2.2 engine**; the three surfaces are converged (one list source, `InAppAlert` the one §7.5 toast).
- The UI subscribes to the **canonical bus** (`alertTriggered`/`eventUpdated`/`eventDeleted`), emits `navigateTo`/`alertsOpened` on it, and the 2.2 `document` `inkling:alert-fired`/`inkling:alerts-updated` shims are retired; z-index 300 (§8.6); responsive sheet (§8.7); keyboard-operable (§7.3).
- **Phase 2 complete.** Next: Phase 3, Milestone 3.1 — Top Bar & Mode State (where the [UI change requests](../../#) — remove the constellation/memory-tree column, mobile back-button fix — start landing).
