# Phase 1 — Milestone 1.4: Storage Safety & Limits (Expanded)

**Goal:** Reconcile the **already-existing** persistence in [`src/wordweaver/timelineModel.js`](../../src/wordweaver/timelineModel.js) toward §3.3's storage-safety contract — never lose user data to `localStorage` limits or re-entrant writes. Grounded against the live `writeStore`/`readStore`: today the write path **silently swallows quota errors** (`console.warn` and continues), so a failed save **loses the user's latest change without telling them** — the single biggest gap in Phase 1.

**Spec alignment:** §3.3 line 287-291 (concurrency `_writing` mutex; storage-size guard: warn near 4.5MB via `storageWarning`, reject above 4.9MB via `storageFull`), §3.4 line 293-301 (storage keys), §10 line 968 (only the model writes event data), §13.2 (`storageWarning`/`storageFull`).

**Sequencing:** Depends on 1.1 (mutations + persistence) and 1.1.8 (the bulk path the mutex protects). Hardens the write path before later phases add higher-volume features. **Carry-forward:** the §10.3 "single writer" rule must be scoped to the **event key** — the repo has **28 `localStorage.setItem` callers**, and several are **parallel event-ish stores** (the federation), so 1.4.8 can't naively forbid all writes.

---

## Current implementation status (reconciliation)

Persistence **exists and is live**, but the safety contract of §3.3 is **almost entirely absent**, and the one behavior that *is* present — catching write failures — is implemented in the **worst possible way**: it swallows the error and continues, so the user believes a lost edit was saved.

- **`writeStore` silently swallows quota errors — a data-loss bug.** §3.3 line 291 wants: estimate size, `storageWarning` near 4.5MB, **reject + `storageFull` above 4.9MB**, and never leave memory holding unpersisted state. Live `writeStore` (timelineModel.js:251-257) does `try { localStorage.setItem(...) } catch (err) { console.warn(...) }` — on `QuotaExceededError` it **logs and returns as if it succeeded**, the caller emits success, and the user's change is **gone**. This is the highest-priority fix in Phase 1. 1.4.1–1.4.3 add estimation, warning, and a hard reject with rollback + a real-throw backstop.
- **No size estimation before writes.** There is no byte-size measure anywhere; §3.3 line 290 wants one before each write. 1.4.1 adds it (`TextEncoder`/`Blob` byte size, not `.length` — multi-byte chars).
- **No `storageWarning` / `storageFull` emits.** Neither §13.2 event exists in the model. 1.4.2/1.4.3 add them on the canonical bus.
- **No `_writing` mutex.** §3.3 line 288 wants a `_writing` flag so batch operations persist once. There's no batch path today (1.1.8 adds `bulkCreateEvents`) and no mutex. 1.4.4 adds it (with `try/finally` so an exception mid-batch still clears it).
- **Corrupt-read self-heal exists (the one good half).** `readStore` (timelineModel.js:240-249) catches malformed JSON and returns `null` (→ treated as empty) ✓ — the read path self-heals. The **write** path is the unguarded one.
- **The "single writer" rule is already not literally true — there's a federation of event-ish stores.** §10 line 968 says no component writes event data except the model. In reality there are **28 `localStorage.setItem` callers**, and several persist event-ish data: `calendarState.js` (the saved-month day-nodes the model federates in, :537), `alertsModel.js` (alert objects), and `inkling-core/timelineStorage.js` (a parallel timeline store). 1.4.8 must scope the rule to the **`inkling-timeline-v1` event key** and document the other stores as the federation, not pretend one writer exists.
- **Wrong flag key (carries from 1.3.2).** The first-run flag writes `"hasUserNotes"` (timelineModel.js:209), not the §3.4 `inkling-has-user-notes` — a §3.4 key-compliance miss verified here too (1.4.10).
- **What's already right (keep):** `readStore` corrupt-JSON self-heal → `null`/empty ✓ (§10); `writeStore` is **already the single choke-point** for the event key (all event writes go through `saveTimeline`→`writeStore`) ✓ — so adding the guard in one place protects every event write; `STORAGE_KEY = "inkling-timeline-v1"` constant ✓ (§3.4 line 297).

---

## 1.4.1 — Estimate serialized size before each write

- **Purpose:** Add the §3.3 line 290 pre-write byte estimate the model lacks — so the warning (1.4.2) and the hard block (1.4.3) have a size to check, before committing a write that might silently fail.
- **Dependencies:** 1.1.4 (`saveToStorage`/`writeStore`); §3.3 line 290.
- **Acceptance criteria:** Before each write, compute the **byte** size of the JSON to be stored (not character count) and expose it to 1.4.2/1.4.3; computed once per write and reused for both checks; serialize once, measure that string, store that string (no double-serialize).
- **Implementation notes:** In/around `writeStore` (timelineModel.js:251), measure via `new Blob([json]).size` or `new TextEncoder().encode(json).length` — `.length` undercounts multi-byte (emoji, non-Latin). Compute the JSON string once, measure it, and pass the same string to `setItem`.
- **Edge cases:** Multi-byte characters inflate byte size beyond char count — use a byte-accurate measure; very large stores — the estimate itself is O(size) but acceptable.
- **UI/UX considerations:** Feeds the user-facing warning (§3.3) so they can export/prune before the wall.
- **Data flow notes:** Runs inside the persist step, before the actual `setItem`.
- **Testing notes:** Known payloads report expected byte sizes; multi-byte content measured correctly.
- **Performance notes:** Encode once per write; avoid double-serializing.
- **Mobile vs desktop:** Mobile quotas may be lower; the same guard protects both.
- **Integration points:** §3.3 size guard, 1.4.2/1.4.3 (consumers).
- **Status:** **Missing.** No size estimate before writes. **Next:** byte-accurate estimate (TextEncoder/Blob), once per write, reused by the warning/block.

## 1.4.2 — Emit `storageWarning` near 4.5MB

- **Purpose:** Add the §3.3 warning the model lacks — when the estimated size approaches 4.5MB, emit `storageWarning` (write still proceeds) — so users can act before the hard limit.
- **Dependencies:** 1.4.1; §3.3 line 291, §13.2 (`storageWarning`).
- **Acceptance criteria:** When estimated size ≥ 4.5MB, emit `storageWarning { usedBytes }` on the canonical bus; the write **still proceeds** (warning, not block); threshold is a named constant; debounced so the user isn't spammed on every save (once per session crossing, or re-armed after dropping below).
- **Implementation notes:** None exists — add the check after the 1.4.1 estimate, before `setItem`. Named constant `STORAGE_WARN_BYTES = 4.5 * 1024 * 1024`. Debounce via a module flag that re-arms when size drops below after deletes.
- **Edge cases:** Crossing back below after deletes → re-arm so a later re-crossing warns again; exactly-at-threshold → emit.
- **UI/UX considerations:** UIShell shows a non-blocking toast (§13.2) suggesting export/cleanup.
- **Data flow notes:** `storageWarning` → UIShell toast.
- **Testing notes:** Just under threshold → no emit; at/over → emit once (then debounced).
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Same logic; copy may differ.
- **Integration points:** §13.2 `storageWarning`, 1.4.1.
- **Status:** **Missing.** No warning emit. **Next:** `storageWarning { usedBytes }` at ≥4.5MB, write proceeds, debounced + re-arming.

## 1.4.3 — Reject + roll back + `storageFull` above ~4.9MB (fix the silent-swallow data-loss bug)

- **Purpose:** Replace the live **silent-swallow** write (`console.warn` and continue, losing the change) with the §3.3 line 291 contract — above ~4.9MB **do not write**, emit `storageFull`, and **roll back** the in-memory change so memory and storage stay consistent — plus a real `QuotaExceededError` backstop.
- **Dependencies:** 1.4.1, 1.4.2, 1.1.9 (no success emit on failed save); §3.3 line 291, §13.2 (`storageFull`).
- **Acceptance criteria:** When estimated size > ~4.9MB, **do not** `setItem`; emit `storageFull { usedBytes }`; the mutation that triggered it is **rolled back** (memory never holds committed-but-unpersisted state); the real `setItem` is still wrapped in try/catch for an actual `QuotaExceededError` (Safari/private-mode quotas below 5MB) as a backstop that **also** rolls back + emits `storageFull`; on block, **no** `eventCreated`/`eventUpdated` success emit fires (1.1.9 ordering).
- **Implementation notes:** This **replaces** the live `writeStore` catch that swallows + warns (timelineModel.js:254-255). Check size on the would-be serialized state **before** mutating in memory, or snapshot + roll back if the guard trips — never leave the store holding data that didn't persist. Keep the try/catch but make its catch **roll back + emit `storageFull`**, not silently warn.
- **Edge cases:** Browser quota lower than 5MB (Safari/private) — the try/catch backstop catches the real throw even when the estimate said OK; a mid-batch (1.1.8) failure must roll back the whole batch.
- **UI/UX considerations:** UIShell shows a **blocking** error explaining the save failed + offering export (§13.2); the user must never believe a lost edit was saved (exactly what the live code does today).
- **Data flow notes:** On block, no success emit; `storageFull` → UIShell error.
- **Testing notes:** Oversized write rejected, state rolls back, `storageFull` emits, **no** success emit; simulated `QuotaExceededError` hits the backstop + rolls back.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Critical on mobile (tighter quotas).
- **Integration points:** §3.3 (reject >4.9MB), §13.2 `storageFull`, 1.1.9 (emit ordering), 1.4.1/1.4.2.
- **Status:** **Broken (silent data loss).** Live `writeStore` catches quota errors with `console.warn` and continues — the change is lost, the caller emits success. **Next:** estimate-block >4.9MB + rollback + `storageFull`, keep a real-throw backstop that also rolls back; never emit success on a failed save.

## 1.4.4 — Add the `_writing` mutex (single persist per batch)

- **Purpose:** Add the §3.3 line 288 `_writing` mutex the model lacks — so `bulkCreateEvents` (1.1.8) inserts many events but persists **once**, not per item.
- **Dependencies:** 1.1.8 (the batch path); §3.3 line 288.
- **Acceptance criteria:** A `_writing` boolean guards the persist step; `bulkCreateEvents` sets it, performs all inserts (which **skip** individual persists while set), then persists once and clears it; an exception mid-batch still clears it (`try/finally`); nested writes during a batch don't each hit storage.
- **Implementation notes:** None exists. Single-tab app → a simple boolean, not a real lock. `saveTimeline`/`writeStore` (timelineModel.js:281/251) check `_writing` and no-op the actual `setItem` while a batch is in progress; the batch does the single final write. Wrap in `try/finally` so the flag always clears.
- **Edge cases:** Exception mid-batch must clear the flag (`try/finally`) or the app silently stops persisting; re-entrant single writes during a batch are coalesced.
- **UI/UX considerations:** Prevents jank from repeated synchronous serialization during imports/seeding.
- **Data flow notes:** Ties to 1.1.8's single-persist requirement (and 1.3.3 starter seed).
- **Testing notes:** Bulk insert of N → exactly one `setItem`; an error mid-batch still clears `_writing`.
- **Performance notes:** Turns a potential O(n²) batch into O(n).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3 concurrency, 1.1.8 (bulk), 1.3.3 (seed).
- **Status:** **Missing.** No mutex, no batch path today. **Next:** `_writing` flag gating persist, set/cleared by `bulkCreateEvents` via `try/finally`.

## 1.4.5 — Dev-only logging for storage issues (replace bare `console.warn`)

- **Purpose:** Make storage warnings/failures/rollbacks visible in development without leaking to users — replacing the live bare `console.warn` in the write catch (which both leaks in prod and hides the data loss).
- **Dependencies:** 1.4.2–1.4.3; §10 (graceful handling).
- **Acceptance criteria:** A dev-only logger records estimated sizes, `storageWarning`/`storageFull`, and rollbacks; silent in production; the live unconditional `console.warn` (timelineModel.js:255) is folded into this gated logger (so prod doesn't log raw storage details, and dev sees the rollback).
- **Implementation notes:** Gate behind a `DEBUG`/build flag; never surface raw codes to end users (§4 spirit). Replace the bare `console.warn("[timelineModel] save failed", err)` (:255) with the gated logger.
- **Edge cases:** Logging must not itself throw or block the write path.
- **UI/UX considerations:** None in production.
- **Data flow notes:** Observability only.
- **Testing notes:** Logger fires in dev, no-ops in prod.
- **Performance notes:** Cheap; guarded out of prod.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10, 1.4.2/1.4.3.
- **Status:** **Partial (bare warn).** Live logs an unconditional `console.warn` on save failure (and continues). **Next:** dev-gated logger covering sizes/warnings/full/rollback; remove the prod-leaking bare warn.

## 1.4.6 — Tests for large event sets + the quota backstop

- **Purpose:** Prove the guards fire at the right thresholds and **data is never lost** — the regression net for the data-loss bug 1.4.3 fixes.
- **Dependencies:** 1.4.1–1.4.5; §28.
- **Acceptance criteria:** Tests generate payloads near 4.5MB and >4.9MB and assert `storageWarning` / `storageFull` fire, rollback occurs, and `_events`/store match afterward; a mocked storage simulates `QuotaExceededError` to exercise the backstop; the **no-success-emit-on-failed-save** invariant is asserted.
- **Implementation notes:** Build large fixtures by padding `body` text; use a mock `localStorage` that can throw `QuotaExceededError`. The backstop + rollback test is the highest-value one (it guards the live data-loss bug from returning).
- **Edge cases:** Exactly-at-threshold; multi-byte payloads; quota-throw despite a passing estimate.
- **UI/UX considerations:** None directly.
- **Data flow notes:** Confirms the memory↔storage consistency invariant.
- **Testing notes:** This is the storage-safety stress task.
- **Performance notes:** Generate fixtures, don't commit huge files.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, 1.4.3 (backstop under test).
- **Status:** **Missing.** No storage-safety tests. **Next:** threshold + rollback + quota-backstop tests asserting no data loss and no false success emit.

## 1.4.7 — Document the storage contract in `timelineModel.js`

- **Purpose:** Record the thresholds, rollback rule, persist-then-emit ordering, and mutex so contributors (and Cursor) don't weaken them — and so the silent-swallow bug isn't reintroduced.
- **Dependencies:** 1.4.1–1.4.6; §3.3–3.4, §10.
- **Acceptance criteria:** A comment block documents the 4.5/4.9MB thresholds, persist-before-emit, rollback-on-full, the `_writing` mutex, and the **invariant "memory never holds unpersisted committed state"**; explicitly notes the private-mode/quota-throw backstop.
- **Implementation notes:** Co-locate with the persist function; call out that a failed save must **roll back and surface**, never silently warn (the anti-pattern being replaced).
- **Edge cases:** Note the private-mode/quota-throw backstop explicitly.
- **UI/UX considerations:** None.
- **Data flow notes:** Documents the write-path contract for §12.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Note tighter mobile quotas.
- **Integration points:** §3.3–3.4, §10.
- **Status:** **Missing.** No storage-contract comment. **Next:** co-located block documenting thresholds/rollback/mutex/ordering + the no-silent-swallow rule.

## 1.4.8 — Scope the single-writer rule to the event key (document the federation)

- **Purpose:** Reconcile §10 line 968 ("only the model writes event data") to reality — there are **28 `localStorage.setItem` callers** and several **parallel event-ish stores** — by scoping the rule to the **`inkling-timeline-v1` event key** and documenting the other stores, rather than pretending one writer exists.
- **Dependencies:** 1.4.1–1.4.7; §10 line 968, §3.4.
- **Acceptance criteria:** Only `timelineModel.js` writes the **`inkling-timeline-v1`** key (verified by search/lint) — this is **already true** (all event writes funnel through `saveTimeline`→`writeStore`); the **other** event-ish stores are documented as the federation, not violations: `calendarState.js` (saved-month day-nodes the model reads at :537), `alertsModel.js` (alert objects), `inkling-core/timelineStorage.js` (a parallel timeline store) — each owns its **own** key; a lint/CI grep flags any **new** writer of `inkling-timeline-v1` outside the model; preferences/mode/theme keys (the bulk of the 28 writers) are explicitly allowed (they're not event data).
- **Implementation notes:** Add a CI/lint check for `localStorage.setItem(...inkling-timeline-v1...)` outside `timelineModel.js`. **Do not** forbid all `localStorage.setItem` — 28 legitimate callers exist (mode, theme, auth, notifications, etc.). The real reconciliation question is whether the **parallel event-ish stores** (`inkling-core/timelineStorage.js`, `calendarState`, `alertsModel`) should converge into the model (ties to 1.1.1's federation decision) — flag it, don't force it here.
- **Edge cases:** A future contributor adding a "quick" direct write to the event key — the scoped lint catches it; the parallel stores are intentional today — document, don't break them.
- **UI/UX considerations:** None.
- **Data flow notes:** Guarantees every **event-key** write goes through the guards (1.4.1–1.4.3); the federation's stores have their own lifecycles.
- **Testing notes:** CI check fails on a new `inkling-timeline-v1` writer outside the model; the federation stores are listed/documented.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10, §3.4, 1.1.1 (federation decision), the parallel stores.
- **Status:** **Already true for the event key / federation undocumented.** All `inkling-timeline-v1` writes go through the model ✓; but 28 writers exist and ≥3 are parallel event-ish stores. **Next:** scope the lint to the event key, document the federation, flag convergence for 1.1.1 — don't forbid all writes.

## 1.4.9 — TODO for future cloud sync seam

- **Purpose:** Mark where a future sync layer attaches (post-persist) without building it now — noting the app already has `cloudSync.js`/`wordweaverCloudSync.js` so the seam should align with those.
- **Dependencies:** 1.4.7; §30 (roadmap), Phase 10.
- **Acceptance criteria:** A scoped TODO at the persist boundary notes where a future sync layer observes writes (after local persist succeeds — the same post-persist emit the §13.2 mutations fire), referencing Phase 10 and the existing `src/auth/cloudSync.js` / `src/wordweaver/wordweaverCloudSync.js`.
- **Implementation notes:** No abstraction now — just a comment naming the post-persist emit as the sync trigger and pointing at the existing cloud-sync modules so a future author reconciles rather than forks.
- **Edge cases:** None now.
- **UI/UX considerations:** None.
- **Data flow notes:** Sync subscribes to mutation emits, never bypasses the model.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §30, Phase 10, existing cloud-sync modules.
- **Status:** **Missing (forward marker).** No sync TODO; cloud-sync modules already exist to align with. **Next:** post-persist TODO referencing Phase 10 + the existing cloud-sync modules.

## 1.4.10 — Cross-check §3.3–3.4 (thresholds, ordering, keys — incl. the wrong flag key)

- **Purpose:** Confirm storage safety matches §3.3–3.4 exactly — including catching the **wrong flag key** (`hasUserNotes` vs `inkling-has-user-notes`, the 1.3.2 fix) verified here against §3.4.
- **Dependencies:** 1.4.1–1.4.9, 1.3.2 (key fix); §3.3–3.4, §10.
- **Acceptance criteria:** Every §3.3 storage rule (mutex, size guard, persist-before-emit) and §3.4 key name is implemented and matches; the storage keys are verified against §3.4 string-for-string — `inkling-timeline-v1` ✓, and `inkling-has-user-notes` (after the 1.3.2 rename from `hasUserNotes`); any deviation is fixed or documented.
- **Implementation notes:** Verify exact key strings against §3.4 (a typo splits a user's data across two stores — exactly the `hasUserNotes` bug); confirm persist-before-emit ordering (1.1.9) and the thresholds (1.4.2/1.4.3).
- **Edge cases:** Key-name mismatches (the flag key); threshold values differing from spec.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the write path matches §12.1.
- **Testing notes:** Spec-to-implementation checklist passes; both storage keys match §3.4.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3–3.4, §10, 1.3.2 (key fix verified here).
- **Status:** **Open (one known key mismatch).** `inkling-timeline-v1` ✓; `hasUserNotes` ✗ (should be `inkling-has-user-notes`). **Next:** verify all keys/thresholds/ordering against §3.3–3.4; confirm the 1.3.2 key fix.

---

### Milestone 1.4 — Definition of Done
- Writes estimate size first; warn at 4.5MB, **block-and-roll-back above 4.9MB** with a real `QuotaExceededError` backstop — the silent-swallow data-loss bug is gone; no success emit fires on a failed save.
- `_writing` mutex makes batch/seed operations persist once; `try/finally` guarantees the flag clears.
- Storage keys match §3.4 (incl. the `inkling-has-user-notes` rename); only the model writes the `inkling-timeline-v1` key (lint-enforced), with the parallel event-ish stores documented as the federation.
- **Phase 1 reconciliation complete.** Next: Phase 2, Milestone 2.1 — Event Bus (and the bus convergence 1.1.9 depends on).
