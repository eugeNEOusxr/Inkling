# Phase 2 — Milestone 2.2: Alerts Data & Scheduler (Expanded)

**Goal:** Reconcile the **already-existing** alerts subsystem — [`src/calendar/alerts/alertsModel.js`](../../src/calendar/alerts/alertsModel.js) (a **separate** `inkling-alerts-v1` store) and [`src/calendar/alerts/alertsScheduler.js`](../../src/calendar/alerts/alertsScheduler.js) (a `setInterval` poll) — toward §7, **and decide the foundational fork first**: adopt the spec's "alerts live inside `Event` objects + single `setTimeout`" model (§7.1/§7.2), or bless the live **separate, richer** alerts engine (priority-driven multi-phase lead times) and amend §7 to match. Grounded against the live files — so every task reconciles **built / gap / next-step**, not greenfield.

> ⚠️ **Big divergence — read first.** The old greenfield 2.2 spec assumed §7.1 ("alert data lives inside `Event` objects") + §7.2 (single `setTimeout`, *not* `setInterval`) + write-via-`updateEvent`. The **live reality is the opposite on every axis**: a **separate `inkling-alerts-v1` store** (`alertsModel.js`), a **15s `setInterval` poll** (`alertsScheduler.js`), **multi-phase lead-time triggers** the spec never mentions, and **`document`-event signaling** instead of the §13.2 bus. 2.2.1 is a **decision task** (like 1.1.1) — resolve the model + scheduler design before implementing 2.2.2–2.2.10.

**Spec alignment:** §7.1 line 783-788 (Storage = alert data **inside `Event` objects**; Scheduler.js timers; UI dropdown+badge), §7.2 line 790-815 (**single `setTimeout`, not `setInterval`**; read via `timelineModel.getUpcomingAlerts(7d)`; fire → `updateEvent(triggered:true)` → emit `alertTriggered` → notify → reschedule; **snooze** = add `Alert` to the event's `alerts[]`; **dismiss** = `updateEvent(dismissed:true)`), §7.3 line 817-832 (dropdown sorted by `alert.time`; **badge = upcoming un-dismissed within 24h**; `alertsOpened` → Inkling), §7.4/§7.5 line 834-840 (sound vs popup per **`alert.kind`**), §7.6 line 842-844 (**missed** = `triggered===false && time<now`, surfaced not fired late), §3.1 line 195-225 (the `Alert` shape: `{ time, kind: "popup"|"sound", triggered, dismissed }`), §13.2 line 1172 (`alertTriggered {event, alert}` emitted by Scheduler on the **bus** → AlertsDropdown/Toast/Audio/Inkling), §12.4 (alert fire path), §2.2 line 132 (Scheduler "does not modify event data; only reads alert times").

**Sequencing:** Second Phase-2 milestone. Depends on 2.1 (the converged bus — `alertTriggered` must go there now) and the 1.2.6 finding (the **hollow** `timelineModel.getUpcomingAlerts` vs the **real** `alertsModel.getUpcomingAlerts` — a duplication this milestone resolves). It feeds 2.3 (Alerts UI). **Recurring threads:** the **separate-store vs spec-model** fork (mirrors 1.1.1), the **`document`-events vs §13.2 bus** gap (mirrors 1.1.9/2.1), and the **quota-swallow data-loss** save bug (mirrors the pre-1.4 `writeStore`).

---

## Current implementation status (reconciliation)

A **full, working alerts subsystem already exists** — and it is **more capable than §7 describes** (priority-driven multi-phase lead times, a dedicated store, a running scheduler) but **diverges from the spec on storage, scheduler design, eventing, and the `Alert` shape**, and carries the pre-1.4 data-loss save bug. This is a reconcile + converge (and partly a spec-amendment) milestone, not greenfield.

- **Alerts live in a SEPARATE store, not inside `Event` objects.** §7.1 line 786 says "alert data lives inside `Event` objects." Live `alertsModel.js` persists to its **own** key `inkling-alerts-v1` (alertsModel.js:5) as `AlertRecord[]` (:30-41), linked to the timeline by `timelineEntryId` (:39). So §3.1's `Event.alerts[]` is **not** the source of truth — the separate `alertsModel` is. This is the 1.2.6 finding's root (the timeline's `getUpcomingAlerts` reads the empty `event.alerts[]`; the real alerts are here). 2.2.1 decides: migrate alerts into events (spec) vs bless the separate model (amend §7.1).
- **The scheduler is a `setInterval` poll, not the spec's single `setTimeout`.** §7.2 line 792 is explicit: "does **not** use `setInterval` polling … sets a single `setTimeout`." Live `alertsScheduler.js` runs `setInterval(tick, 15_000)` (alertsScheduler.js:25-26) and on each tick scans all alerts within a **90s catch window** (:43-52). It works and naturally handles missed/late fires, but contradicts §7.2's battery-efficiency design. 2.2.1/2.2.7 decide whether to adopt single-`setTimeout` or keep (and justify) the interval poll.
- **Multi-phase lead-time triggers — a live feature the spec lacks.** `getLeadMinutesForPriority` (alertsModel.js:72-84) fires an alert at **multiple** lead times by priority (CRITICAL = 60/30/10/5/0 min before; HIGH = 30/10/0; NORMAL = 10/0; LOW = 0), and `buildScheduleTriggers` (:91-106) materializes a `ScheduledTrigger[]` per alert with a `phase` (`before_30`/`at_time`). §7 has **no** lead-time concept — it fires once per `Alert.time`. This is a genuine UX feature; 2.2.1 must decide whether to **keep it (amend §7 to spec multi-phase)** or drop it for the spec's single-fire model.
- **`AlertRecord` shape ≠ §3.1 `Alert`.** §3.1 `Alert` = `{ time, kind: "popup"|"sound", triggered, dismissed }`. Live `AlertRecord` (:30-41) = `{ id, time, text, category, priority, createdAt, dismissed, date, timelineEntryId, firedPhases[] }` — **no `kind`** (popup/sound), and instead of a single `triggered` bool it tracks **`firedPhases[]`** (which lead-phases fired, :214-223) + `dismissed`. So §7.4/§7.5's `kind`-based sound-vs-popup routing has **no field to key on** today (presentation is priority-driven via `playAlertSound(priority)`, alertsScheduler.js:55). 2.2.9 reconciles the state/shape (add `kind`; reconcile `triggered` vs `firedPhases`).
- **Signaling is on `document` events + direct calls, NOT the §13.2 bus.** §13.2 line 1172 + §7.2 line 806 want `alertTriggered {event, alert}` emitted on the **bus**. Live fires via `document.dispatchEvent("inkling:alert-fired")` (alertsScheduler.js:60-64) + a direct `handleSystemEvent({type:"alertTriggered",...})` into `InklingAI.js` (:58) + `playAlertSound` (:55); `saveAlerts` dispatches `document` `inkling:alerts-updated` (alertsModel.js:182); the tick dispatches `inkling:alerts-tick` (:40). **None** of this is on the canonical `src/utils/EventBus.js` (which 2.1 just converged). 2.2.8 wires `alertTriggered` onto the bus.
- **`saveAlerts` swallows quota errors — the pre-1.4 data-loss bug, here too.** `saveAlerts` (alertsModel.js:176-183) does `try { setItem } catch { console.warn }` and continues — a failed write is silently lost (exactly the bug 1.4 fixed in `timelineModel`). 2.2 should apply the same guard/rollback discipline (or, under 2.2.1 option A, this store goes away).
- **No alert cancellation on event delete.** Deleting a timeline event (`deleteEvent`) does **not** remove its alerts from `alertsModel` — they orphan by `timelineEntryId` and could still fire for a non-existent event. There is no `eventDeleted` subscriber. 2.2.6 adds cancellation.
- **Two `getUpcomingAlerts` (real vs hollow).** `alertsModel.getUpcomingAlerts(now)` (:316-324) returns `{ alert, triggerAt }[]` from the **real** store ✓; `timelineModel.getUpcomingAlerts` (1.2.6) returns `{ event, alert }[]` from the **empty** `event.alerts[]` (hollow). §3.2 names one helper. 2.2.2 resolves the duplication (the model helper delegates to / is unified with the alerts engine).
- **Badge filter is "active", not §7.3's "within 24h".** `getActiveAlertCount` (:238) counts all not-dismissed, date≥today alerts; §7.3 line 829 wants "upcoming un-dismissed within the next **24 hours**." And `syncAlertsBadge` (:245-252) writes the DOM (`[data-inkling-alerts-badge]`) **directly** rather than via the bus/§13.2. 2.2 reconciles the badge window + sourcing (mostly 2.3, noted here).
- **What's already right (keep):** `crypto.randomUUID()` ids ✓ (:51); a **dedicated alerts store** that won't bloat the timeline ✓; **priority→lead-time** mapping is a real feature ✓; `firedPhases` **dedup** prevents re-firing a phase ✓ (:214-223); the scheduler's **90s catch window** handles slightly-late fires (a pragmatic §7.6 partial) ✓; `start/stopAlertsScheduler` idempotent-ish (`if (tickTimer) return`) ✓; `createAlertFromTimelineEntry` already links timeline→alert ✓ (:258, called from `saveNoteToTimeline`); `getNextTriggerMs`/`getUpcomingAlerts` give a sorted upcoming view ✓; `loadAlerts` corrupt-JSON → `[]` self-heal ✓ (:168-170).

---

## 2.2.1 — DECISION: alerts-in-events (spec) vs separate alerts engine (live); scheduler design

- **Purpose:** Resolve the **foundational fork** before any code — (A) adopt §7.1/§7.2 (alerts inside `Event.alerts[]`, single `setTimeout`, write via `updateEvent`), or (B) **bless the live separate `alertsModel` engine** (priority-driven multi-phase, dedicated store) and **amend §7** to describe it — plus the scheduler-design sub-decision (single `setTimeout` vs the live `setInterval` poll) — so 2.2.2–2.2.10 build on one coherent model.
- **Dependencies:** None (decision). Reads: `alertsModel.js`, `alertsScheduler.js`, the §3.1 `Alert` shape, §7.1-§7.2, 1.2.6 (the duplicate helper); 2.1 (the bus the chosen design emits on).
- **Acceptance criteria:** A documented decision covering: **(1) storage** — alerts in `Event.alerts[]` (A, spec-literal; loses/migrates the separate store + multi-phase) **or** the separate `alertsModel` linked by `timelineEntryId` (B, keeps the richer engine; **amend §7.1/§3.1**); **(2) multi-phase lead times** — keep (amend §7 to spec them) or drop for single-fire; **(3) scheduler** — single `setTimeout` per soonest trigger (§7.2 battery win) or the live `setInterval(15s)` poll (simpler, self-healing) — with the missed-alert (§7.6) and mobile-backgrounding implications noted; the decision names which 2.2.x tasks change under each option and **keeps the §13.2 `alertTriggered` bus emit (2.2.8) regardless**.
- **Implementation notes:** Recommend **(B) + reconcile**: keep `alertsModel`/`alertsScheduler` as the canonical alerts engine (it's working and **more capable** — multi-phase leads are a real UX win the spec lacks), **amend §7.1/§3.1** to describe a separate alerts model linked by `timelineEntryId` (and the multi-phase trigger model), and spend 2.2.2–2.2.10 closing the **real** gaps (bus emit, data-loss save, delete-cancellation, helper dedup, badge window, missed-alerts, `kind` field, tests). For the scheduler: a **single `setTimeout` to the soonest trigger** is the §7.2 battery win and is worth adopting even under (B) — but keep a visibility/`setInterval` safety net for mobile backgrounding (a hybrid the spec's §7.6 implies). If **(A)** is chosen instead, 2.2.2–2.2.9 become a larger migration (fold `AlertRecord`→`Event.alerts[]`, rewrite the scheduler to read `timelineModel.getUpcomingAlerts`, retire `inkling-alerts-v1`).
- **Edge cases:** (B) means §3.1's `Event.alerts[]` stays mostly empty/aspirational — document that the alerts engine, not the event, is authoritative (and fix the 1.2.6 hollow helper accordingly); (A) means re-homing the multi-phase logic into per-`Event` alert entries (one `Alert` per phase, or a richer `Alert` shape) — a spec change either way; the `createAlertFromTimelineEntry` link (alertsModel.js:258) + `saveNoteToTimeline`'s dynamic import must keep working through the transition.
- **UI/UX considerations:** Multi-phase "heads-up at 30/10/0 min" is a meaningfully better alert UX than a single fire — a strong reason to keep it (B).
- **Data flow notes:** Sets whether the Scheduler reads from `timelineModel.getUpcomingAlerts` (A) or `alertsModel.getUpcomingAlerts` (B), and where `triggered`/`firedPhases` persist.
- **Testing notes:** N/A (decision) — but list the regression surface (the `document`-event consumers: `InklingAI`, the badge, AlertsDropdown/Panel — 2.3) so later tasks verify nothing breaks.
- **Performance notes:** (B) keeps the dedicated store (timeline stays lean); single-`setTimeout` (either option) beats the 15s poll on battery.
- **Mobile vs desktop:** Backgrounding suspends both timers — the §7.6 missed-path + a visibility-regain recompute matter on mobile regardless of A/B.
- **Integration points:** §7.1-§7.2, §3.1, §13.2 (`alertTriggered` kept either way), 1.2.6 (helper dedup), 2.1 (bus), the `document`-event consumers.
- **Status:** **Foundational fork (live engine contradicts §7 on storage + scheduler + shape).** Live = separate `inkling-alerts-v1` store + `setInterval` poll + multi-phase + `document` events; spec = alerts-in-events + single `setTimeout` + `updateEvent`. **Next:** pick A (adopt spec model, migrate) or **B (bless the richer live engine, amend §7)** + scheduler-design sub-decision; keep the §13.2 emit; name affected tasks.

## 2.2.2 — Reconcile the upcoming-alerts helper (resolve the real-vs-hollow duplication)

- **Purpose:** Resolve the **two `getUpcomingAlerts`** — the real `alertsModel.getUpcomingAlerts` ({alert, triggerAt}) vs the hollow `timelineModel.getUpcomingAlerts` ({event, alert} from empty `event.alerts[]`, the 1.2.6 finding) — into one canonical upcoming-alerts read the Scheduler and badge derive from.
- **Dependencies:** 2.2.1 (which store is authoritative), 1.2.6; §3.2, §7.2 line 798, §7.3.
- **Acceptance criteria:** One canonical upcoming-alerts helper backed by the authoritative store (per 2.2.1); under (B), `timelineModel.getUpcomingAlerts` either **delegates** to `alertsModel` or is removed in favor of it (the 1.2.6 hollow stub is fixed/retired, not left misleading); the result is the sorted, un-dismissed, within-horizon list (`getUpcomingAlerts(now)`, alertsModel.js:316 ✓) the Scheduler arms from and the badge/dropdown filter (24h, §7.3) derive from.
- **Implementation notes:** `alertsModel.getUpcomingAlerts` (:316-324, sorted by `triggerAt`, excludes dismissed via `getActiveAlerts`) is the **real** one — keep it. Make `timelineModel.getUpcomingAlerts` (1.2.6) delegate to it (or remove it and update callers) so there's no hollow duplicate. Expose the §7.2 7-day horizon and the §7.3 24h badge window as parameters/derived filters over this one source.
- **Edge cases:** The horizon (§7.2 = 7d for scheduling) vs the badge window (§7.3 = 24h) are **intentionally different** filters over the same list (the Phase-1 carry-forward) — keep both, document; `getNextTriggerMs` (:304) already picks the soonest **phase** trigger ≥ now−60s — reconcile with single-fire if (A) was chosen.
- **UI/UX considerations:** One source means the badge count, dropdown list, and scheduler never disagree.
- **Data flow notes:** Authoritative store → one `getUpcomingAlerts` → scheduler (7d) + badge/dropdown (24h).
- **Testing notes:** One helper returns the sorted upcoming set; the timeline stub no longer returns a different (empty) answer; horizon vs badge filters both derive from it.
- **Performance notes:** O(n alerts); cheap.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.2, §7.2/§7.3, 1.2.6, 2.2.1.
- **Status:** **Duplicated (real + hollow).** `alertsModel.getUpcomingAlerts` real; `timelineModel.getUpcomingAlerts` hollow (1.2.6). **Next:** one canonical helper on the authoritative store; fix/retire the hollow timeline stub.

## 2.2.3 — On `initialized`, build the schedule + detect missed alerts

- **Purpose:** Reconcile scheduler startup to §7.2/§7.6 — on the bus `initialized` event, build the upcoming schedule and **detect missed alerts** (past-due, un-fired) — replacing the live `startAlertsScheduler()`-on-app-start that isn't bus-driven and has no explicit missed-alert surfacing.
- **Dependencies:** 2.2.1-2.2.2, 2.1.8 (`initialized` on the bus); §7.2, §7.6, §9.3.
- **Acceptance criteria:** The scheduler subscribes to `initialized` on the canonical bus and (re)builds its schedule; **missed alerts** (un-fired phase with `fireAt < now` beyond the catch window) are surfaced as "missed" (for the 2.3 dropdown's Missed section, §7.6), **not** fired late; starter-data alerts (§9.3) schedule like any other; idempotent (a second `initialized` doesn't double-arm).
- **Implementation notes:** Today `startAlertsScheduler` (alertsScheduler.js:22) is called at app start (not via the bus) and `tickAlertsScheduler` fires anything within a 90s window (treating slightly-late as fire-now). Reconcile: subscribe to `initialized`; on it, recompute and **classify** past-due-beyond-window triggers as **missed** (a new state, surfaced to 2.3) rather than firing them. Keep the catch window for *recently* late (≤90s) fires.
- **Edge cases:** App reopened after long background → many past triggers → all classified missed, none fired late (§7.6); empty store → nothing armed; starter alerts in range schedule normally.
- **UI/UX considerations:** Missed alerts appear in the dropdown's "Missed" section (§7.6) — not as a burst of stale popups on launch.
- **Data flow notes:** `initialized` → recompute → classify missed vs upcoming → arm next.
- **Testing notes:** Past-due-beyond-window alerts are flagged missed (not fired); future alerts arm the soonest; second `initialized` no-ops.
- **Performance notes:** One scan at startup.
- **Mobile vs desktop:** Missed-detection matters more on mobile (backgrounding).
- **Integration points:** §7.2, §7.6, §9.3, 2.1.8 (`initialized`).
- **Status:** **Partial (starts, but not bus-driven; no explicit missed state).** `startAlertsScheduler` runs at app start; late fires use a 90s catch window, no "missed" classification. **Next:** subscribe to `initialized`; classify past-due-beyond-window as missed (surface to 2.3), not fire late.

## 2.2.4 — On `eventCreated`, schedule the new event's alerts (via the bus)

- **Purpose:** Reconcile alert creation to react to the bus `eventCreated` — so a new event with an alert is scheduled — replacing the live direct-call link (`saveNoteToTimeline` → `createAlertFromTimelineEntry`) that bypasses the §13.2 bus.
- **Dependencies:** 2.2.2, 2.1.8 (`eventCreated`); §7.2, §12.1/§12.3.
- **Acceptance criteria:** The scheduler subscribes to `eventCreated` on the canonical bus, ensures the event's alert(s) exist in the authoritative store, recomputes the upcoming list, and re-arms if the new alert is sooner than the pending one; AI-created events (§12.3) flow through the same `eventCreated` path (no special case); an event with no alert leaves the schedule unchanged.
- **Implementation notes:** Today the link is **imperative**: `timelineModel.saveNoteToTimeline` dynamically imports `createAlertFromTimelineEntry` (alertsModel.js:258) and attaches an `alertId`. Reconcile to a **bus** reaction: on `eventCreated`, derive/ensure the alert (from the event's alert intent) and recompute. Keep `createAlertFromTimelineEntry` as the creation helper but trigger scheduling via the bus, not a direct scheduler poke. Re-arm only if the soonest `fireAt` changed (avoid timer churn).
- **Edge cases:** Created event with no alert → no-op; the existing imperative path and the new bus path must not **double-create** an alert for the same event (dedup by `timelineEntryId`).
- **UI/UX considerations:** Badge updates via the same recompute (2.3).
- **Data flow notes:** §12.1 write → `eventCreated` → ensure alert + recompute + re-arm.
- **Testing notes:** Creating an event with a near alert re-arms to the sooner time; no double alert for one event; no-alert event leaves the timer untouched.
- **Performance notes:** Recompute O(n); re-arm only on change.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §12.1/§12.3, 2.1.8, `createAlertFromTimelineEntry`.
- **Status:** **Partial (imperative link, not bus-driven; dedup risk).** `saveNoteToTimeline`→`createAlertFromTimelineEntry` attaches alerts directly. **Next:** react to `eventCreated` on the bus, ensure-not-duplicate by `timelineEntryId`, recompute + re-arm.

## 2.2.5 — On `eventUpdated`, reschedule that event's alerts (snooze/dismiss)

- **Purpose:** Reconcile rescheduling to the bus `eventUpdated` — honoring edited times, snooze (new trigger), and dismiss — replacing today's lack of any `eventUpdated` reaction in the scheduler.
- **Dependencies:** 2.2.2, 2.1.8 (`eventUpdated`); §7.2 (snooze/dismiss), §12.4.
- **Acceptance criteria:** On `eventUpdated`, recompute and re-arm; an alert moved earlier/later is honored; a **dismissed** alert drops out; **snooze** (a new trigger N minutes out) is picked up; a **re-entrancy guard** prevents the fire→update→recompute cycle from looping (the just-fired phase is excluded via `firedPhases`).
- **Implementation notes:** Today there's **no** `eventUpdated` handler in `alertsScheduler`; dismiss is `dismissAlert` (alertsModel.js:201, sets `dismissed:true` + saves) and snooze isn't implemented. Reconcile: subscribe to `eventUpdated` (and/or an alerts-changed signal), recompute. For **snooze** (§7.2: 5/10/30 min, original stays triggered), add a trigger/alert with a new `fireAt` and keep the original's fired phase. Guard against the self-triggered-update loop (the firing path's own `markAlertPhaseFired`/`updateEvent` must converge).
- **Edge cases:** Event time moved into the past; all alerts dismissed; the self-triggered update must terminate (not re-arm the alert being processed this tick).
- **UI/UX considerations:** Snoozing visibly reschedules; the dropdown refreshes on the same signal (2.3).
- **Data flow notes:** §12.4 fire emits `eventUpdated` → this handler arms the next; snooze adds a trigger.
- **Testing notes:** Editing an alert time re-arms; snooze adds + reschedules; dismiss removes; the fire→update→recompute cycle terminates.
- **Performance notes:** Recompute O(n); guard redundant re-arm.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §12.4, 2.1.8.
- **Status:** **Missing (no `eventUpdated` reaction; no snooze).** Dismiss exists; snooze + reschedule-on-update don't. **Next:** subscribe to `eventUpdated`, implement snooze (5/10/30, original stays fired), re-arm with a loop guard.

## 2.2.6 — On `eventDeleted`, cancel that event's alerts (MISSING)

- **Purpose:** Add the §7.2/§13.2 cancellation the live code lacks — on `eventDeleted {id}`, remove that event's alerts so they never fire for a non-existent event — closing an orphaned-alert bug.
- **Dependencies:** 2.2.2, 2.1.8 (`eventDeleted`); §13.2 (`eventDeleted`), §7.2.
- **Acceptance criteria:** On `eventDeleted {id}`, the scheduler removes alerts whose `timelineEntryId === id` from the authoritative store, recomputes, and re-arms; if the **pending** timer belonged to the deleted event, it's cleared and replaced with the next soonest; a stale fire for a missing event no-ops safely.
- **Implementation notes:** Today `deleteEvent` (timelineModel) does **not** touch `alertsModel` — alerts orphan by `timelineEntryId`. Add an `eventDeleted` subscriber that filters `alertsModel` by `timelineEntryId` (a new `removeAlertsForEntry(id)` in alertsModel) and re-arms. The fire path (2.2.8) must tolerate a missing event/alert and abort.
- **Edge cases:** Deleting the event whose alert is ms from firing — the cleared timer wins; a stale timer that still fires must no-op (guard in the fire handler); deleting an event with no alerts → no-op.
- **UI/UX considerations:** Badge decrements; dropdown drops the entry.
- **Data flow notes:** delete path → `eventDeleted` → remove alerts + re-arm.
- **Testing notes:** Deleting the soonest-alert event clears its timer + arms the next; orphaned alerts are gone; a fire for a missing event no-ops.
- **Performance notes:** O(n) filter.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §13.2 (`eventDeleted`), 2.1.8.
- **Status:** **Missing.** No `eventDeleted` reaction; alerts orphan on delete. **Next:** add `removeAlertsForEntry(id)` + an `eventDeleted` subscriber; clear the pending timer if it was the deleted event's.

## 2.2.7 — Scheduler timer design: single `setTimeout` (vs the live `setInterval` poll)

- **Purpose:** Reconcile the timer to §7.2 — one `setTimeout` to the soonest trigger, re-armed on fire — replacing the live `setInterval(15s)` poll, while keeping a mobile-backgrounding safety net; per the 2.2.1 scheduler sub-decision.
- **Dependencies:** 2.2.1 (scheduler decision), 2.2.2 (soonest trigger source); §7.2 line 792-802.
- **Acceptance criteria:** If adopting §7.2: the scheduler holds **one** `setTimeout` for the soonest trigger (`clearTimeout`+`setTimeout(fire, msUntil)`), with the **overflow clamp** (delays > ~24.8 days / 2³¹ ms fire immediately — cap to the 7-day horizon) and **0/negative → fire on next microtask**; on fire it processes that trigger and arms the next; a **`visibilitychange`/interval safety net** recomputes on return (mobile backgrounding suspends `setTimeout`); if **keeping `setInterval`**, the 15s poll is justified/documented against §7.2 and the missed-path (2.2.3/§7.6) covers suspension.
- **Implementation notes:** Live `setInterval(15s)` (alertsScheduler.js:25-26) + 90s window is simple and self-healing but not §7.2. Recommended hybrid: **single `setTimeout`** to the soonest `fireAt` (battery win) **plus** a lightweight `visibilitychange` recompute (covers backgrounding the spec's single-timer ignores). Clamp the delay; compute `msUntil = fireAt - now`. Keep `firedPhases` dedup so a re-arm/recompute can't double-fire.
- **Edge cases:** Device sleep/clock change → on wake, recompute and route very-late triggers to the missed path (§7.6), don't fire stale; same-time triggers fire in one pass; overflow clamp.
- **UI/UX considerations:** Single-timer = no constant wakeups draining mobile battery (§7.2 rationale).
- **Data flow notes:** Timer fire → 2.2.8/2.2.9 → re-arm.
- **Testing notes:** Fake timers: exactly one pending timer; re-arm after fire; overflow-delay clamp; visibility-regain recompute.
- **Performance notes:** O(1) timers regardless of alert count — the §7.2 efficiency win vs the 15s poll.
- **Mobile vs desktop:** Mobile backgrounding suspends `setTimeout` — the visibility recompute self-heals.
- **Integration points:** §7.2, 2.2.1, §7.6.
- **Status:** **Divergent (`setInterval` poll vs single `setTimeout`).** Live polls every 15s with a 90s catch window. **Next:** single `setTimeout` to soonest + overflow clamp + visibility-regain safety net (per 2.2.1), or document the interval as a deliberate deviation.

## 2.2.8 — Emit `alertTriggered` on the canonical bus when an alert fires

- **Purpose:** Reconcile alert firing to §13.2 line 1172 / §7.2 line 806 — emit `alertTriggered { event, alert }` on the **canonical bus** (the one 2.1 converged) — replacing the live `document` `inkling:alert-fired` + direct `handleSystemEvent` calls.
- **Dependencies:** 2.2.7, 2.1.3 (hardened `emit`), 2.1 (single bus); §13.2, §12.4, §7.4-§7.5.
- **Acceptance criteria:** On fire, the scheduler emits `alertTriggered { event, alert }` **exactly once** per trigger on `src/utils/EventBus.js`; subscribers (AlertsDropdown badge, Toast for `kind:"popup"`, Audio for `kind:"sound"`, InklingPanel) react there (2.3 + §7.4/§7.5); the legacy `document.dispatchEvent("inkling:alert-fired")` (alertsScheduler.js:60) and the direct `handleSystemEvent` (:58) are migrated onto the bus (or kept as a documented transitional shim like 2.1's `timelineUpdated`); a deleted-event fire emits nothing (2.2.6); `firedPhases` makes a double-fire a no-op.
- **Implementation notes:** Add the canonical-bus emit in `tickAlertsScheduler`'s fire block (alertsScheduler.js:54-64) after `markAlertPhaseFired`. Move `InklingAI.handleSystemEvent` and `playAlertSound` to **subscribers** of `alertTriggered` (the scheduler announces; subscribers present) per §7.4/§7.5 — or, transitionally, keep the direct calls but **also** emit on the bus, with a TODO to converge (mirroring 2.1's shim discipline). The `{ event, alert }` payload needs the linked event — resolve it via `timelineEntryId` (a reconciliation point given alerts are a separate store, 2.2.1).
- **Edge cases:** Event deleted between arm and fire → abort, emit nothing; duplicate fire (timer + recompute race) → `firedPhases` guard; multi-phase means **several** `alertTriggered` emits per alert over time (one per phase) — document that vs the spec's single fire (ties to 2.2.1's multi-phase decision).
- **UI/UX considerations:** `kind`-based routing (popup vs sound) happens in subscribers (§7.4/§7.5), not the scheduler — but the live AlertRecord has no `kind` (2.2.9 adds it).
- **Data flow notes:** The hub of §12.4's fan-out — now on one bus.
- **Testing notes:** Fire emits `alertTriggered` once per trigger with `{event, alert}` on the canonical bus; deleted-event fire emits nothing; no double-emit.
- **Performance notes:** Single synchronous emit per trigger.
- **Mobile vs desktop:** Identical; subscribers adapt presentation.
- **Integration points:** §13.2, §12.4, §7.4-§7.5, 2.1, 2.2.6, 2.2.9 (`kind`).
- **Status:** **Divergent (document events + direct calls, not the bus).** Live fires `inkling:alert-fired` on `document` + direct `handleSystemEvent`/`playAlertSound`. **Next:** emit `alertTriggered {event,alert}` on the canonical bus; migrate sound/Inkling to subscribers (or shim+TODO); resolve the linked event via `timelineEntryId`.

## 2.2.9 — Reconcile alert state/shape: `kind` (popup/sound), `triggered` vs `firedPhases`, persist-on-fire

- **Purpose:** Reconcile the live `AlertRecord` to §3.1/§7 — add the **`kind: "popup"|"sound"`** field §7.4/§7.5 route on, and reconcile the single `triggered` bool (§3.1/§7.6) with the live `firedPhases[]` — persisting fire state through the model's safe-write discipline (no quota-swallow).
- **Dependencies:** 2.2.1 (shape decision), 2.2.8 (fire path), 1.1.6/1.4 (safe persist pattern); §3.1 line 199-202, §7.4-§7.6.
- **Acceptance criteria:** Alerts carry a **`kind`** (`"popup"`|`"sound"`) so §7.4/§7.5 can route presentation (today routing is priority-driven via `playAlertSound(priority)`); the §3.1 `triggered`/`dismissed` semantics are reconciled with the live `firedPhases[]`+`dismissed` (e.g. `triggered` = "all phases fired" or per-phase, documented; §7.6 missed-detection keys on the agreed field); fire-state writes go through a **safe persist** (the `saveAlerts` quota-swallow at alertsModel.js:176-183 is replaced with the 1.4-style guard/rollback, or routed through the model if 2.2.1=A); a `storageFull` on a fire-state write follows the 1.4.3 policy (notify anyway, may re-surface as missed).
- **Implementation notes:** Add `kind` to `AlertRecord` + `createAlert` (default by category/priority, or explicit); decide `triggered` mapping (recommend: `triggered` is derived "final phase fired", keep `firedPhases` as the engine detail); **fix `saveAlerts`** to not silently swallow quota (mirror 1.4: estimate/guard or at least surface `storageFull`). Under §7.2's `updateEvent`-write model (A), fire-state would persist via the timeline model instead.
- **Edge cases:** Legacy stored alerts without `kind` → default on load (`normalizeAlert`, :142); a quota failure on the fire-state write must not silently lose the "fired" mark (else the alert re-fires forever) — surface + treat as missed next session.
- **UI/UX considerations:** `kind` enables the §7.4 gentle-sound vs §7.5 toast distinction the user can toggle in Settings; multi-phase "triggered" must read sensibly in the dropdown (2.3).
- **Data flow notes:** Fire → mark phase/`triggered` → safe persist → (2.2.8) emit.
- **Testing notes:** New alerts have `kind`; legacy alerts default it; fire marks the agreed state and persists; a simulated quota failure surfaces `storageFull` and doesn't silently lose the fired mark.
- **Performance notes:** One safe write per fire.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.1, §7.4-§7.6, 1.4 (safe persist), 2.2.1/2.2.8.
- **Status:** **Divergent + unsafe persist.** No `kind` field; `firedPhases[]` instead of `triggered`; `saveAlerts` swallows quota (data-loss). **Next:** add `kind`; reconcile `triggered`/`firedPhases`; safe-persist fire state (1.4 discipline).

## 2.2.10 — Tests for alert scheduling, firing, snooze/dismiss, missed, cancellation

- **Purpose:** Prove the reconciled schedule stays correct across the mutation lifecycle and fires accurately — the alert-correctness net the live subsystem currently has **none** of.
- **Dependencies:** 2.2.1-2.2.9; §28, §7.2, §12.4.
- **Acceptance criteria:** Tests (fake timers + mocked storage/bus) cover: initial scan arms soonest + classifies missed (§7.6); `eventCreated`/`eventUpdated`/`eventDeleted` re-arm correctly; fire emits `alertTriggered` once per trigger on the canonical bus and persists fire state; **snooze** adds + reschedules; **dismiss** removes; multi-phase fires each phase once (no re-fire via `firedPhases`); the fire→`eventUpdated`→recompute loop terminates; **event-delete cancels** alerts (no orphan fire); a quota failure on fire-state write surfaces `storageFull` and doesn't lose the fired mark; all pass and are wired into `npm test`.
- **Implementation notes:** Add `server/tests/alertsScheduler.test.mjs` (+ maybe `alertsModel.test.mjs`) mirroring the Phase-1 test style; drive time with a fake clock / injectable `now` (the live `tickAlertsScheduler(now)` and `getUpcomingAlerts(now)` already accept `now` ✓ — testable); spy the canonical bus for single-emit; mock `localStorage`.
- **Edge cases:** Same-time triggers; delete-before-fire; overflow-delay clamp; multi-phase dedup; persistence-failure on fire-state.
- **UI/UX considerations:** None directly.
- **Data flow notes:** Validates §12.4 end-to-end at the scheduler boundary.
- **Testing notes:** This is the Phase-2 alert-correctness net.
- **Performance notes:** Fake timers keep it fast/deterministic.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, §7.2, §12.4, 2.2.1-2.2.9.
- **Status:** **Missing.** No scheduler/alerts tests exist. **Next:** `server/tests/alertsScheduler.test.mjs` covering scan/missed/create-update-delete/fire-emit/snooze/dismiss/multi-phase-dedup/cancellation/quota; wire into `npm test`.

---

### Milestone 2.2 — Definition of Done
- The 2.2.1 fork is decided (recommended: bless the live `alertsModel`/`alertsScheduler` engine + amend §7; keep multi-phase; single `setTimeout` + visibility safety net).
- One canonical upcoming-alerts helper (the 1.2.6 hollow timeline stub fixed/retired); the scheduler reacts to `initialized`/`eventCreated`/`eventUpdated`/`eventDeleted` on the **canonical bus**, cancels alerts on delete, and surfaces missed alerts (§7.6).
- Fire emits `alertTriggered {event, alert}` on the canonical bus; alerts carry `kind`; fire state persists safely (no quota-swallow); snooze/dismiss work.
- Scheduler + alerts tests cover the lifecycle (fake timers). **Next:** Milestone 2.3 — Alerts UI Shell Integration.
