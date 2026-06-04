# Phase 1 — Milestone 1.4: Storage Safety & Limits (Expanded)

**Goal:** Never lose user data to `localStorage` limits or re-entrant writes.
**Spec alignment:** §3.3 (concurrency, storage-size guard), §3.4, §10.3.
**Sequencing:** Depends on 1.1 (mutations and persistence). Hardens the write path before later phases add high-volume features.

---

## 1.4.1 — Implement storage size estimation before writes

- **Purpose:** Know how big the serialized store is before committing, so we can warn or block near the limit.
- **Dependencies:** 1.1.4 (`saveToStorage`).
- **Acceptance criteria:** Before each write, compute the byte size of the JSON to be stored; expose it for the warning/block checks in 1.4.2–1.4.3.
- **Implementation notes:** Estimate bytes via the serialized string length (UTF-16 chars ≈ approximate; for accuracy use `new Blob([json]).size` or `TextEncoder().encode(json).length`). Compute once per write and reuse for both checks.
- **Edge cases:** Multi-byte characters (emoji, non-Latin) inflate byte size beyond character count — use a byte-accurate measure, not `.length`.
- **UI/UX considerations:** Feeds user-facing warnings (§3.3) so they can export/prune before hitting the wall.
- **Data flow notes:** Runs inside the persist step, before the actual `setItem`.
- **Testing notes:** Known payloads report expected byte sizes; multi-byte content measured correctly.
- **Performance notes:** Encoding the string each write is O(size); acceptable, but avoid double-serializing — serialize once, measure that string, store that string.
- **Mobile vs desktop:** Mobile browsers may have lower quotas; the same guard protects both.
- **Integration points:** §3.3 storage-size guard.

## 1.4.2 — Emit `storageWarning` when approaching 4.5MB

- **Purpose:** Warn the user before they hit the hard limit.
- **Dependencies:** 1.4.1.
- **Acceptance criteria:** When estimated size ≥ 4.5MB, emit `storageWarning` with `{ usedBytes }`; the write still proceeds (warning, not block).
- **Implementation notes:** Make the threshold a named constant. Debounce so the user isn't spammed on every keystroke-driven save — emit once per session crossing, or at most occasionally.
- **Edge cases:** Crossing back below after deletes — allow the warning to re-arm so a later re-crossing warns again.
- **UI/UX considerations:** UIShell shows a non-blocking toast (§13.2) suggesting export/cleanup.
- **Data flow notes:** `storageWarning` → UIShell toast.
- **Testing notes:** Size just under threshold → no emit; at/over → emit once.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical logic; copy may differ per platform.
- **Integration points:** §13.2 `storageWarning`.

## 1.4.3 — Emit `storageFull` and reject writes above ~4.9MB

- **Purpose:** Prevent a failed `setItem` from silently losing the user's latest change.
- **Dependencies:** 1.4.1, 1.4.2.
- **Acceptance criteria:** When estimated size > ~4.9MB, do **not** write; emit `storageFull` with `{ usedBytes }`; the in-memory `_events` change that triggered it is rolled back so memory and storage stay consistent.
- **Implementation notes:** Check size on the *would-be* serialized state before mutating in memory, or snapshot and roll back if the guard trips — never leave `_events` holding data that isn't persisted. Also wrap the real `setItem` in try/catch for actual `QuotaExceededError` as a backstop.
- **Edge cases:** Browser quota lower than 5MB (Safari, private mode) — the try/catch backstop catches the real throw even if the estimate said OK.
- **UI/UX considerations:** UIShell shows a blocking error explaining the save failed and offering export (§13.2); the user must not believe a lost edit was saved.
- **Data flow notes:** On block, no `eventCreated`/`eventUpdated` success emit fires (ties to 1.1.9 ordering).
- **Testing notes:** Oversized write is rejected, state rolls back, `storageFull` emits, no success emit fires.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Critical on mobile where quotas are tighter.
- **Integration points:** §3.3 (reject above 4.9MB), §13.2 `storageFull`.

## 1.4.4 — Add `_writing` mutex to prevent re-entrant writes

- **Purpose:** Stop overlapping writes (e.g., during `bulkCreateEvents`) from each serializing and persisting.
- **Dependencies:** 1.1.8.
- **Acceptance criteria:** A `_writing` flag guards the persist step; batch operations set it, do their inserts, then persist once and clear it; nested writes during a batch do not each hit storage.
- **Implementation notes:** Single-tab app, so this is a simple boolean, not a real lock. `bulkCreateEvents` sets `_writing = true`, performs all inserts (which skip individual persists while the flag is set), then persists once and clears the flag.
- **Edge cases:** An exception mid-batch must still clear the flag (use try/finally) or the app silently stops persisting.
- **UI/UX considerations:** Prevents jank from repeated synchronous serialization during imports.
- **Data flow notes:** Ties directly to 1.1.8's single-persist requirement.
- **Testing notes:** Bulk insert of N items results in exactly one `setItem`; an error mid-batch still clears `_writing`.
- **Performance notes:** This is the guard that turns a potential O(n²) batch into O(n).
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3 concurrency, 1.1.8.

## 1.4.5 — Add logging hooks (dev-only) for storage issues

- **Purpose:** Make storage warnings/failures visible during development without leaking to users.
- **Dependencies:** 1.4.2–1.4.3.
- **Acceptance criteria:** A dev-only logger records estimated sizes, warning/full events, and rollbacks; silent in production builds.
- **Implementation notes:** Gate behind a build flag or a `DEBUG` constant; never `console.error` raw storage details to end users (§4.7 spirit: no raw codes shown).
- **Edge cases:** Logging must not itself throw or block the write path.
- **UI/UX considerations:** None in production.
- **Data flow notes:** Observability only; no behavior change.
- **Testing notes:** Logger fires in dev mode, no-ops in prod mode.
- **Performance notes:** Cheap; guarded out of prod.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10.15 (graceful handling), dev tooling.

## 1.4.6 — Add tests simulating large event sets

- **Purpose:** Prove the guards fire at the right thresholds and data is never lost.
- **Dependencies:** 1.4.1–1.4.5.
- **Acceptance criteria:** Tests generate payloads near 4.5MB and >4.9MB and assert `storageWarning` / `storageFull` fire, rollback occurs, and `_events` matches storage afterward.
- **Implementation notes:** Build large fixtures by padding `body` text; use a mocked storage that can simulate `QuotaExceededError` to test the backstop path.
- **Edge cases:** Exactly-at-threshold; multi-byte payloads; quota-throw despite passing estimate.
- **UI/UX considerations:** None directly.
- **Data flow notes:** Confirms memory↔storage consistency invariant.
- **Testing notes:** This is the stress-test task for storage safety.
- **Performance notes:** Keep fixtures generated, not committed as huge files.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28.

## 1.4.7 — Document storage behavior in `timelineModel.js`

- **Purpose:** Record the thresholds, rollback rule, and mutex so contributors don't weaken them.
- **Dependencies:** 1.4.1–1.4.6.
- **Acceptance criteria:** A comment block documents the 4.5/4.9MB thresholds, the persist-then-emit ordering, the rollback-on-full rule, and the `_writing` mutex.
- **Implementation notes:** Co-locate with the persist function; state the invariant "memory never holds unpersisted committed state."
- **Edge cases:** Note the private-mode/quota-throw backstop explicitly.
- **UI/UX considerations:** None.
- **Data flow notes:** Documents the write-path contract for §12.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Note tighter mobile quotas.
- **Integration points:** §3.3–3.4, §10.3.

## 1.4.8 — Ensure no direct `localStorage` writes outside timeline model

- **Purpose:** Enforce the single-writer rule that all safety guards depend on.
- **Dependencies:** 1.4.1–1.4.7.
- **Acceptance criteria:** No module other than `timelineModel.js` (and the separate preferences module) calls `localStorage.setItem` for event data; verified by search/lint.
- **Implementation notes:** Add a lint rule or a simple repo grep in CI for `localStorage.setItem` outside the allowed files. Preferences (§8.4) use their own key and module — that's allowed; event data is not.
- **Edge cases:** Future contributors adding a "quick" direct write — the lint/CI check is what catches it.
- **UI/UX considerations:** None.
- **Data flow notes:** Guarantees every event write goes through the guards (§2.4, §10.3).
- **Testing notes:** CI check fails if a disallowed direct write is introduced.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §10.3, §2.4 communication rules.

## 1.4.9 — Add TODO for future cloud sync integration

- **Purpose:** Mark where sync metadata/hooks will attach without building them now.
- **Dependencies:** 1.4.7.
- **Acceptance criteria:** A clearly-scoped TODO at the persist boundary notes where a future sync layer would observe writes (e.g., after local persist succeeds), referencing Phase 10.
- **Implementation notes:** Don't add abstraction now — just a comment so the future author knows the chosen seam (post-persist emit is the natural sync trigger).
- **Edge cases:** None now.
- **UI/UX considerations:** None.
- **Data flow notes:** Sync would subscribe to the same mutation emits, not bypass the model.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §30 future roadmap, Phase 10.

## 1.4.10 — Cross-check with spec §3.3–3.4

- **Purpose:** Confirm storage safety matches the spec exactly.
- **Dependencies:** 1.4.1–1.4.9.
- **Acceptance criteria:** Every storage rule in §3.3 (mutex, size guard, persist-before-emit) and §3.4 (key names) is implemented and matches; deviations fixed or documented.
- **Implementation notes:** Verify the exact storage key strings against §3.4 — a typo'd key silently splits a user's data across two stores.
- **Edge cases:** Key-name mismatches; threshold values differing from spec.
- **UI/UX considerations:** None.
- **Data flow notes:** Confirms the write path matches §12.1.
- **Testing notes:** Spec-to-implementation checklist passes.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.3–3.4, §10.2.

---

### Milestone 1.4 — Definition of Done
- Writes estimate size first; warn at 4.5MB, block-and-roll-back above 4.9MB, with a real `QuotaExceededError` backstop.
- `_writing` mutex makes batch operations persist once; try/finally guarantees the flag clears.
- Storage keys match §3.4 exactly; no event writes occur outside the model (enforced in CI).
- **Phase 1 complete.** Next: Phase 2, Milestone 2.1 — Event Bus.
