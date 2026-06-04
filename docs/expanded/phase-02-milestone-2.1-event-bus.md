# Phase 2 — Milestone 2.1: Event Bus (Expanded)

**Goal:** Converge the **two already-existing** pub/sub modules — the canonical [`src/utils/EventBus.js`](../../src/utils/EventBus.js) and the duplicate [`src/wordweaver/EventBus.js`](../../src/wordweaver/EventBus.js) — into one §13 singleton bus, harden `emit` (snapshot iteration), document the §13.2 catalog, and finish migrating the model's emits (1.1.9 already routes §13.2 events through the canonical bus). This milestone is grounded against both live bus files and their **split importers** — so every task reconciles **built / gap / next-step**, not greenfield.

> ⚠️ **Path note.** §13.1 calls it `eventBus.js`; §28 (master_spec_expanded.md line 1959) names **`src/core/eventBus.js`**; the live canonical file is **`src/utils/EventBus.js`** (what `timelineModel.js` and others already import) and the duplicate is **`src/wordweaver/EventBus.js`**. **Three names, two files.** Do not create `src/core/eventBus.js`: pick the live canonical `src/utils/EventBus.js` and reconcile §28 to it (2.1.1).

**Spec alignment:** §13.1 line 1144-1154 (singleton pub/sub `on`/`off`/`emit`, **synchronous, in subscription order, no async handlers**), §13.2 line 1156-1175 (the **16-event catalog**: `initialized`/`eventCreated`/`eventUpdated`/`eventDeleted`/`starterDataCleared`/`storageWarning`/`storageFull`/`dayFocused`/`weekFocused`/`monthFocused`/`modeChanged`/`navigateTo`/`alertTriggered`/`alertsOpened`/`inklingOpened`/`inklingClosed`), §13.3 line 1177-1187 (mount/unmount subscribe/unsubscribe), §19.5 line 1469-1471 (**per-handler try/catch error isolation** + log + "silent internal error tracker"), §2.2 line 134 (bus is the sole comms channel), §2.4 line 161-163 (UI→bus→core→bus→renderers topology), §28 line 1959 (the `src/core/eventBus.js` path to reconcile).

**Sequencing:** First milestone of Phase 2. The timeline model (1.1.9) **already emits** §13.2 events through `src/utils/EventBus.js`; this milestone makes that bus the **single** one (retiring the duplicate), hardens it, documents the catalog, and migrates the duplicate-bus consumers. Everything in Phases 2–3 (Scheduler, Alerts UI, UI Shell, panels) and the 3D/2D sync (§18) depends on one bus. **Recurring thread:** this is the same duplicate-stack pattern as the Phase-1 `timelineModel` and the Phase-5 finding (5.1.9 named exactly this two-bus split).

---

## Current implementation status (reconciliation)

A working synchronous pub/sub bus **already exists** — in fact **twice**, as two near-identical modules with importers split between them. The model already emits §13.2 events through the canonical one (1.1.9). The gaps are **convergence**, **snapshot-safe emit**, a **documented catalog**, **dev logging**, **tests**, and retiring the **`timelineUpdated` shim**.

- **Two near-identical bus modules; importers are split.** Canonical [`src/utils/EventBus.js`](../../src/utils/EventBus.js) (`Map<string, Set<cb>>`, `on` returns an unsubscribe fn :10-15, `off` :22, `emit` no-op-on-empty + per-handler try/catch :31-42, `default` export :44) **vs** the duplicate [`src/wordweaver/EventBus.js`](../../src/wordweaver/EventBus.js) (same `Map<string,Set>`, `on` does **not** return unsubscribe :8, `off` :18, `emit` :26, no default). **Importers split:** canonical used by `InklingChatBridge.js` (emit), `WordWeaverViewport.jsx` (on), `timelineModel.js` (`canonicalBus`); duplicate used by `WordWeaverScene.js` (on/off :10), `WordWeaverTimelineViewport.js` (on :4), `InklingTimelineBridge.js` (emit :2), and `timelineModel.js` (`wwEmit` shim :14). 2.1.1 picks `src/utils/EventBus.js` as canonical, migrates the duplicate's importers, and retires `src/wordweaver/EventBus.js`.
- **`emit` is not snapshot-iterated.** §13.1 requires synchronous, in-order dispatch; the 2.1.3 safety bar is that a handler subscribing/unsubscribing **mid-emit** must not corrupt iteration. Both buses iterate the live `Set` directly (`for (const fn of set)`, utils/EventBus.js:35, wordweaver/EventBus.js:29) — JS `Set` preserves insertion order (so "subscription order" ✓) but mutating it during iteration is unsafe. 2.1.3 iterates a **snapshot copy**.
- **`on` unsubscribe-return is inconsistent.** Canonical `on` returns `() => off(...)` (utils/EventBus.js:14) ✓ — a convenient `const dispose = on(...)`; the duplicate's `on` returns nothing. After convergence (2.1.1) every caller gets the unsubscribe-returning `on`. 2.1.2 standardizes this and documents the §13.3 mount/unmount pattern.
- **No §13.2 catalog documentation.** Neither bus enumerates the 16 §13.2 events or their payloads — names are bare strings, so a typo silently means "never fires." 2.1.4 adds the JSDoc/typedef catalog.
- **No dev-logging toggle.** Neither bus has the observability hook §-style debugging wants (and Phase 1 established a dev-gated logging convention in 1.4.5). 2.1.7 adds one, mirroring that convention.
- **No bus tests.** The model has tests, but there is **no** `eventBus` test covering on/off/emit/order/throwing-handler/snapshot-safety. 2.1.6 adds them.
- **Timeline emits already route through the canonical bus (2.1.8 partly DONE) — plus a `timelineUpdated` shim to retire.** `timelineModel.emitMutation` (timelineModel.js:634) emits the §13.2 event on `canonicalBus` ✓ **and** emits `"timelineUpdated"` on the **duplicate** bus (`wwEmit`) **and** a `document` CustomEvent — the 1.1.9 compatibility shim so `WordWeaverScene` (which listens to `timelineUpdated` on the duplicate bus) keeps working. 2.1.8 verifies the §13.2 emits and migrates `WordWeaverScene`/`WordWeaverTimelineViewport` to subscribe to the real §13.2 events (`eventCreated`/`eventUpdated`/`eventDeleted`/`initialized`) on the canonical bus, then retires the `timelineUpdated` shim + the duplicate bus.
- **`timelineUpdated` is not a §13.2 event; `initialized` naming is already correct.** The model uses `initialized` (not the roadmap's `timelineInitialized`) ✓ (1.3.7). But `WordWeaverScene`'s `timelineUpdated` subscription is a **non-catalog** event kept alive only by the shim. 2.1.9 documents the naming conventions and the `timelineUpdated`→§13.2 migration; note the §13.2 catalog **has** `modeChanged` (line 1170) but still lacks `preferenceChanged` (the Phase-3 3.3 carry-forward).
- **What's already right (keep):** both buses are **dependency-free leaves** (import nothing — utils/EventBus.js and wordweaver/EventBus.js have zero imports) so there's **no circular-import risk** ✓ (2.1.5 satisfied); `emit` no-ops on zero subscribers ✓ (§13.1, utils/EventBus.js:34); **per-handler try/catch** error isolation ✓ (§19.5, utils/EventBus.js:36-40 logs `console.error` and continues); `Map`/`Set` gives O(1) subscribe/unsubscribe and natural dedupe ✓; canonical `on` returns an unsubscribe fn ✓; the model already persists-before-emit and emits §13.2 names on the canonical bus ✓ (1.1.9).

---

## 2.1.1 — Converge the two bus modules; reconcile the §28 path

- **Purpose:** Resolve the **duplicate bus** — make `src/utils/EventBus.js` the single canonical bus, migrate the importers of `src/wordweaver/EventBus.js` onto it, retire the duplicate, and reconcile the spec's path names (§13.1 `eventBus.js`, §28 `src/core/eventBus.js`, live `src/utils/EventBus.js`) — so Phases 2–3 build on one bus, not two.
- **Dependencies:** None foundational; coordinates with 1.1.9 (model already on the canonical bus) and 2.1.8 (the `timelineUpdated` shim retirement); §13.1, §28 line 1959.
- **Acceptance criteria:** Exactly **one** bus module is imported app-wide (`src/utils/EventBus.js`); `src/wordweaver/EventBus.js`'s importers (`WordWeaverScene.js`, `WordWeaverTimelineViewport.js`, `InklingTimelineBridge.js`, and the model's `wwEmit`) are migrated to the canonical bus; the duplicate file is **retired** (deleted or re-exported from the canonical as a deprecated shim, documented); the path is reconciled (keep `src/utils/EventBus.js` — the one already wired — and update §28 line 1959 from `src/core/eventBus.js` to match, **or** move the file to `src/core/eventBus.js` if §28's tree is treated as normative — pick one, document); no module imports both.
- **Implementation notes:** Recommend keeping `src/utils/EventBus.js` (it's the one `timelineModel`/1.1.9 + `InklingChatBridge` + `WordWeaverViewport.jsx` already use) and updating §28 to that path (cheaper than moving a wired file). Migrate each duplicate-bus importer's `from "./EventBus.js"` → `from "../utils/EventBus.js"`. Retire `src/wordweaver/EventBus.js` last (after 2.1.8 removes the `wwEmit` shim), or temporarily re-export `{ on, off, emit }` from the canonical so nothing breaks mid-migration.
- **Edge cases:** `WordWeaverScene` listens to `timelineUpdated` on the duplicate bus — migrating it requires 2.1.8's switch to the real §13.2 events first (or the shim must keep firing on the canonical bus during transition); `WordWeaverViewport.jsx` (React) already uses the canonical bus — don't regress it; the duplicate's `on` doesn't return an unsubscribe, so callers relying on that difference (none do today) won't break.
- **UI/UX considerations:** None directly; one bus makes 2D/3D/panels provably share state (§18) instead of two islands.
- **Data flow notes:** Collapses two channels into the §2.4 single topology (UI→bus→core→bus→renderers).
- **Testing notes:** Grep shows one bus module imported everywhere; the duplicate has no remaining importers (or is a documented re-export); §28 path and the on-disk path agree.
- **Performance notes:** Neutral; one shared registry instead of two.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.1, §28 line 1959, 1.1.9, 2.1.8 (shim retirement), the 4 duplicate-bus importers, 5.1.9 (the same finding from the 3D side).
- **Status:** **Duplicated (two modules) + path divergence (three names).** Canonical `src/utils/EventBus.js` and duplicate `src/wordweaver/EventBus.js` coexist with split importers; §28 names a third path `src/core/eventBus.js`. **Next:** make `src/utils/EventBus.js` canonical, migrate the 4 duplicate-bus importers, retire the duplicate, reconcile §28.

## 2.1.2 — Reconcile `on`/`off` (unsubscribe return, §13.3 lifecycle)

- **Purpose:** Standardize subscription on the canonical bus — `on` returns an unsubscribe fn, `off` removes by exact reference — and document the §13.3 mount/unmount pattern so panels don't leak listeners.
- **Dependencies:** 2.1.1 (single bus); §13.1 line 1149-1150, §13.3 line 1177-1187.
- **Acceptance criteria:** `on(name, handler)` registers and returns `() => off(name, handler)` (canonical already does this, utils/EventBus.js:14 ✓); `off` removes that exact handler reference (✓ :22); after `off`, the handler no longer fires; duplicate `on` of the same handler fires once (Set dedupe ✓); the §13.3 pattern (subscribe on mount, `off`/dispose on unmount) is documented, with the anonymous-inline-handler leak called out (can't be `off`'d by reference).
- **Implementation notes:** The canonical bus already satisfies the mechanics — this task is mostly **verification + documentation** after 2.1.1 converges everyone onto it. Audit the migrated WordWeaver consumers (`WordWeaverScene` uses `on`/`off`, :10) to ensure they pair subscribe/unsubscribe on mount/dispose (it has a `dispose()` — confirm it `off`s).
- **Edge cases:** `off` of an unsubscribed handler/event is a safe no-op (✓ `?.delete`); double-`off` harmless; anonymous handlers can't be unsubscribed — flag in docs (§13.3 leak source).
- **UI/UX considerations:** Reliable `off` prevents closed panels from reacting (stale UI).
- **Data flow notes:** Subscription lifecycle is mount/unmount paired (§13.3).
- **Testing notes:** subscribe→emit fires; off→emit silent; unknown-handler off no-ops; duplicate on fires once; the returned dispose fn works.
- **Performance notes:** O(1) via Set.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.3, 2.1.1, the migrated consumers' dispose paths.
- **Status:** **Mostly satisfied (canonical) / inconsistent (duplicate).** Canonical `on` returns unsubscribe + `off`-by-ref ✓; duplicate `on` doesn't. **Next:** converge on the canonical (2.1.1), verify consumers pair on/off, document §13.3 + the anonymous-handler leak.

## 2.1.3 — Harden `emit`: snapshot iteration (keep synchronous, in-order, error-isolated)

- **Purpose:** Add the one real `emit` gap — iterate a **snapshot** of the handler set so a handler that subscribes/unsubscribes during dispatch can't corrupt iteration — while preserving the live synchronous, in-subscription-order, per-handler-try/catch behavior (§13.1 / §19.5).
- **Dependencies:** 2.1.1; §13.1 line 1154, §19.5 line 1469-1471.
- **Acceptance criteria:** `emit` calls every subscriber **synchronously, in subscription order**, over a **copied snapshot** of the handler set (so mid-emit `on`/`off` is safe and doesn't skip/double-fire); zero-subscriber emit is a no-op (✓); each handler is wrapped in try/catch so one throwing subscriber doesn't abort the rest (✓ §19.5) and the error is logged via the dev logger (2.1.7) plus the §19.5 "silent internal error tracker" hook; handlers may start async work but `emit` returns after all run synchronously.
- **Implementation notes:** In `emit` (utils/EventBus.js:31-42) change `for (const fn of set)` to iterate `[...set]` (or `Array.from(set)`) — a snapshot. Keep the no-op-on-empty guard (:34) and the per-handler try/catch (:36-40). Route the caught error through the 2.1.7 logger and a (stubbed) internal tracker per §19.5.
- **Edge cases:** A handler that unsubscribes itself or a sibling mid-emit (snapshot makes it safe — the unsubscribed sibling may still fire this round; document that semantics); a handler that re-entrantly `emit`s another event (synchronous recursion — keep payloads small, avoid cycles); a throwing handler.
- **UI/UX considerations:** Synchronous in-order dispatch keeps renderer + badge updates predictable (no flicker from races).
- **Data flow notes:** This is the mechanism behind every §12 path (write/read/alert-fire).
- **Testing notes:** Handlers fire in order; a throwing handler doesn't stop later ones; a handler unsubscribing a sibling mid-emit doesn't corrupt iteration; re-entrant emit is safe.
- **Performance notes:** Snapshot copy per emit is O(handlers) — negligible at these handler counts; the cost buys re-entrancy safety.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.1, §19.5, 2.1.7 (logger), §12.1-12.4.
- **Status:** **Partial (synchronous + isolated; not snapshot-safe).** `emit` is synchronous, in-order, no-op-on-empty, per-handler try/catch ✓ — but iterates the live Set (mid-emit mutation risk) and has no internal error tracker. **Next:** iterate a snapshot copy; route handler errors through the dev logger + §19.5 tracker hook.

## 2.1.4 — Document the §13.2 event catalog at the bus

- **Purpose:** Add the §13.2 catalog (16 events + payload shapes) as JSDoc/typedef on the canonical bus, so emitters and subscribers use the right names/payloads (bare-string events fail silently on a typo).
- **Dependencies:** 2.1.1; §13.2 line 1156-1175.
- **Acceptance criteria:** A JSDoc/typedef block enumerates all 16 §13.2 events with payloads exactly: `initialized {eventCount}`, `eventCreated`/`eventUpdated` `Event`, `eventDeleted {id}`, `starterDataCleared` (—), `storageWarning`/`storageFull {usedBytes}`, `dayFocused {date}`, `weekFocused {weekStart}`, `monthFocused {year, month}`, `modeChanged {mode}`, `navigateTo {date, level}`, `alertTriggered {event, alert}`, `alertsOpened` (—), `inklingOpened` (—), `inklingClosed` (—); editors hint event names; payload mismatches between the live model emits and the catalog are flagged (e.g. the model emits `storageWarning`/`storageFull` with `{ bytes }`/`{ usedBytes }` — reconcile to the §13.2 `{ usedBytes }`, and `initialized` with `{ eventCount }` ✓).
- **Implementation notes:** Mirror §13.2 line 1156-1175 exactly. **Reconcile observed payload drift:** the model currently emits `storageWarning`/`storageFull` with a `bytes`/`usedBytes` key (1.4) and `eventsBulkCreated` (a non-catalog batch event from 1.1.8) — document `eventsBulkCreated` as an intentional addition or fold it into the catalog, and align the storage payload key to `{ usedBytes }`. Record the `initialized` (not `timelineInitialized`) resolution here too (2.1.9).
- **Edge cases:** Catalog drift — a new event (like `eventsBulkCreated`, or the Phase-3 `preferenceChanged`) must be added here or subscribers guess; events with no emitter yet (`alertTriggered` lands in 2.2; UI events in Phase 3) are reserved + documented.
- **UI/UX considerations:** None.
- **Data flow notes:** Documents every subscriber relationship in §13.2.
- **Testing notes:** Optional lint asserting emitted name strings ∈ the catalog (catches typos + drift).
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2, 1.1.8 (`eventsBulkCreated`), 1.4 (storage payload), 2.1.9.
- **Status:** **Missing.** No catalog doc on either bus; live emits include a non-catalog `eventsBulkCreated` and a `{ bytes }`/`{ usedBytes }` storage payload to reconcile. **Next:** JSDoc the 16 §13.2 events + payloads; reconcile the bulk/storage payload drift; optional name-lint.

## 2.1.5 — Confirm no circular imports (bus stays a leaf)

- **Purpose:** Verify the §2.4 invariant that the bus is a dependency-free leaf — importing it never creates a cycle — which both live buses already satisfy.
- **Dependencies:** 2.1.1; §2.4, §13.1.
- **Acceptance criteria:** The canonical `src/utils/EventBus.js` imports **nothing** from `timelineModel.js`, schedulers, or UI (✓ today — zero imports); those modules import the bus, never the reverse; a dependency-graph check (madge or equivalent) reports no cycle through the bus.
- **Implementation notes:** This is **verification** — both buses are already import-free leaves. Just guard against the future temptation to have the bus "know" about events/alerts/DOM (keep such logic in subscribers). After 2.1.1, only the canonical file needs the check.
- **Edge cases:** A future helper that makes the bus log event titles by importing the model would create a cycle — keep it out.
- **UI/UX considerations:** None.
- **Data flow notes:** One-directional: everyone → bus.
- **Testing notes:** madge/graph check reports no cycle through `EventBus.js`.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.4, 2.1.1.
- **Status:** **Already satisfied.** Both buses import nothing (leaf modules) ✓. **Next:** keep it that way post-convergence; add a graph check to lock it.

## 2.1.6 — Add bus tests (on/off/emit/order/throwing/snapshot)

- **Purpose:** Lock the on/off/emit contract — the channel all of Phase 2/3 rides on — with the snapshot-safety and error-isolation cases the live bus lacks tests for.
- **Dependencies:** 2.1.2-2.1.3; §28, §13.
- **Acceptance criteria:** Tests cover: subscribe→emit fires with payload; multiple subscribers fire **in order**; `off` stops a handler; the returned dispose fn works; duplicate `on` fires once; emit with no subscribers no-ops; a **throwing handler** doesn't block others (§19.5); **mid-emit subscribe/unsubscribe** is safe (snapshot, 2.1.3); re-entrant emit is safe; all pass.
- **Implementation notes:** Add `server/tests/eventBus.test.mjs` (mirroring the timeline test style + the `npm test` wiring). Use call-order recording; explicitly test a handler that unsubscribes a sibling during dispatch (the snapshot assertion).
- **Edge cases:** Re-entrant emit; self-unsubscribe; throwing handler; dispose-fn idempotency.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the channel every §12 path relies on.
- **Testing notes:** This is the Phase-2/3 safety net.
- **Performance notes:** Synchronous, fast.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, §13, 2.1.3 (snapshot under test).
- **Status:** **Missing.** No `eventBus` test exists. **Next:** add `server/tests/eventBus.test.mjs` covering on/off/emit/order/throwing/snapshot/re-entrancy; wire into `npm test`.

## 2.1.7 — Dev-only emit logging (mirror the 1.4.5 convention)

- **Purpose:** Add an observability toggle that logs each `emit` (name + payload summary) in dev, silent in prod — using the same dev-gated logging convention Phase 1 established (1.4.5 `devLogStorage`).
- **Dependencies:** 2.1.3; §10, 1.4.5.
- **Acceptance criteria:** A dev-only toggle logs each emit (name + **payload summary**, not the whole `Event`); silent in test/production (mirror 1.4.5's gate: `import.meta.env.PROD`/`NODE_ENV`); off by default; the same logger captures the per-handler errors caught in 2.1.3 / §19.5.
- **Implementation notes:** Reuse the 1.4.5 logging pattern so the codebase has one convention (a `devLog`-style gated function). Summarize payloads (id/name), never dump full objects, to keep the console readable.
- **Edge cases:** Logging must never throw or alter dispatch order/timing; a circular payload summary must not crash.
- **UI/UX considerations:** None in production.
- **Data flow notes:** Observability only.
- **Testing notes:** Logger fires in dev, no-ops in prod; circular payload safe.
- **Performance notes:** Guarded out of prod; cheap summaries in dev.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10, 1.4.5 (shared convention), 2.1.3.
- **Status:** **Missing.** No emit logging on either bus. **Next:** dev-gated emit logger reusing the 1.4.5 pattern; also sinks handler errors.

## 2.1.8 — Finish wiring model emits + retire the `timelineUpdated` shim

- **Purpose:** Verify the model's §13.2 emits on the canonical bus (1.1.9 done) and **complete** the migration — switch `WordWeaverScene`/`WordWeaverTimelineViewport` from the `timelineUpdated` shim (duplicate bus + `document`) to the real §13.2 events, then retire the shim.
- **Dependencies:** 1.1.9 (emits done), 2.1.1 (single bus), 2.1.3 (hardened emit); §12.1, §13.2.
- **Acceptance criteria:** `createEvent`/`updateEvent`/`deleteEvent`/`bulkCreateEvents`/`init` emit `eventCreated`/`eventUpdated`/`eventDeleted`/`eventsBulkCreated`/`initialized` on the canonical bus, **persist-before-emit**, **no success emit on a storage-full rollback** (all ✓ from 1.1.9/1.4 — verify); `WordWeaverScene` (which today listens to `timelineUpdated` on the duplicate bus) subscribes instead to the §13.2 events it needs on the canonical bus and re-renders the affected portion; the `wwEmit("timelineUpdated")` + `document.dispatchEvent("timelineUpdated")` shim in `emitMutation` (timelineModel.js:634-639) is **removed** once no subscriber depends on it; any remaining `timelineUpdated`/`document` listeners are migrated or documented.
- **Implementation notes:** Grep `timelineUpdated` consumers (WordWeaverScene `_clear`/init listeners, any `document.addEventListener("timelineUpdated")`). Point them at `eventCreated`/`eventUpdated`/`eventDeleted`/`initialized` on the canonical bus (the §13.2 subscriber rows for WordWeaverScene, line 1160-1164). Then delete the shim lines in `emitMutation`. Keep persist-before-emit ordering. Decide bulk's signal (one `eventsBulkCreated` vs N `eventCreated`) — the model already emits one batch event; document it in the catalog (2.1.4).
- **Edge cases:** A failed write must not emit a success event (✓ 1.4 rollback); WordWeaverScene's full-rebuild-on-`timelineUpdated` (the 5.2.8 finding) should become a **targeted** re-render keyed on the specific §13.2 event — note that as the 5.2.8 tie-in (not required here, but the migration enables it); the `document` CustomEvent may have non-WW listeners — grep before removing.
- **UI/UX considerations:** Correct ordering prevents the UI briefly showing an event that vanishes on storage-full; moving off the catch-all `timelineUpdated` toward specific events enables less re-render churn.
- **Data flow notes:** Wires the §12.1 write path end-to-end on **one** bus.
- **Testing notes:** Each mutation emits the right §13.2 event after persist; storage-full emits none; WordWeaverScene re-renders on the real events with the shim removed.
- **Performance notes:** Specific events (vs `timelineUpdated` catch-all) let consumers do targeted re-renders (5.2.8).
- **Mobile vs desktop:** Identical.
- **Integration points:** §12.1, §13.2, 1.1.9, 1.4.3, 2.1.1, 5.2.8 (targeted re-render enabled).
- **Status:** **Partial (emits done; shim + duplicate-bus consumers remain).** Model emits §13.2 on the canonical bus ✓ but also fires a `timelineUpdated` shim on the duplicate bus + `document` for WordWeaverScene. **Next:** migrate WordWeaverScene/Viewport to the real §13.2 events, remove the shim, retire the duplicate bus (2.1.1).

## 2.1.9 — Document naming conventions; resolve `timelineUpdated` / `initialized`

- **Purpose:** Establish one canonical naming convention so emitters/subscribers never mismatch — past-tense facts (`eventCreated`), imperative requests (`navigateTo`) — and record the resolved aliases (`initialized` not `timelineInitialized`; `timelineUpdated` is a transitional shim, not a catalog event).
- **Dependencies:** 2.1.4, 2.1.8; §13.2.
- **Acceptance criteria:** A doc/comment block states: past-tense for things that happened, imperative for requests; the canonical §13.2 catalog; the `initialized` vs roadmap `timelineInitialized` resolution (use `initialized`, already done in 1.3.7); that `timelineUpdated` is a **transitional shim** being retired in 2.1.8 (not a §13.2 event); and the known **catalog gap** `preferenceChanged` (the Phase-3 3.3 seam not yet in §13.2 — flag for a spec update) — while noting `modeChanged` **is** already in the catalog (line 1170).
- **Implementation notes:** Co-locate with the 2.1.4 catalog. Names are strings — a typo means "never fires," so this doc + the optional name-lint (2.1.4) are the guards. Record that the Scheduler (2.2) subscribes to `initialized` (not `timelineInitialized`).
- **Edge cases:** New events must follow the convention and be added to the catalog; reviewers check new emit strings against it.
- **UI/UX considerations:** None.
- **Data flow notes:** Naming consistency is what makes the §13.2 subscriber table reliable.
- **Testing notes:** Optional lint: emitted strings ∈ catalog.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2, 2.1.4, 2.2 (Scheduler subscribes `initialized`), Phase-3 3.3 (`preferenceChanged` gap).
- **Status:** **Partial.** `initialized` naming already correct ✓; but `timelineUpdated` (non-catalog) is live via the shim and `preferenceChanged` is an unrecorded catalog gap. **Next:** document conventions + the catalog; mark `timelineUpdated` transitional and flag `preferenceChanged`.

## 2.1.10 — Cross-check §2.2 / §13.0-13.3 / §19.5 (+ §28 path)

- **Purpose:** Confirm the converged bus matches the spec exactly before the Scheduler (2.2) and panels build on it — including the §28 path reconciliation and the §19.5 "silent internal error tracker" the live bus lacks.
- **Dependencies:** 2.1.1-2.1.9; §2.2, §13.0-13.3, §19.5, §28.
- **Acceptance criteria:** Verified against §2.2 (sole comms channel), §13.1 (singleton, synchronous, subscription order, no async handlers, snapshot-safe), §13.2 (catalog names/payloads), §13.3 (mount/unmount lifecycle), §19.5 (per-handler try/catch ✓ **+** a "silent internal error tracker" hook — add at least a stub/sink so the spec line is met), and §28 (path reconciled to `src/utils/EventBus.js`); deviations fixed or documented.
- **Implementation notes:** Walk the §13.2 table row by row, confirming each event's name/payload is producible/consumable through the converged API; add the §19.5 internal-error-tracker sink (a no-op/console stub that a future telemetry layer replaces) so error isolation matches the spec's two-part requirement (log **and** track).
- **Edge cases:** Catalog entries with no emitter yet (`alertTriggered` in 2.2; UI events in Phase 3) — confirm names reserved/documented before they're emitted.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the channel underlying all of §12.
- **Testing notes:** Spec-to-implementation checklist passes; the error-tracker sink is invoked on a thrown handler (test).
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.2, §13.0-13.3, §19.5, §28, all prior 2.1 tasks.
- **Status:** **Open (cross-check + §19.5 tracker + §28 path).** Per-handler try/catch ✓ but no internal error tracker; §28 path unreconciled. **Next:** row-by-row §13.2 check, add the §19.5 tracker sink, confirm the §28 path fix from 2.1.1.

---

### Milestone 2.1 — Definition of Done
- One canonical `src/utils/EventBus.js` (duplicate `src/wordweaver/EventBus.js` retired); §28 path reconciled; `on` returns unsubscribe, `off`-by-ref, `emit` synchronous + in-order + **snapshot-safe** + per-handler error-isolated (§19.5 log + tracker).
- The §13.2 catalog is documented at the bus; the model emits all §13.2 events through it persist-before-emit; the `timelineUpdated` shim and duplicate-bus consumers are migrated/retired.
- Bus tests cover on/off/emit/order/throwing/snapshot; no import cycle; naming conventions + `initialized`/`timelineUpdated`/`preferenceChanged` resolutions documented.
- **Next:** Milestone 2.2 — Alerts Data & Scheduler.
