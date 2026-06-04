# Phase 1 — Milestone 1.1: Timeline Model Core (Expanded)

**Goal:** A solid, spec-compliant `timelineModel.js` with full CRUD and persistence.
**Spec alignment:** §2.2, §3.1–3.5, §10 (timeline model is the single source of truth).
**Sequencing:** This is the foundation milestone. Nothing else in the system may read or write event data until 1.1 is complete. Do tasks strictly in order; 1.1.5–1.1.8 depend on 1.1.3–1.1.4.

---

## 1.1.1 — Create `timelineModel.js` file and scaffold module structure (no logic yet)

- **Purpose:** Establish the single authoritative module that owns all event data, so no other file ever touches `localStorage` for events.
- **Dependencies:** None. This is the first task in the project.
- **Acceptance criteria:** File exists at the path the master spec names; exports stub functions (`init`, `createEvent`, `updateEvent`, `deleteEvent`, `bulkCreateEvents`, and the `getEventsFor*` helpers) that currently throw `NotImplemented`; imports cleanly with no side effects.
- **Implementation notes:** Use a module-singleton pattern — a private `_events` array in module scope, never exported directly. Export only functions. Keep one top-of-file comment block declaring this file the sole writer of event data.
- **Edge cases:** None yet (no logic), but design the export surface now so later tasks don't force a refactor.
- **UI/UX considerations:** None — pure data layer.
- **Data flow notes:** This module sits between persistence (`localStorage`) and every consumer (3D, 2D, Inkling, Scheduler). All arrows in §12 pass through here.
- **Testing notes:** Add a smoke test that simply imports the module and asserts the expected exports exist.
- **Performance notes:** None yet; just avoid running any code at import time.
- **Mobile vs desktop:** Identical.
- **Integration points:** Every other module depends on this contract. Lock the function signatures against §3.2 before proceeding.

## 1.1.2 — Implement `Event` typedefs exactly as in master spec

- **Purpose:** Encode the atomic data unit so all code shares one definition and validation has a reference shape.
- **Dependencies:** 1.1.1.
- **Acceptance criteria:** `EventType`, `Category`, `Priority`, `Alert`, `AIMetadata`, and `Event` are defined exactly matching §3.1 (field names, optionality, literal unions). No extra or missing fields.
- **Implementation notes:** If plain JS, express these as JSDoc `@typedef` blocks so editors get autocomplete without a build step; if TS, use `interface`/`type`. Keep the literal unions (`Category`, `Priority`) in one place to reuse in validation.
- **Edge cases:** `endTime` is `string | null`; `aiMetadata` is optional — model both precisely so validation can distinguish "absent" from "null".
- **UI/UX considerations:** Category and Priority literals drive color/icon choices later (§21–22); keep their names stable.
- **Data flow notes:** This shape is the contract for the event bus payloads in §13.2.
- **Testing notes:** No runtime test needed for types; add one fixture object that satisfies the full `Event` shape for reuse in later tests.
- **Performance notes:** None.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.1 is the source of truth. Any deviation here propagates everywhere — cross-check field-by-field.

## 1.1.3 — Implement in-memory `_events` array and `initTimelineModel()`

- **Purpose:** Create the authoritative in-memory state and a single initialization entry point.
- **Dependencies:** 1.1.2.
- **Acceptance criteria:** `_events: Event[]` exists in module scope; `init()` populates it, sorts by `startTime` ascending, and emits `timelineInitialized` (wired in 1.1.9 / Milestone 1.3); calling `init()` twice is safe (idempotent).
- **Implementation notes:** Sort once on init and maintain order on insert rather than re-sorting the whole array each write. Guard against double-init with an `_initialized` flag.
- **Edge cases:** Empty store (first run) — leave `_events` empty here; starter data loading is Milestone 1.3, not this task. Corrupt/partial persisted data is handled in 1.1.4.
- **UI/UX considerations:** Views must not render before `init()` completes; emit the init event so they know when to draw.
- **Data flow notes:** `init()` is the first call in app boot, before any view mounts (§12.1 boot order).
- **Testing notes:** Test that init sorts unsorted input and that a second init() does not duplicate events.
- **Performance notes:** Sorting is O(n log n) once at boot — acceptable. Avoid per-call sorting elsewhere.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3 "Initialization" sequence. Pairs with 1.1.4 for the load step.

## 1.1.4 — Implement `loadFromStorage()` and `saveToStorage()` using spec keys

- **Purpose:** Persist and restore the event array through the one storage key the spec defines.
- **Dependencies:** 1.1.3.
- **Acceptance criteria:** Reads/writes `inkling-timeline-v1`; `save` serializes the full `_events` array to JSON synchronously; `load` parses it back into validated `Event[]`; malformed JSON is caught and treated as empty, not a crash.
- **Implementation notes:** Wrap `JSON.parse` in try/catch. On parse failure, log (dev-only) and return `[]` so the app self-heals rather than white-screening. Keep the storage key as a named constant.
- **Edge cases:** Quota exceeded on save (handled fully in Milestone 1.4 — here just don't crash); absent key on load → empty array; non-array parsed value → treat as empty.
- **UI/UX considerations:** A corrupt store should degrade to "empty calendar," never a broken screen (§10.15 error boundaries).
- **Data flow notes:** Only this module touches `localStorage` for events (§2.4, §10.3). Enforce by code review.
- **Testing notes:** Round-trip test (save then load equals original); corrupt-string test returns `[]`.
- **Performance notes:** Full-array serialization is fine at expected sizes; the size guard in Milestone 1.4 protects the ceiling.
- **Mobile vs desktop:** Identical; mobile Safari private mode may throw on write — catch it.
- **Integration points:** §3.3 "Persistence", §3.4 storage schema.

## 1.1.5 — Implement `createEvent(partial)` with validation, `id`, `createdAt`, `updatedAt`

- **Purpose:** The single validated path for adding an event.
- **Dependencies:** 1.1.4.
- **Acceptance criteria:** Validates required fields (§3.1 rules); assigns `id` via `crypto.randomUUID()`, sets `createdAt`/`updatedAt`; inserts in sorted position; persists; emits `eventCreated`; returns the created `Event`. Invalid input throws a typed validation error and does **not** mutate state.
- **Implementation notes:** Validate before mutating so a rejected create leaves `_events` untouched. Centralize validation in a private `_validate(event)` reused by update.
- **Edge cases:** Empty/whitespace title → reject; `endTime` before `startTime` → reject; unknown `category` → reject (or default to `"personal"` per §3.1 — follow spec: default, don't reject); missing `priority` → default 1.
- **UI/UX considerations:** Validation errors must carry a human-readable `message` the form/Inkling can surface (§4.7, §6.7).
- **Data flow notes:** This is the write path entry in §12.1 and the AI write path §12.3.
- **Testing notes:** Valid create returns event with ids/timestamps; each invalid rule throws and leaves state unchanged.
- **Performance notes:** Insert-in-order is O(n); acceptable. Don't re-sort the whole array.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.1 constraints, §3.3 mutations.

## 1.1.6 — Implement `updateEvent(id, changes)` with validation and `updatedAt`

- **Purpose:** The single validated path for editing an event.
- **Dependencies:** 1.1.5.
- **Acceptance criteria:** Merges `changes` into the existing event, re-validates the merged result, refreshes `updatedAt`, never alters `createdAt` or `id`, re-sorts if `startTime` changed, persists, emits `eventUpdated`, returns the updated event. Unknown `id` throws.
- **Implementation notes:** Merge first, then validate the merged object (not the partial) so cross-field rules like `endTime > startTime` are checked against final state. Reuse `_validate`.
- **Edge cases:** `id` not found → throw; changing `startTime` must re-position in the sorted array; caller attempting to set `id`/`createdAt`/`updatedAt` → ignore those keys.
- **UI/UX considerations:** Used by inline edit (§6.6) and Inkling edits (§4.5); both rely on the returned event to refresh their view.
- **Data flow notes:** Also the path the Scheduler uses to mark alerts `triggered`/`dismissed` (§7.2).
- **Testing notes:** Update preserves `createdAt`, bumps `updatedAt`; invalid merge throws and leaves original intact; startTime change re-sorts.
- **Performance notes:** Find-by-id is O(n); fine at expected scale. A future id→index map is a Phase 9 optimization, not now.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3 mutations, §7.2 alert state writes.

## 1.1.7 — Implement `deleteEvent(id)`

- **Purpose:** The single path for removing an event.
- **Dependencies:** 1.1.6.
- **Acceptance criteria:** Removes the event with the given `id`, persists, emits `eventDeleted` with `{ id }`; deleting a non-existent id is a no-op (no throw, no emit) or throws per spec preference — default to silent no-op with a dev-log.
- **Implementation notes:** Filter or splice by id. Emit only if something was actually removed, so subscribers don't churn on phantom deletes.
- **Edge cases:** Unknown id → no-op; deleting the last event → `_events` becomes empty, persist the empty array.
- **UI/UX considerations:** Destructive — the UI must confirm before calling this (§10.13); the model itself does not prompt.
- **Data flow notes:** Emits `eventDeleted` → 3D/2D drop the cell, Scheduler cancels alerts (§13.2).
- **Testing notes:** Delete removes exactly one event and emits once; unknown id emits zero times.
- **Performance notes:** O(n) filter; acceptable.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 `eventDeleted` subscribers.

## 1.1.8 — Implement `bulkCreateEvents(partials)` for starter data

- **Purpose:** Efficiently insert many events at once (starter data, future import) without N separate persists/emits.
- **Dependencies:** 1.1.7.
- **Acceptance criteria:** Validates and inserts all `partials`, persists **once** at the end, emits a single batched signal (or `eventCreated` per item per spec — prefer one persist, then emit `timelineInitialized`/batch to avoid render thrash); returns the created events.
- **Implementation notes:** Set the `_writing` mutex (Milestone 1.4) during the batch so each insert doesn't trigger a separate save. Validate every item before committing any (all-or-nothing) to avoid half-imported state.
- **Edge cases:** One invalid item in the batch → reject the whole batch with a clear error, or skip-and-report per spec; default to all-or-nothing for predictability.
- **UI/UX considerations:** Used at first run for starter data (§9) and future JSON import (§8.4); both want a single re-render, not 12.
- **Data flow notes:** Single persist + single batched emit keeps 3D/2D from re-rendering once per item.
- **Testing notes:** Bulk-create N events results in one save call and N events present; invalid item rejects batch.
- **Performance notes:** Critical that this does one serialize, not N — N serializes of a growing array is O(n²).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3 `bulkCreateEvents`, §9 starter data, Milestone 1.4 mutex.

## 1.1.9 — Wire event bus emits: `eventCreated`, `eventUpdated`, `eventDeleted`

- **Purpose:** Notify the rest of the system of every mutation through the one permitted channel.
- **Dependencies:** 1.1.5–1.1.8 and `eventBus.js` (Milestone 2.1). If the bus isn't built yet, stub a minimal emit and replace in Phase 2.
- **Acceptance criteria:** Each mutation emits exactly once, after persistence succeeds, with the payload shape from §13.2 (`Event` for create/update, `{ id }` for delete). No emit on validation failure.
- **Implementation notes:** Emit *after* `saveToStorage()` returns, so subscribers never see state that isn't persisted. Keep emit calls at the end of each mutation function, not scattered.
- **Edge cases:** Save fails (quota) → do **not** emit success; emit `storageFull` instead (Milestone 1.4).
- **UI/UX considerations:** These emits drive every visible update; getting the order (persist → emit) right prevents ghost UI.
- **Data flow notes:** This is the spine of §12 and §13 — all rendering reacts to these.
- **Testing notes:** Spy on the bus: each mutation emits the right name/payload exactly once; failed validation emits nothing.
- **Performance notes:** Synchronous emit per §13.1; handlers must return immediately. Keep payloads small (the event, not the whole array).
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 event catalog, §2.4 communication rules.

## 1.1.10 — Add basic unit tests / harness for create/update/delete and persistence

- **Purpose:** Lock the foundation's behavior so later phases can't silently break it.
- **Dependencies:** 1.1.1–1.1.9.
- **Acceptance criteria:** Tests cover: create (valid + each invalid rule), update (preserves createdAt, bumps updatedAt, re-sorts), delete (removes + emits once), persistence round-trip, and corrupt-storage recovery. All pass.
- **Implementation notes:** If no test runner is set up, a minimal in-file harness that logs pass/fail is acceptable for now; prefer a real runner (Vitest/Jest) if the project has one. Mock `localStorage` with a simple in-memory object.
- **Edge cases:** Ensure tests reset `_events` and mock storage between cases so they don't leak state.
- **UI/UX considerations:** None — but these tests are the safety net for every UI built on top.
- **Data flow notes:** Tests exercise the full write path in isolation from rendering.
- **Testing notes:** This *is* the testing task; aim for behavior coverage of the public API, not internals.
- **Performance notes:** Add the O(n²) regression guard from 1.2.10 here too if convenient (bulk-create timing).
- **Mobile vs desktop:** Run headless; behavior is platform-independent.
- **Integration points:** §10.11 (validation lives in the model), §28 testing plan.

---

### Milestone 1.1 — Definition of Done
- `timelineModel.js` exports the full §3.2 API; `_events` is private; no other module writes event storage.
- Every mutation validates, persists, then emits exactly once in the §13.2 shape.
- Corrupt or absent storage degrades to an empty calendar, never a crash.
- Tests cover the public API including invalid-input paths.
- **Next:** Milestone 1.2 — Derived Views & Helpers (read side).
