# Phase 2 — Milestone 2.3: Alerts UI Shell Integration (Expanded)

**Goal:** A top-bar Alerts button with a live badge and an `AlertsDropdown` that lists upcoming (and missed) alerts, navigates on click, and notifies Inkling on open.
**Spec alignment:** §7.3 (dropdown UI, badge, AI integration), §7.6 (missed alerts), §8.1 (top bar placement), §8.6 (z-index 300), §8.7 (responsive), §13.2 (`alertTriggered`, `eventUpdated`, `alertsOpened`, `navigateTo`).
**Sequencing:** Depends on 2.1 (bus) and 2.2 (Scheduler + `alertTriggered`). This is the first Phase 2 UI; it consumes the same upcoming-alerts data the Scheduler derives, filtered to the badge/dropdown's needs. Full UI Shell/top bar arrives in Phase 3 — here the button slots into the top bar's Alerts position (§8.1).

---

## 2.3.1 — Add Alerts button to top bar with badge

- **Purpose:** Give the user a persistent entry point and an at-a-glance count of pending alerts.
- **Dependencies:** 2.2 (alert data), 2.1 (bus).
- **Acceptance criteria:** An Alerts button sits in the top bar's Alerts slot (§8.1) with a badge showing the count of upcoming, un-dismissed alerts within the next 24 hours (§7.3); badge hidden when count is 0.
- **Implementation notes:** Badge count = the §7.3 "within 24h" filter over the same upcoming-alerts data the Scheduler uses (2.2.2). Compute via the model (`getUpcomingAlerts(60*24)` filtered to un-dismissed) rather than reaching into the Scheduler's internals (§2.4). The button toggles the dropdown (2.3.2).
- **Edge cases:** Count > 9 → show "9+" to keep the badge compact; count 0 → no badge dot.
- **UI/UX considerations:** Badge must be legible on the glass top bar; sufficient contrast per §8.1 styling.
- **Data flow notes:** Badge derives from timeline model; refreshed by 2.3.3's subscriptions.
- **Testing notes:** Badge shows correct 24h count; hidden at 0; "9+" cap works.
- **Performance notes:** Recompute count only on relevant events (2.3.3), not on a timer.
- **Mobile vs desktop:** Present in both layouts (§8.1 mobile keeps Alerts in the top bar).
- **Integration points:** §7.3, §8.1.

## 2.3.2 — Create `AlertsDropdown.js` component

- **Purpose:** The panel that lists alerts and their actions.
- **Dependencies:** 2.3.1.
- **Acceptance criteria:** `AlertsDropdown.js` renders a fixed-position panel anchored below the Alerts button (§7.3) with: "Upcoming Alerts" header, a list sorted by `alert.time` ascending, a "Missed Alerts" section at the top when applicable (§7.6), and a "No upcoming alerts" empty state with icon.
- **Implementation notes:** Per-row content (§7.3): event title, time-until string (2.3.4), alert-kind icon, plus Snooze/Dismiss actions. Sits at z-index 300 (§8.6), above panels (200), below toasts (400). Open/close toggled by the button; closes on outside click and Escape (mirror the panel conventions used in 3.2/3.3).
- **Edge cases:** No alerts at all → empty state only (no missed/upcoming headers). Only missed, none upcoming → show Missed section + empty upcoming state.
- **UI/UX considerations:** Glass, subtle, readable (§7.3 / 2.3.7); anchored, not full-width on desktop.
- **Data flow notes:** Renders from the model's upcoming-alerts query; re-renders on 2.3.3 events.
- **Testing notes:** Renders sorted list, missed section, and empty state for each data condition.
- **Performance notes:** Render only when open; cheap list sizes (24h–7d horizon).
- **Mobile vs desktop:** Layout differs (2.3.8) but the component is shared.
- **Integration points:** §7.3, §7.6, §8.6.

## 2.3.3 — Subscribe to `alertTriggered` and `eventUpdated` to refresh list

- **Purpose:** Keep the badge and open dropdown live as alerts fire and events change.
- **Dependencies:** 2.3.1–2.3.2, 2.2.8 (`alertTriggered`), 2.1.8 (`eventUpdated`).
- **Acceptance criteria:** On `alertTriggered` and `eventUpdated`, the badge count recomputes and (if open) the dropdown re-renders; subscriptions are added on mount and removed on unmount (§13.3).
- **Implementation notes:** Both events imply the upcoming set may have changed (a fire moves an alert out; an edit/snooze/dismiss changes membership). Recompute from the model — don't try to incrementally patch the rendered list. Also handle `eventDeleted` for completeness (an open dropdown showing a since-deleted event should drop it); §13.2 lists `eventUpdated` as the AlertsDropdown subscriber, but deletion parity avoids a stale row.
- **Edge cases:** Rapid successive fires; dismiss while dropdown open (row disappears, badge decrements); unmount mid-subscription (must `off` to avoid the §13.3 leak).
- **UI/UX considerations:** Live updates prevent showing a stale "in 2 minutes" for an already-fired alert.
- **Data flow notes:** §12.4 fan-out includes AlertsDropdown badge update; this task implements that subscriber.
- **Testing notes:** Fire/update/dismiss each refresh badge and open list; unmount removes handlers.
- **Performance notes:** Recompute is cheap; gate full re-render behind "is open".
- **Mobile vs desktop:** Identical.
- **Integration points:** §12.4, §13.2, §13.3.

## 2.3.4 — Show upcoming alerts with "time until" labels

- **Purpose:** Make each alert's urgency immediately legible.
- **Dependencies:** 2.3.2.
- **Acceptance criteria:** Each row shows a relative label like "in 15 minutes" / "in 2 hours" / "tomorrow" derived from `alert.time - now` (§7.3); missed rows show "missed" / "5 minutes ago" framing (§7.6).
- **Implementation notes:** Centralize the relative-time formatter so 2.3 and Inkling's summaries (2.3.6) read the same. Round sensibly ("in 1 minute", "in 59 minutes", "in 1 hour"). Recompute labels on each open and on the 2.3.3 refresh — labels are time-relative and go stale.
- **Edge cases:** < 1 minute ("in less than a minute" / "now"); exactly at fire time; past-due/missed wording; day-boundary ("tomorrow", "in 3 days").
- **UI/UX considerations:** Human phrasing, not raw timestamps, per §7.3; consider absolute time as secondary/tooltip.
- **Data flow notes:** Pure derivation from `alert.time`; no writes.
- **Testing notes:** Formatter returns expected strings across boundaries (sub-minute, minute/hour/day, past).
- **Performance notes:** Trivial; recompute on refresh only.
- **Mobile vs desktop:** Identical; mobile may truncate to shorter forms if space-constrained.
- **Integration points:** §7.3, §7.6.

## 2.3.5 — Clicking an alert navigates to that event's day

- **Purpose:** Turn an alert into a one-tap jump to its event in context.
- **Dependencies:** 2.3.2, bus `navigateTo`.
- **Acceptance criteria:** Clicking an alert row emits `navigateTo { date, level: "day" }` for the event's date (§13.2) and closes the dropdown; the active calendar/3D view focuses that day.
- **Implementation notes:** Emit `navigateTo` rather than calling the renderers directly (§2.4 — UI → bus → renderers). WordWeaverScene and Calendar2D subscribe (§13.2) and focus the day in whichever mode is active. Close the dropdown after emitting so focus lands on the day view.
- **Edge cases:** Event since deleted (row should already be gone via 2.3.3, but guard the click); event in a different month/year than the current view — `navigateTo` carries the full date so the renderer can jump.
- **UI/UX considerations:** Immediate, obvious response; no ambiguity about what was selected.
- **Data flow notes:** §12 navigation: AlertsDropdown → `navigateTo` → renderers focus day.
- **Testing notes:** Click emits `navigateTo` with the right date/level and closes the dropdown.
- **Performance notes:** Single emit.
- **Mobile vs desktop:** Identical intent; tap target sized for touch on mobile (2.3.8).
- **Integration points:** §13.2 (`navigateTo`), §2.4.

## 2.3.6 — Emit `alertsOpened` when dropdown opens

- **Purpose:** Let Inkling offer a brief summary of upcoming alerts on open.
- **Dependencies:** 2.3.2, bus.
- **Acceptance criteria:** Opening the dropdown emits `alertsOpened` (no payload, §13.2); InklingPanel subscribes (§7.3 AI integration).
- **Implementation notes:** Per §7.3: if Inkling is open, it generates a brief summary; if closed, the summary is queued. The dropdown's only job is to emit `alertsOpened` — it does not call Inkling directly (§2.4). Emit on each open, not on every re-render.
- **Edge cases:** Rapid open/close — debounce so Inkling isn't asked to summarize repeatedly; emit once per genuine open.
- **UI/UX considerations:** Summary is a nicety, never blocking; the list is usable with Inkling closed.
- **Data flow notes:** AlertsDropdown → `alertsOpened` → InklingPanel (§13.2).
- **Testing notes:** Open emits `alertsOpened` once; re-render does not re-emit.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.3, §13.2 (`alertsOpened`).

## 2.3.7 — Style dropdown per spec (glass, subtle, readable)

- **Purpose:** Match the app's visual language and ensure legibility.
- **Dependencies:** 2.3.2.
- **Acceptance criteria:** The dropdown uses the glass/subtle aesthetic with readable contrast (§7.3); kind icons, section headers, and actions are visually distinct; z-index 300 keeps it above panels and below toasts (§8.6).
- **Implementation notes:** Reuse shared panel styling tokens (the same glass treatment used by Inkling/Settings shells in Phase 3) so the dropdown doesn't drift visually. Ensure text contrast meets accessibility minimums against the translucent background.
- **Edge cases:** Long event titles → truncate with ellipsis + tooltip/full title on hover; many alerts → internal scroll, not page growth.
- **UI/UX considerations:** "Subtle, readable" (§7.3) — glass must not sacrifice contrast.
- **Data flow notes:** Presentation only.
- **Testing notes:** Visual/snapshot check; contrast check; truncation behavior.
- **Performance notes:** Avoid heavy backdrop-blur on low-end mobile if it causes jank — degrade gracefully.
- **Mobile vs desktop:** Glass tuned per platform (2.3.8).
- **Integration points:** §7.3, §8.6, Phase 3 shared styling.

## 2.3.8 — Add mobile-friendly layout for dropdown

- **Purpose:** Make the dropdown usable on small touch screens.
- **Dependencies:** 2.3.2, 2.3.7.
- **Acceptance criteria:** On mobile (< 640px, §8.7), the dropdown adapts — full-width/sheet-style from the top rather than a narrow anchored panel — with touch-sized rows and actions.
- **Implementation notes:** Follow §8.7 breakpoints (mobile full-screen/sheet; tablet 50%; desktop anchored ~380px). On mobile the Alerts button stays in the top bar (§8.1), but the panel expands to a top sheet. Snooze/Dismiss become comfortably tappable (≥44px targets).
- **Edge cases:** Landscape mobile; very small heights → internal scroll; safe-area insets (notches).
- **UI/UX considerations:** Touch ergonomics; avoid actions too close together (mis-taps on Dismiss).
- **Data flow notes:** Same data/component; responsive presentation only.
- **Testing notes:** Renders sheet layout under 640px; tap targets meet size minimums.
- **Performance notes:** Watch blur cost on mobile (2.3.7).
- **Mobile vs desktop:** This task is the divergence point.
- **Integration points:** §8.7, §8.1.

## 2.3.9 — Add basic keyboard navigation for alerts list

- **Purpose:** Make alerts operable without a pointer (accessibility).
- **Dependencies:** 2.3.2, 2.3.5.
- **Acceptance criteria:** When open, Arrow keys move focus between alert rows, Enter activates (navigates, 2.3.5), Escape closes the dropdown and returns focus to the Alerts button; rows are reachable in DOM/tab order.
- **Implementation notes:** Use a roving-tabindex or `aria-activedescendant` pattern; give the panel `role="menu"`/listbox semantics and rows appropriate roles. Escape-to-close mirrors the panel convention (3.2.6/3.3.5). Restore focus to the trigger on close so keyboard users aren't dropped.
- **Edge cases:** Empty list (nothing to focus — focus stays on the panel/close); focus trap vs. allowing Tab out; per-row Snooze/Dismiss must also be keyboard reachable.
- **UI/UX considerations:** Visible focus ring; logical order matches visual (missed then upcoming).
- **Data flow notes:** Enter reuses the 2.3.5 `navigateTo` path.
- **Testing notes:** Arrow/Enter/Escape behave; focus returns to trigger on close.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Primarily desktop; harmless on mobile with a keyboard attached.
- **Integration points:** §7.3, accessibility (Phase 8 focus management).

## 2.3.10 — Cross-check with spec §7.0

- **Purpose:** Confirm the Alerts UI matches the spec before Phase 3 builds the full shell around it.
- **Dependencies:** 2.3.1–2.3.9.
- **Acceptance criteria:** Verified against §7.3 (header, sorted list, per-row content, badge = 24h un-dismissed count, AI summary on open), §7.6 (missed section), §8.1 (placement), §8.6 (z-index 300), §8.7 (responsive). Deviations fixed or documented.
- **Implementation notes:** Walk §7.3 point by point: anchored panel, "Upcoming Alerts" header, ascending sort by `alert.time`, per-alert title/time-until/kind icon, Snooze/Dismiss, empty state, badge rule, `alertsOpened` → Inkling. Confirm Snooze/Dismiss route through `updateEvent` per §7.2 (no direct event mutation) — the UI emits intent, the model writes.
- **Edge cases:** Badge "within 24h" vs Scheduler horizon "7 days" — confirm the two different windows are intentional and both correct.
- **UI/UX considerations:** Confirm glass/readability claims hold under real content.
- **Data flow notes:** Confirms the §12.4 subscriber set is fully wired.
- **Testing notes:** Spec-to-implementation checklist passes.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both layouts verified against §8.7.
- **Integration points:** §7.0, §8.1, §8.6, §8.7.

---

### Milestone 2.3 — Definition of Done
- Alerts button + 24h badge live in the top bar; `AlertsDropdown` lists missed + upcoming alerts sorted by time, with "time until" labels, kind icons, and Snooze/Dismiss (all writes via `updateEvent`).
- The dropdown refreshes on `alertTriggered`/`eventUpdated`, navigates via `navigateTo { level:"day" }` on click, emits `alertsOpened` for Inkling, and is responsive (§8.7), glass-styled (z-index 300), and keyboard-operable.
- **Phase 2 complete.** Next: Phase 3, Milestone 3.1 — Top Bar & Mode State.
