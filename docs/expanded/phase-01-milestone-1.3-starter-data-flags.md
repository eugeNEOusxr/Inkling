# Phase 1 — Milestone 1.3: Starter Data & Flags (Expanded)

**Goal:** First-run starter events that feel real, and clean removal once the user adds their own.
**Spec alignment:** §9 (starter data), §3.3 (init), §3.4 (storage keys).
**Sequencing:** Depends on 1.1 (CRUD, `bulkCreateEvents`) and 1.2 (reads). Runs as part of init. Must be invisible/clean once the user is real.

---

## 1.3.1 — Create `starterEvents` constant with a realistic week/month of events

- **Purpose:** Show new users a populated calendar that feels natural, not placeholder.
- **Dependencies:** 1.1.2 (`Event` shape).
- **Acceptance criteria:** 8–12 events spanning the current and adjacent months, varied across type and category, with realistic titles/bodies; all satisfy the `Event` validation rules.
- **Implementation notes:** Compute dates relative to "now" at load time (e.g., "+2 days") so starter data always looks current, never stuck in a past month. Keep the constant data-only — no logic.
- **Edge cases:** Generated near month/year boundaries — relative offsets must not produce invalid dates; alerts in starter data should be in the near future, not already-passed.
- **UI/UX considerations:** Mix of categories so colors/icons (§21–22) showcase variety; include one high-priority item so priority styling is visible.
- **Data flow notes:** Loaded via `bulkCreateEvents` (1.1.8), single persist + single render.
- **Testing notes:** Every starter event passes `_validate`; dates land in current/adjacent months relative to a fixed clock.
- **Performance notes:** Trivial; one bulk insert.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.2 starter notes definition.

## 1.3.2 — Implement `hasUserNotes` flag logic using `inkling-has-user-notes`

- **Purpose:** Track whether the user has created any real event, to decide whether starter data shows.
- **Dependencies:** 1.1.4 (storage access).
- **Acceptance criteria:** Reads/writes `inkling-has-user-notes`; absent/`"false"` ⇒ false, `"true"` ⇒ true; exposed via a small getter the init logic uses.
- **Implementation notes:** Treat the key as a one-way latch — once `"true"`, never flips back (even if the user deletes all events, starter data does not return).
- **Edge cases:** Corrupt/unexpected value → treat as false (show starter) only if no real events exist; if real events exist but flag is missing, set the flag to true (self-heal).
- **UI/UX considerations:** Prevents starter data reappearing and confusing returning users.
- **Data flow notes:** Read at init, written on first real create (1.3.4).
- **Testing notes:** Latch behavior: setting true then attempting false stays true.
- **Performance notes:** Single key read at boot.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.4 storage schema, §9.3–9.4.

## 1.3.3 — On first run (no data), load `starterEvents` via `bulkCreateEvents`

- **Purpose:** Populate an empty calendar on the very first launch.
- **Dependencies:** 1.3.1, 1.3.2, 1.1.8.
- **Acceptance criteria:** When `inkling-timeline-v1` is absent AND `hasUserNotes` is false, load starter events through `bulkCreateEvents`; do not load them otherwise.
- **Implementation notes:** Check both the timeline key and the flag; starter load happens inside init, after `loadFromStorage` returns empty. Mark these as starter (e.g., an internal flag or known id prefix) so 1.3.5 can remove them precisely.
- **Edge cases:** Storage present but empty array → still first-run visually; decide whether to seed (prefer not to seed if the key exists, to respect a user who deleted everything).
- **UI/UX considerations:** New users immediately see a living calendar (§9.1).
- **Data flow notes:** Single bulk insert → single render via batched emit.
- **Testing notes:** Empty store seeds starter; existing store does not.
- **Performance notes:** One bulk write.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.3 load behavior.

## 1.3.4 — When user creates first real event, set `hasUserNotes = true`

- **Purpose:** Detect the transition from "sample" to "real" calendar.
- **Dependencies:** 1.1.5 (`createEvent`), 1.3.2.
- **Acceptance criteria:** The first `createEvent` that originates from the user (not the starter bulk load) sets `inkling-has-user-notes = "true"`.
- **Implementation notes:** Distinguish user creates from starter creates — e.g., `bulkCreateEvents` sets an internal "seeding" flag so it doesn't trip this latch. Set the flag before/at the same persist as the new event.
- **Edge cases:** User's first action is an *import* (bulk) rather than a single create — treat a user-initiated bulk import as real too; only the starter seed is exempt.
- **UI/UX considerations:** This is the moment starter data should disappear (1.3.5) so the user sees only their event.
- **Data flow notes:** Triggers 1.3.5 removal in the same flow.
- **Testing notes:** Starter seed does not set the flag; the first user create does.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.4 removal behavior.

## 1.3.5 — Hide starter events once `hasUserNotes` is true

- **Purpose:** Remove the sample data so it never mixes with real events.
- **Dependencies:** 1.3.4.
- **Acceptance criteria:** When the flag flips true, all starter-marked events are removed from `_events`, the cleaned array is persisted once, and `starterDataCleared` is emitted; the user's new event remains.
- **Implementation notes:** Remove by the starter marker from 1.3.3, not by guessing from content. Do the removal and the new-event insert in one persist to avoid a flash of "starter + new" together.
- **Edge cases:** User somehow edited a starter event before creating their own — decide policy: simplest is starter events are read-only-ish and still removed; if you allowed editing, treat an edited starter event as adopted (don't delete it). Pick one and document.
- **UI/UX considerations:** Clean transition — no half-second where both sample and real events show (§9.4).
- **Data flow notes:** `starterDataCleared` → 3D/2D re-render showing only real data.
- **Testing notes:** After first real create, zero starter-marked events remain; the new event is present.
- **Performance notes:** Single filter + single persist.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.4, §13.2 `starterDataCleared`.

## 1.3.6 — Add tests for starter data lifecycle

- **Purpose:** Lock the seed→use→clear flow so regressions can't reintroduce sample data.
- **Dependencies:** 1.3.1–1.3.5.
- **Acceptance criteria:** Tests cover: fresh install seeds starter; second launch (store present) does not reseed; first user create clears starter and sets the latch; deleting all real events does not bring starter back.
- **Implementation notes:** Use a fake clock and mocked storage; reset both between cases.
- **Edge cases:** All the boundary cases from 1.3.2–1.3.5 (corrupt flag, edited starter, import-first).
- **UI/UX considerations:** None directly.
- **Data flow notes:** Asserts the right emits fire (`starterDataCleared`).
- **Testing notes:** This is the lifecycle testing task.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28.

## 1.3.7 — Add event bus emit `timelineInitialized`

- **Purpose:** Signal that the model is ready so views and the Scheduler can start.
- **Dependencies:** 1.1.9 (emit wiring), 1.3.3.
- **Acceptance criteria:** After init completes (load or seed), `timelineInitialized` is emitted exactly once with `{ eventCount }`; emitted after persistence is settled.
- **Implementation notes:** Emit at the very end of `init()`, after any starter seed. Ensure it fires once even if init is guarded against double-call.
- **Edge cases:** Seed path vs load path both end in exactly one emit.
- **UI/UX considerations:** Views should subscribe and render on this, avoiding a blank first frame.
- **Data flow notes:** Kicks off Scheduler's initial alert scan (§7.2) and first renders.
- **Testing notes:** Exactly one emit per init; payload count matches `_events.length`.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 (`initialized`/`timelineInitialized`), §7.2.

## 1.3.8 — Document starter data behavior in comments

- **Purpose:** Make the seed/clear logic obvious to future contributors (and Cursor) so no one "fixes" it wrongly.
- **Dependencies:** 1.3.1–1.3.7.
- **Acceptance criteria:** A comment block in `timelineModel.js` explains the flag latch, the seed condition, the removal trigger, and why starter data never returns.
- **Implementation notes:** Keep it concise and co-located with the logic, not in a separate doc that drifts.
- **Edge cases:** Document the "edited starter event" and "import-first" decisions explicitly.
- **UI/UX considerations:** None.
- **Data flow notes:** Note which emits fire and when.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9, §10.2 (align with spec).

## 1.3.9 — Ensure no starter data leaks into export/backup (future)

- **Purpose:** Guarantee that when export/import lands (§8.4), sample data never ends up in a user's backup.
- **Dependencies:** 1.3.5.
- **Acceptance criteria:** Because starter data is removed on first real create, a real user's store contains no starter events; add a guard/comment so a future export feature also filters starter-marked events if any somehow remain.
- **Implementation notes:** Keep the starter marker available to a future exporter; add a TODO at the (future) export site referencing this rule.
- **Edge cases:** A user who never created a real event exports while starter data still shows — decide: either block export until they have real data, or strip starter on export. Prefer stripping with a note.
- **UI/UX considerations:** Prevents confusing "why are these sample events in my backup?" reports.
- **Data flow notes:** Forward-looking; ties to Phase 9/§8.4.
- **Testing notes:** When export exists, exporting with only starter data yields an empty (or clearly-sample-free) file.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §8.4 data section (future).

## 1.3.10 — Confirm behavior matches master spec

- **Purpose:** Final cross-check that the implementation matches §9 exactly.
- **Dependencies:** 1.3.1–1.3.9.
- **Acceptance criteria:** Each statement in §9.1–9.5 maps to implemented behavior; any deviation is either fixed or documented with rationale.
- **Implementation notes:** Walk §9 line by line against the code; pay attention to §9.5 (Inkling prefixing summaries with a "sample view" note when only starter data is present) — that's a cross-module obligation to flag for Phase 6.
- **Edge cases:** §9.5 Inkling behavior is implemented in Phase 6; leave a tracked TODO so it isn't forgotten.
- **UI/UX considerations:** Matches the intended new-user experience.
- **Data flow notes:** Confirms emits and removal match spec.
- **Testing notes:** Spec-to-test traceability checklist passes.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9 in full, §10.2.

---

### Milestone 1.3 — Definition of Done
- Fresh installs see realistic, current-dated starter events; returning users never do.
- `hasUserNotes` is a one-way latch; first real create clears starter data in a single clean persist.
- `timelineInitialized` fires once; lifecycle is tested and documented.
- §9.5 Inkling "sample view" note is tracked as a Phase 6 TODO.
- **Next:** Milestone 1.4 — Storage Safety & Limits.
