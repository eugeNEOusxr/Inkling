# Phase 2 — Milestone 2.2: Alerts Data & Scheduler (Expanded)

**Goal:** A battery-efficient `alerts/Scheduler.js` that keeps the live alert schedule in sync with the timeline and fires `alertTriggered` at the right moment.
**Spec alignment:** §7.1 (architecture), §7.2 (scheduler logic, fire, snooze, dismiss), §7.6 (missed alerts), §12.4 (alert fire path), §13.2 (`alertTriggered`).
**Sequencing:** Depends on 2.1 (event bus) and 1.2.6 (`getUpcomingAlerts`). Alert data lives **inside** `Event` objects (§7.1), so the Scheduler reads via the timeline model and writes only through `updateEvent` — it never touches storage directly (§2.2).

---

## 2.2.1 — Create `alerts/Scheduler.js`

- **Purpose:** Own the single source of truth for *when* the next alert fires, decoupled from where alert data is stored.
- **Dependencies:** 2.1 (bus), 1.2.6 (`getUpcomingAlerts`).
- **Acceptance criteria:** `Scheduler.js` exists with an `init()` that wires bus subscriptions and computes the first timer; a `stop()`/teardown that clears the timer and unsubscribes.
- **Implementation notes:** Per §7.1, alert *storage* is inside events; the Scheduler holds only the timer + a small derived view, never a second copy of event data (§2.3 "no module holds its own copy"). It reads alert times via the model and writes status via `updateEvent` only.
- **Edge cases:** `init()` called twice must not leave two timers running — make it idempotent (clear any existing timer first).
- **UI/UX considerations:** Indirect — correct scheduling is what makes alerts trustworthy.
- **Data flow notes:** Sits between the timeline model (source of alert times) and the bus (fires `alertTriggered`).
- **Testing notes:** `init` sets up exactly one timer; `stop` clears it and removes subscriptions.
- **Performance notes:** No polling loop (see 2.2.7) — one pending timer at a time.
- **Mobile vs desktop:** Identical logic; mobile backgrounding affects timer accuracy (handled by 2.2.x missed-alert detection).
- **Integration points:** §7.1, §7.2, §2.2.

## 2.2.2 — Implement in-memory list of scheduled alerts

- **Purpose:** Maintain a sorted, derived view of upcoming alerts to pick the soonest without rescanning all events each tick.
- **Dependencies:** 2.2.1, 1.2.6.
- **Acceptance criteria:** The Scheduler keeps an in-memory list of `{ eventId, alert, fireTime }` for un-triggered, un-dismissed alerts within the horizon, sorted ascending by `fireTime`.
- **Implementation notes:** Derive this list from `getUpcomingAlerts(60*24*7)` (§7.2 horizon = 7 days). Keep it **derived**, not authoritative — on any mutation, recompute rather than incrementally hand-patch, to avoid drift (recompute is cheap at expected volumes). Store enough to call `updateEvent(eventId, ...)` on fire.
- **Edge cases:** Two alerts at the same `fireTime` — stable order is fine; both fire in the same tick sequence. Alerts beyond the 7-day horizon are intentionally excluded until a later recompute brings them in range.
- **UI/UX considerations:** This list is also what the badge/dropdown count derives from (badge is "within 24h" per §7.3 — a tighter filter on the same data).
- **Data flow notes:** Rebuilt from `getUpcomingAlerts`; feeds the timer choice (2.2.7).
- **Testing notes:** Given fixture events, the list contains exactly the upcoming un-triggered/un-dismissed alerts, sorted.
- **Performance notes:** Recompute is O(n events) via the model helper; acceptable per 1.2.10 (no O(n²)).
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §7.3 (shared upcoming-alerts data), 1.2.6.

## 2.2.3 — On `initialized`, scan events and schedule alerts

- **Purpose:** Build the initial schedule as soon as the timeline is loaded.
- **Dependencies:** 2.2.1–2.2.2, 1.3.7/2.1.8 (`initialized` emit).
- **Acceptance criteria:** On `initialized` (the spec name; roadmap's "timelineInitialized" — see 2.1.9), the Scheduler recomputes its list and arms the timer for the soonest alert.
- **Implementation notes:** Subscribe in `init()`. **Run missed-alert detection (2.2.x / §7.6) before arming the next timer** — alerts with `triggered === false && fireTime < now` are surfaced as missed, not silently fired late. Use the canonical event name `initialized` to avoid the 2.1.9 naming pitfall.
- **Edge cases:** First run loads starter data (§9.3) which may include alerts — these schedule like any other. Empty timeline → no timer armed.
- **UI/UX considerations:** Missed alerts appear in the dropdown's "Missed" section on open (§7.6).
- **Data flow notes:** `initialized` → recompute → detect missed → arm timer.
- **Testing notes:** With past-due alerts, they're flagged missed and not fired; with future alerts, the soonest is armed.
- **Performance notes:** One scan at startup.
- **Mobile vs desktop:** Mobile is more likely to have missed alerts from backgrounding — §7.6 path matters more there.
- **Integration points:** §7.2, §7.6, §9.3, 2.1.9.

## 2.2.4 — On `eventCreated`, add relevant alerts to schedule

- **Purpose:** Keep the schedule current when a new event with alerts appears.
- **Dependencies:** 2.2.2, 2.1.8 (`eventCreated`).
- **Acceptance criteria:** On `eventCreated`, recompute the upcoming list and re-arm the timer if the new event introduces an alert sooner than the current pending one.
- **Implementation notes:** Simplest correct approach: recompute from the model and re-arm (the "any timeline mutation" trigger in §7.2). Only `clearTimeout`+`setTimeout` if the soonest `fireTime` changed, to avoid needless timer churn.
- **Edge cases:** A created event with no alerts → list unchanged, timer untouched. An AI-created event (§12.3) flows through the same `eventCreated` path — no special case.
- **UI/UX considerations:** Badge count updates via the same recompute (AlertsDropdown subscribes too, 2.3.3).
- **Data flow notes:** §12.1 write path → `eventCreated` → Scheduler recompute.
- **Testing notes:** Creating an event with a near alert re-arms the timer to the new, sooner time.
- **Performance notes:** Recompute O(n); re-arm only on change.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §12.1, §12.3.

## 2.2.5 — On `eventUpdated`, reschedule alerts for that event

- **Purpose:** Reflect edited times, added/removed alerts, or status changes (including the Scheduler's own `triggered` write).
- **Dependencies:** 2.2.2, 2.1.8 (`eventUpdated`).
- **Acceptance criteria:** On `eventUpdated`, recompute and re-arm; alerts moved earlier/later are honored; alerts now triggered/dismissed drop out.
- **Implementation notes:** **Re-entrancy guard:** firing an alert calls `updateEvent` (2.2.9), which emits `eventUpdated`, which this handler observes — recompute is fine (the just-triggered alert is now excluded) but ensure the recompute doesn't re-arm a timer for an alert currently being processed in the same tick. Snooze (§7.2) appears here as an *added* alert with a new time, so reschedule must pick it up.
- **Edge cases:** Event time moved into the past; all alerts removed; the self-triggered update (must converge, not loop).
- **UI/UX considerations:** Snoozing visibly reschedules; AlertsDropdown refreshes on the same `eventUpdated` (2.3.3).
- **Data flow notes:** §12.4 emits `eventUpdated` from the fire path — this handler closes that loop by scheduling the next alert.
- **Testing notes:** Editing an alert time re-arms; the fire→update→recompute cycle terminates (no infinite loop).
- **Performance notes:** Recompute O(n); guard against redundant re-arm.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2 (snooze/dismiss), §12.4.

## 2.2.6 — On `eventDeleted`, cancel alerts for that event

- **Purpose:** Ensure a deleted event's alerts never fire.
- **Dependencies:** 2.2.2, 2.1.8 (`eventDeleted`).
- **Acceptance criteria:** On `eventDeleted {id}`, drop that event's alerts from the list and re-arm; if the pending timer was for the deleted event, it is cleared and replaced with the next soonest.
- **Implementation notes:** Recompute excludes the deleted id automatically (it's gone from the model). The key correctness point: if the *currently armed* timer belonged to the deleted event, it must be cleared so it doesn't fire for a non-existent event.
- **Edge cases:** Deleting the event whose alert is milliseconds from firing — the cleared timer wins; if a stale timer somehow fires, the fire handler (2.2.8/2.2.9) must tolerate a missing event and abort gracefully.
- **UI/UX considerations:** Badge decrements; dropdown removes the entry.
- **Data flow notes:** §12 delete path → `eventDeleted` → cancel + re-arm.
- **Testing notes:** Deleting the soonest-alert event clears its timer and arms the next; a fire for a missing event no-ops safely.
- **Performance notes:** Recompute O(n).
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.2, §13.2 (`eventDeleted`).

## 2.2.7 — Implement timer loop or `setTimeout` per alert

- **Purpose:** Fire at the right moment without burning battery on polling.
- **Dependencies:** 2.2.2.
- **Acceptance criteria:** The Scheduler holds **one** `setTimeout` for the soonest alert (not a `setInterval` poll, per §7.2); on fire it processes that alert and schedules the next.
- **Implementation notes:** Compute `msUntilAlert = fireTime - now`; `clearTimeout(current)` then `setTimeout(fire, msUntil)`. **Clamp the delay:** `setTimeout` overflows past ~24.8 days (2³¹ ms) and fires immediately — cap the horizon (the 7-day window in §7.2 keeps us well under this, but clamp defensively). For delays of 0 or negative (alert already due), fire on the next microtask rather than scheduling negative time.
- **Edge cases:** Timer-drift / device sleep makes the actual fire late — on wake, treat very-late fires via the missed path (§7.6) instead of firing a stale popup. Clock changes (DST, manual) — recompute on visibility regain.
- **UI/UX considerations:** Single-timer design means no constant wakeups draining mobile battery.
- **Data flow notes:** Timer fire → 2.2.8/2.2.9 → re-arm.
- **Testing notes:** Use fake timers; assert exactly one pending timer; assert re-arm after fire; assert overflow-delay clamp.
- **Performance notes:** O(1) timers regardless of event count — the core efficiency win of §7.2.
- **Mobile vs desktop:** Mobile backgrounding suspends timers — pair with a visibilitychange recompute so the schedule self-heals on return.
- **Integration points:** §7.2.

## 2.2.8 — Emit `alertTriggered` via event bus when alert fires

- **Purpose:** Notify all subscribers (dropdown, toast, audio, Inkling) that an alert fired.
- **Dependencies:** 2.2.7, 2.1.3 (`emit`).
- **Acceptance criteria:** On fire, the Scheduler emits `alertTriggered { event, alert }` exactly once per alert (§13.2 payload).
- **Implementation notes:** Order per §12.4: first `updateEvent(... triggered:true)` (which emits `eventUpdated`), **then** emit `alertTriggered`. Subscribers: AlertsDropdown (badge), ToastContainer (popup if `kind==="popup"`), AudioSystem (tone if `kind==="sound"`), InklingPanel (if open). The Scheduler decides nothing about presentation — it just announces.
- **Edge cases:** Event deleted between arming and firing → abort, emit nothing (ties to 2.2.6). Duplicate fire (timer + manual recompute racing) → the `triggered` flag set in 2.2.9 makes a second emit a no-op.
- **UI/UX considerations:** `kind`-based routing (popup vs sound) happens in subscribers per §7.4/§7.5, not here.
- **Data flow notes:** This is the hub of §12.4's fan-out.
- **Testing notes:** Fire emits `alertTriggered` once with `{event, alert}`; deleted-event fire emits nothing; no double-emit.
- **Performance notes:** Single synchronous emit.
- **Mobile vs desktop:** Identical; subscribers adapt presentation per platform.
- **Integration points:** §12.4, §13.2, §7.4–§7.5.

## 2.2.9 — Mark alert as `triggered` in event data

- **Purpose:** Persist that the alert fired so it doesn't re-fire and so the dropdown can show state.
- **Dependencies:** 2.2.8, 1.1.6 (`updateEvent`).
- **Acceptance criteria:** On fire, the alert's `triggered` flag is set `true` via `updateEvent` (not by mutating event data directly), so it persists and emits `eventUpdated` (§12.4).
- **Implementation notes:** §7.1 keeps alert data inside the event; the only legal write is through `updateEvent` (§2.2 single-writer). Set `triggered` **before** emitting `alertTriggered` is acceptable, but the spec's §12.4 order is `updateEvent` → `alertTriggered` — follow it so the `eventUpdated`-driven recompute (2.2.5) already sees the alert as triggered when it runs.
- **Edge cases:** A `storageFull` (1.4.3) on this update — the flag write is rolled back; decide policy: prefer firing the notification anyway (user is told) but log that persistence failed, so the alert may re-surface as missed next session rather than being silently lost.
- **UI/UX considerations:** Triggered alerts move out of "Upcoming" in the dropdown.
- **Data flow notes:** `updateEvent` → persist → `eventUpdated` → Scheduler recompute + AlertsDropdown refresh.
- **Testing notes:** After fire, the event's alert shows `triggered:true` in storage; recompute excludes it.
- **Performance notes:** One model write per fire.
- **Mobile vs desktop:** Identical.
- **Integration points:** §7.1, §7.2, §12.4, 1.1.6, 1.4.3.

## 2.2.10 — Add tests for alert scheduling and triggering

- **Purpose:** Prove the schedule stays correct across the full mutation lifecycle and fires accurately.
- **Dependencies:** 2.2.1–2.2.9.
- **Acceptance criteria:** Tests (with fake timers + a mocked model/bus) cover: initial scan arms soonest; create/update/delete re-arm correctly; fire emits `alertTriggered` once and sets `triggered`; snooze adds and reschedules; dismiss removes; missed-alert detection on init; the fire→`eventUpdated`→recompute loop terminates.
- **Implementation notes:** Drive time with fake timers; advance to just-before/just-after `fireTime` and assert. Mock `getUpcomingAlerts` to control fixtures. Assert single-emit via a spy call count.
- **Edge cases:** Same-time alerts; delete-before-fire; overflow delay clamp; persistence-failure on the `triggered` write.
- **UI/UX considerations:** None directly.
- **Data flow notes:** Validates §12.4 end-to-end at the Scheduler boundary.
- **Testing notes:** This is the Phase 2 alert-correctness net.
- **Performance notes:** Fake timers keep it fast and deterministic.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, §7.2, §12.4.

---

### Milestone 2.2 — Definition of Done
- `alerts/Scheduler.js` holds a single `setTimeout` for the soonest alert, recomputes a derived upcoming list on every timeline mutation, and never stores a second copy of event data.
- Fire path follows §12.4: `updateEvent(triggered:true)` → `eventUpdated` → `alertTriggered {event, alert}` → re-arm; no double-fire, deleted-event fires are safe no-ops.
- Missed alerts (past-due, un-triggered) are detected on `initialized`/visibility-regain and surfaced, not fired late. Next: Milestone 2.3 — Alerts UI Shell Integration.
