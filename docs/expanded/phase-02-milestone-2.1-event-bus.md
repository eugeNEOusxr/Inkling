# Phase 2 — Milestone 2.1: Event Bus (Expanded)

**Goal:** A lightweight, synchronous, singleton pub/sub (`eventBus.js`) that is the **only** channel for cross-module communication.
**Spec alignment:** §2.2 (Event Bus module), §2.4 (communication rules), §13.1 (design), §13.2 (catalog), §13.3 (subscription lifecycle).
**Sequencing:** First milestone of Phase 2. The timeline model (1.1.9) already emits mutation events; this milestone makes the bus they emit through real, then re-points the model's emits at it. Everything in Phases 2–3 (Scheduler, Alerts UI, UI Shell, panels) depends on this.

---

## 2.1.1 — Create `eventBus.js` with simple pub/sub API

- **Purpose:** Provide the single shared channel through which all modules communicate without importing each other's internal state.
- **Dependencies:** None (foundational); it is imported by the timeline model retroactively in 2.1.8.
- **Acceptance criteria:** `eventBus.js` exports a singleton with `on`, `off`, and `emit`. Importing it from two modules yields the same instance and they can communicate.
- **Implementation notes:** Back the registry with a `Map<eventName, Set<handler>>` — a `Set` makes `off` O(1) and naturally dedupes a handler subscribed twice. Export one shared instance, not a class, so every importer shares state (§13.1 "singleton").
- **Edge cases:** Emitting an event with zero subscribers must be a no-op, not an error.
- **UI/UX considerations:** None directly; this is infrastructure every panel and renderer rides on.
- **Data flow notes:** Realizes the §2.4 topology: UI Shell → bus → core logic → bus → renderers.
- **Testing notes:** Two importers see the same instance; emit with no listeners does nothing.
- **Performance notes:** `Map`/`Set` give O(1) subscribe/unsubscribe; emit is O(handlers).
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.2, §13.1.

## 2.1.2 — Implement `on(eventName, handler)` and `off(eventName, handler)`

- **Purpose:** Let components subscribe on mount and unsubscribe on unmount (§13.3).
- **Dependencies:** 2.1.1.
- **Acceptance criteria:** `on` registers a handler for an event; `off` removes that exact handler reference; after `off`, the handler no longer fires on `emit`.
- **Implementation notes:** Lazily create the `Set` for an event on first `on`. `off` must match by reference — document that anonymous inline handlers cannot be unsubscribed (a common leak source per §13.3). Consider returning an unsubscribe function from `on` as a convenience so callers can `const dispose = on(...)`.
- **Edge cases:** `off` for an event/handler that was never subscribed is a safe no-op; double-`off` is harmless; `on` with the same handler twice should not fire it twice (the `Set` guarantees this).
- **UI/UX considerations:** Reliable `off` is what prevents stale panels from reacting after they close.
- **Data flow notes:** Subscription lifecycle is mount/unmount paired (§13.3).
- **Testing notes:** Subscribe→emit→fires; off→emit→does not fire; off of unknown handler no-ops; duplicate `on` fires once.
- **Performance notes:** O(1) with `Set`.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.3.

## 2.1.3 — Implement `emit(eventName, payload)`

- **Purpose:** Publish an event synchronously to all current subscribers.
- **Dependencies:** 2.1.1–2.1.2.
- **Acceptance criteria:** `emit` calls every subscribed handler **synchronously, in subscription order**, passing `payload`; returns after all handlers have run.
- **Implementation notes:** §13.1 forbids async handlers on the bus — handlers may *start* async work but must return immediately. Iterate over a **snapshot** (copy) of the handler set so a handler that subscribes/unsubscribes during dispatch doesn't corrupt iteration. Wrap each handler call in try/catch so one throwing subscriber doesn't abort the rest (and doesn't leave, e.g., the Scheduler unscheduled); log the error via the dev logger (2.1.7).
- **Edge cases:** Handler that unsubscribes itself mid-emit; handler that emits a second event re-entrantly (synchronous recursion — keep payloads small and avoid cycles); handler throwing.
- **UI/UX considerations:** Synchronous order means a renderer and the badge update in a predictable sequence — no flicker from races.
- **Data flow notes:** This is the mechanism behind every path in §12 (write, read, alert-fire).
- **Testing notes:** Handlers fire in order; a throwing handler doesn't stop later handlers; mid-emit unsubscribe is safe.
- **Performance notes:** O(handlers); snapshot copy is the cost of safe re-entrancy — acceptable for the small handler counts here.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.1, §12.1–§12.4.

## 2.1.4 — Add type hints / JSDoc for known events

- **Purpose:** Document the event catalog at the call site so contributors emit/subscribe with the right names and payloads.
- **Dependencies:** 2.1.3.
- **Acceptance criteria:** JSDoc (or a typedef block) enumerates the §13.2 events with their payload shapes; editors offer autocompletion/hints for event names.
- **Implementation notes:** Mirror §13.2 exactly: `initialized {eventCount}`, `eventCreated/eventUpdated Event`, `eventDeleted {id}`, `starterDataCleared`, `storageWarning/storageFull {usedBytes}`, `dayFocused/weekFocused/monthFocused`, `modeChanged {mode}`, `navigateTo {date, level}`, `alertTriggered {event, alert}`, `alertsOpened`, `inklingOpened`, `inklingClosed`. **Note the naming reconciliation:** the roadmap's `timelineInitialized` is the spec's `initialized` (§13.2) — use the spec name and record the alias in a comment so 1.3.7 and 2.2.3 agree (see 2.1.9).
- **Edge cases:** Catalog drift — if a new event is added, this block must be updated or subscribers guess names.
- **UI/UX considerations:** None.
- **Data flow notes:** Documents every subscriber relationship in §13.2.
- **Testing notes:** N/A (documentation), but a lint/test can assert emitted names exist in the catalog.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2.

## 2.1.5 — Ensure no circular imports with core modules

- **Purpose:** Keep the bus a leaf dependency so importing it never creates an import cycle.
- **Dependencies:** 2.1.1.
- **Acceptance criteria:** `eventBus.js` imports nothing from `timelineModel.js`, `Scheduler.js`, or UI modules; those modules import the bus, never the reverse.
- **Implementation notes:** The bus must stay dependency-free — it only knows about strings and functions, never about events, alerts, or the DOM. This is precisely what makes §2.4's "no module imports another's internal state" enforceable.
- **Edge cases:** A future temptation to have the bus "know" about the timeline model (e.g., for logging event titles) would create a cycle — keep such logic in the subscriber.
- **UI/UX considerations:** None.
- **Data flow notes:** One-directional dependency: everyone → bus.
- **Testing notes:** A dependency-graph check (e.g., madge) reports no cycle through `eventBus.js`.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.4.

## 2.1.6 — Add tests for subscription and unsubscription

- **Purpose:** Lock in the on/off/emit contract so refactors can't silently break propagation.
- **Dependencies:** 2.1.2–2.1.3.
- **Acceptance criteria:** Tests cover: subscribe→emit fires with payload; multiple subscribers fire in order; `off` stops a handler; duplicate `on` fires once; emit with no subscribers no-ops; a throwing handler doesn't block others; mid-emit subscribe/unsubscribe is safe.
- **Implementation notes:** Use spies/mocks to record call order and payloads; assert the snapshot-iteration behavior explicitly with a handler that unsubscribes a sibling during dispatch.
- **Edge cases:** Re-entrant emit; self-unsubscribe; throwing handler.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the channel every §12 path relies on.
- **Testing notes:** This is the core safety net for Phase 2/3.
- **Performance notes:** Keep tests synchronous and fast.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28 (testing), §13.

## 2.1.7 — Add dev-only logging toggle for emitted events

- **Purpose:** Make the flow of events observable during development without noise in production.
- **Dependencies:** 2.1.3.
- **Acceptance criteria:** A dev-only toggle logs each `emit` (name + payload summary); silent in production builds; off by default.
- **Implementation notes:** Gate behind a `DEBUG`/build flag (mirror 1.4.5's pattern so the codebase has one logging convention). Log a *summary* of the payload, not the whole `Event` object, to keep the console readable. The same logger captures handler errors caught in 2.1.3.
- **Edge cases:** Logging must never throw or alter dispatch order/timing.
- **UI/UX considerations:** None in production.
- **Data flow notes:** Observability only; no behavior change.
- **Testing notes:** Logger fires in dev, no-ops in prod; logging a circular payload doesn't crash.
- **Performance notes:** Guarded out of prod; in dev, keep summaries cheap.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10 implementation guidelines, 1.4.5 (shared logging convention).

## 2.1.8 — Integrate timeline model emits with event bus

- **Purpose:** Route the model's mutation emits (1.1.9, 1.3.7, 1.4.2–1.4.3) through the real bus.
- **Dependencies:** 2.1.1–2.1.3, 1.1.9.
- **Acceptance criteria:** `createEvent`/`updateEvent`/`deleteEvent` emit `eventCreated`/`eventUpdated`/`eventDeleted` via `eventBus.emit`; `init` emits `initialized {eventCount}`; storage guards emit `storageWarning`/`storageFull`; all fire **after** successful persistence (persist-before-emit, per 1.1.9 / §12.1).
- **Implementation notes:** Replace any placeholder emit shim in the model with `import { eventBus }`. Preserve the §12.1 ordering: persist → then emit, so subscribers (Scheduler, renderers) never react to state that didn't make it to storage. On a `storageFull` rollback (1.4.3) **no** success emit fires.
- **Edge cases:** A failed write must not emit a success event; `bulkCreateEvents` (1.1.8) persists once then emits — decide whether it emits one `initialized`/batch event or per-event `eventCreated` (prefer a single batch signal to avoid N renderer re-renders; document the choice).
- **UI/UX considerations:** Correct ordering prevents the UI from briefly showing an event that then vanishes on storage-full.
- **Data flow notes:** This wires the write path in §12.1 end-to-end.
- **Testing notes:** Each mutation emits the right event with the right payload, only after persist; storage-full path emits no success event.
- **Performance notes:** Batch emits to avoid O(n) renderer churn during imports (ties to 1.4.4 mutex).
- **Mobile vs desktop:** Identical.
- **Integration points:** §12.1, §13.2, 1.1.9, 1.3.7, 1.4.2–1.4.3.

## 2.1.9 — Document event naming conventions

- **Purpose:** Establish one canonical set of event names so emitters and subscribers never mismatch.
- **Dependencies:** 2.1.4, 2.1.8.
- **Acceptance criteria:** A comment/doc block states the conventions: past-tense for facts that happened (`eventCreated`, `alertTriggered`), present/imperative for requests (`navigateTo`), and the canonical catalog (§13.2). The `initialized` vs `timelineInitialized` alias is explicitly resolved in favor of `initialized`.
- **Implementation notes:** Record the resolution prominently so 2.2.3 ("on `timelineInitialized`, scan events") subscribes to `initialized`. Names are strings, so a typo silently means "never fires" — this doc is the guard against that.
- **Edge cases:** New events must follow the convention; reviewers check new emit names against the catalog.
- **UI/UX considerations:** None.
- **Data flow notes:** Naming consistency is what makes the §13.2 subscriber table reliable.
- **Testing notes:** Optional lint asserting emitted strings ∈ catalog.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2, 2.2.3.

## 2.1.10 — Cross-check with spec §2.2, §13.0

- **Purpose:** Confirm the bus matches the spec exactly before downstream milestones build on it.
- **Dependencies:** 2.1.1–2.1.9.
- **Acceptance criteria:** Verified against §2.2 (lightweight pub/sub, sole comms channel), §13.1 (singleton, synchronous, subscription order, no async handlers), §13.2 (catalog names/payloads), §13.3 (mount/unmount lifecycle). Deviations fixed or documented.
- **Implementation notes:** Walk the §13.2 table row by row and confirm each event's name and payload shape is exactly producible/consumable through this API.
- **Edge cases:** Any catalog entry with no emitter yet (e.g., `alertTriggered` arrives in 2.2; UI events in Phase 3) — confirm the name is reserved and documented even before it's emitted.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the channel underlying all of §12.
- **Testing notes:** Spec-to-implementation checklist passes.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.2, §13.0.

---

### Milestone 2.1 — Definition of Done
- `eventBus.js` is a dependency-free singleton with `on`/`off`/`emit`; emit is synchronous, in subscription order, snapshot-iterated, and resilient to a throwing handler.
- The timeline model emits all mutation/storage events through the bus, persist-before-emit, with no success emit on a storage-full rollback.
- Event names match the §13.2 catalog exactly; `timelineInitialized` is reconciled to `initialized` and documented. Next: Milestone 2.2 — Alerts Data & Scheduler.
