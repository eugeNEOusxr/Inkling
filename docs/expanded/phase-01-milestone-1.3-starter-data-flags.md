# Phase 1 — Milestone 1.3: Starter Data & Flags (Expanded)

**Goal:** Reconcile the **already-existing** starter-data + first-run-flag logic in [`src/wordweaver/timelineModel.js`](../../src/wordweaver/timelineModel.js) toward §9 — realistic first-run events and a clean one-way removal once the user is real. Grounded against the live `starterNotes` / `getInitialNotes` / `markUserNotesStarted` / `buildStarterTimelineEntries`: the concept exists but with **too few, wrong-shaped** notes, the **wrong storage key**, and **implicit** (not explicit, un-emitted) removal.

**Spec alignment:** §9.0 line 928-961 (starter `starterNotes` = **8–12 `Event` objects** spread across current+adjacent months, varied type/category; load on empty `init()` + set `hasUserNotes=false`; on first **real** `createEvent` remove starter, set `inkling-has-user-notes="true"`, persist, **emit `starterDataCleared`**, re-render; §9.5 Inkling "sample view" note), §3.3 (init/seed), §3.4 line 299 (key `inkling-has-user-notes`), §13.2 (`starterDataCleared`, `initialized`).

**Sequencing:** Depends on 1.1 (CRUD + `bulkCreateEvents` + `createEvent`) and 1.2 (reads). Runs as part of `init()` (1.1.3). **Carry-forward:** the live first-run flag uses key **`"hasUserNotes"`**, not the spec's **`inkling-has-user-notes`** — fixing it needs a migration so existing users don't re-see starter data (1.3.2).

---

## Current implementation status (reconciliation)

A starter-data + first-run-flag system **already exists and is live**, but it diverges from §9 on **count/shape** (5 partial notes vs 8–12 `Event`s), uses the **wrong storage key**, seeds via a **per-entry build** instead of `bulkCreateEvents`, and removes starter data **implicitly** (by not re-seeding) rather than the spec's **explicit removal + `starterDataCleared` emit**.

- **`starterNotes` is 5 partial notes, not 8–12 `Event`s, all dated today.** §9.2 line 936 wants **8–12 `Event` objects** spread across current+adjacent months, varied in type (note/task/appointment/alert). Live `starterNotes` (timelineModel.js:154-160) is **5** items of `{ time, text, category }` only (no `type`/`title`/`body`/`startTime`/`priority`), and `buildStarterTimelineEntries` (:190-205) dates them **all to `todayIsoDate()`** (:191). 1.3.1 expands to 8–12, reshapes to the §3.1 `Event`, and spreads dates relative to now.
- **The first-run flag uses the WRONG key (`"hasUserNotes"`, not `inkling-has-user-notes`).** §3.4 line 299 names the key **`inkling-has-user-notes`**. Live uses `HAS_USER_NOTES_KEY = "hasUserNotes"` (timelineModel.js:152). This is a real spec-compliance bug — and changing it needs a **one-time migration** (read old key → write new) so existing users aren't treated as first-run (which would re-show starter data). 1.3.2 fixes the key + migrates.
- **Seeding is a per-entry build, not `bulkCreateEvents`.** §9.3 wants starter loaded into the model on empty `init()`. Live `loadTimeline()` (:262-274) seeds by calling `buildStarterTimelineEntries()` (per-entry `normalizeEntry`) when the store is empty and the flag is unset — there's no `bulkCreateEvents` (it doesn't exist yet, 1.1.8). 1.3.3 reconciles seeding to a single `bulkCreateEvents` call inside `init()` (one persist, one render).
- **Removal is implicit (not re-seeding), with no `starterDataCleared` emit.** §9.4 line 948-956 wants, on first real create: **remove** starter events from the store, set the flag, persist, **emit `starterDataCleared`**, re-render. Live never explicitly removes starter: `loadTimeline()` just **returns `[]`** when the flag is set and the store is empty (:270-272) — i.e. starter is "gone" because it's not re-seeded, not because it was removed and announced. There is **no `starterDataCleared` emit** anywhere. 1.3.5 implements explicit removal + the emit.
- **The flag is set by `addTimelineEntry`, but there's no `initialized` emit.** Live `addTimelineEntry` calls `markUserNotesStarted()` (:318) on every add — so the first real create does latch the flag ✓ (1.3.4 concept present), but starter entries are built **outside** `addTimelineEntry` (via `buildStarterTimelineEntries`) so they don't trip it ✓. However there is **no `init()`** and thus **no `initialized`/`timelineInitialized` emit** (1.3.7).
- **A starter marker already exists.** `buildStarterTimelineEntries` ids entries `starter-${i}` (:192) — a usable marker for **precise** removal (1.3.5), so removal need not guess from content.
- **What's already right (keep):** the **latch concept** exists (`markUserNotesStarted` :207, `getInitialNotes` :178 returns starter-until-real, `addTimelineEntry`→latch :318) ✓; **seed-on-empty** exists (:264-274) ✓; starter entries carry a stable **`starter-` id marker** ✓; `getInitialNotes` correctly returns starter only until the flag is set ✓ (the §9.3 gate, just on the wrong key).

---

## 1.3.1 — Expand `starterNotes` to 8–12 §3.1 `Event`s spread across months

- **Purpose:** Reconcile `starterNotes` to §9.2 — **8–12** `Event` objects, varied in type and category, with realistic titles/bodies, spread across the current and adjacent months — replacing the 5 partial `{time,text,category}` notes all dated today.
- **Dependencies:** 1.1.2 (`Event` shape), 1.1.5 (`_validate`); §9.2 line 934-940.
- **Acceptance criteria:** 8–12 entries; each is a full §3.1 `Event` (type/title/body/startTime/category/priority/...) that **passes `_validate`** (1.1.5); dates computed **relative to now** (e.g. "+2 days", "-3 days") so starter always looks current; spread across current + adjacent months; varied type (note/task/appointment/alert) and category (study/work/health/personal/creative); at least one high-priority item (so priority styling shows) and one with a near-future alert (not already-passed).
- **Implementation notes:** Replace the live `starterNotes` (timelineModel.js:154-160) array + `buildStarterTimelineEntries` (:190-205, which hard-dates to today, :191) with relative-offset date computation at seed time; keep the data **declarative** (no logic). Reuse `normalizeCategory` for category literals.
- **Edge cases:** Offsets near month/year boundaries must not produce invalid dates; alert times in the near future, not passed; relative dates computed at seed time, not import time (so a long-open tab still seeds "current" data).
- **UI/UX considerations:** Variety showcases category colors/icons (§21–22) and priority styling; a populated calendar feels alive on first run (§9.1).
- **Data flow notes:** Loaded via `bulkCreateEvents` (1.3.3 / 1.1.8) — one persist, one render.
- **Testing notes:** Every starter event passes `_validate`; count is 8–12; dates land in current/adjacent months relative to a fixed clock; one high-priority + one near-future alert present.
- **Performance notes:** Trivial; one bulk insert.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.2, 1.1.2 (shape), 1.1.5 (`_validate`), 1.3.3 (seed via bulk).
- **Status:** **Divergent (5 partial notes, all today).** Live `starterNotes` = 5 `{time,text,category}`, dated today. **Next:** 8–12 full `Event`s, varied type/category, spread relative to now, validate-passing.

## 1.3.2 — Fix the first-run flag key (`hasUserNotes` → `inkling-has-user-notes`) + migrate

- **Purpose:** Reconcile the first-run flag to §3.4 line 299 — key **`inkling-has-user-notes`** — replacing the live `"hasUserNotes"`, with a one-time migration so existing users aren't mistaken for first-run (which would wrongly re-show starter data).
- **Dependencies:** 1.1.4 (storage access); §3.4 line 299, §9.3, §10 (self-heal).
- **Acceptance criteria:** Reads/writes **`inkling-has-user-notes`**; a **one-time migration** copies the old `"hasUserNotes"` value (if present) to the new key on `init()` (and may clear the old); absent/`"false"` ⇒ false, `"true"` ⇒ true via a small getter `init()` uses; the flag is a **one-way latch** (once true, never flips back, even if the user deletes all events).
- **Implementation notes:** Live `HAS_USER_NOTES_KEY = "hasUserNotes"` (timelineModel.js:152) is referenced by `getInitialNotes` (:180), `markUserNotesStarted` (:209), `loadTimeline` (:270). Change the constant to `inkling-has-user-notes` and add the migration read of the old key in `init()` (1.1.3) before the seed check, so a returning user with `"hasUserNotes"="true"` is recognized and **not** re-seeded.
- **Edge cases:** Corrupt/unexpected value → treat as false **only if no real events exist** (else self-heal to true); real events present but flag missing → set true (self-heal); the migration must run **before** the first seed decision or a returning user briefly re-seeds.
- **UI/UX considerations:** Prevents starter data reappearing for returning users (the bug the wrong key would cause after this rename without migration).
- **Data flow notes:** Read at init (after migration), written on first real create (1.3.4).
- **Testing notes:** Old-key `"true"` migrates to new key and suppresses seeding; latch holds (true then attempted-false stays true); missing-flag-with-real-events self-heals to true.
- **Performance notes:** One key read (+ a one-time migration write) at boot.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.4, §9.3, 1.1.3 (migration runs in init), 1.3.3/1.3.4.
- **Status:** **Divergent (wrong key).** Live key is `"hasUserNotes"`; spec is `inkling-has-user-notes`. **Next:** rename to the spec key + one-time migration from the old key in `init()`; keep the one-way latch.

## 1.3.3 — Seed starter via `bulkCreateEvents` on empty `init()`

- **Purpose:** Reconcile first-run seeding to §9.3 — when `inkling-timeline-v1` is absent **and** the flag is false, load starter through **`bulkCreateEvents`** (one persist, one render) inside `init()` — replacing the live per-entry `buildStarterTimelineEntries`.
- **Dependencies:** 1.3.1, 1.3.2, 1.1.8 (`bulkCreateEvents`), 1.1.3 (`init`); §9.3 line 942-946.
- **Acceptance criteria:** When the timeline key is absent AND `inkling-has-user-notes` is false, `init()` seeds `starterNotes` via `bulkCreateEvents`; does **not** seed otherwise (store present, or flag true); starter events keep the `starter-` id marker (1.3.5 removal) and are flagged "seeding" so they don't trip the latch (1.3.4).
- **Implementation notes:** Live seeding is implicit in `loadTimeline()` (timelineModel.js:264-274) — move it into the explicit `init()` (1.1.3): after `loadFromStorage` returns empty + flag false, call `bulkCreateEvents(starterNotes)` with a `_seeding` flag set so `createEvent`'s latch (1.3.4) is bypassed. Preserve the `starter-${i}` id marker (:192).
- **Edge cases:** Store present but empty array → do **not** seed (respect a user who deleted everything — only seed when the key is **absent**); seeding must set `_seeding` so 1.3.4 doesn't latch; the day-node federation (saved-month data) is separate — don't double-seed it.
- **UI/UX considerations:** New users immediately see a living calendar (§9.1), rendered once (not 8–12 times).
- **Data flow notes:** Single `bulkCreateEvents` → single persist → single batched emit.
- **Testing notes:** Absent key + false flag → seeds; present key → no seed; flag true → no seed; one persist.
- **Performance notes:** One bulk write (vs the live per-entry path).
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.3, 1.1.8 (bulk), 1.1.3 (init), 1.3.1 (data), 1.3.5 (marker).
- **Status:** **Partial (seeds, but per-entry + implicit).** Live seeds on empty via `buildStarterTimelineEntries`, not `bulkCreateEvents`, inside `loadTimeline`. **Next:** seed via `bulkCreateEvents` in `init()`, only when the key is absent, with a `_seeding` flag + `starter-` marker.

## 1.3.4 — First real `createEvent` sets the latch (exempt the starter seed)

- **Purpose:** Reconcile the latch trigger to §9.4 line 950 — the first **user** `createEvent` (not the starter seed) sets `inkling-has-user-notes="true"` — building on the live `addTimelineEntry`→`markUserNotesStarted` behavior.
- **Dependencies:** 1.1.5 (`createEvent`), 1.3.2 (the flag), 1.3.3 (the `_seeding` exemption); §9.4 line 950-953.
- **Acceptance criteria:** The first `createEvent` originating from the **user** sets the flag true; the **starter seed** (1.3.3, `_seeding`) does **not** set it; a user-initiated **import** (bulk) counts as real too (only the starter seed is exempt); the flag set happens in the same persist as the new event.
- **Implementation notes:** Live `addTimelineEntry` already calls `markUserNotesStarted()` (timelineModel.js:318) — reconcile this into `createEvent` (1.1.5) and gate it on `!_seeding` so the starter bulk (1.3.3) doesn't latch. Keep `saveNoteToTimeline` (the note UI path, :343) routing through `createEvent` so it latches.
- **Edge cases:** User's first action is an import (bulk) → treat as real (latch); only the starter seed is exempt; setting the flag must precede/accompany the removal (1.3.5) in one persist.
- **UI/UX considerations:** This is the moment starter data disappears (1.3.5) so the user sees only their event.
- **Data flow notes:** Triggers 1.3.5 removal in the same flow.
- **Testing notes:** Starter seed does not latch; first user create does; user import latches.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.4, 1.1.5 (createEvent), 1.3.2/1.3.3/1.3.5.
- **Status:** **Partial (latches, but no seed exemption boundary yet).** Live `addTimelineEntry`→`markUserNotesStarted` latches on add; starter built outside it so it doesn't latch — but no explicit `_seeding` gate. **Next:** latch in `createEvent` gated on `!_seeding`; user-import counts as real.

## 1.3.5 — Explicit starter removal + `starterDataCleared` emit on first real create

- **Purpose:** Reconcile starter removal to §9.4 line 952-956 — when the latch flips, **explicitly remove** the `starter-`marked events, persist once, and **emit `starterDataCleared`** — replacing the live **implicit** removal (just not re-seeding) which never announces the change.
- **Dependencies:** 1.3.4 (latch trigger), 1.1.7 (removal mechanics), 1.1.9 (emit); §9.4 line 952-956, §13.2 (`starterDataCleared`).
- **Acceptance criteria:** When the flag flips true on the first real create, **all `starter-`marked events are removed** from the store, the cleaned array is persisted **once** (together with the user's new event — no flash of "starter + new"), and **`starterDataCleared` is emitted**; the user's new event remains; removal is by the `starter-` **marker** (timelineModel.js:192), not by guessing from content.
- **Implementation notes:** Live has **no explicit removal and no emit** — starter just isn't re-seeded by `loadTimeline` when the flag is set (:270). Add explicit removal in the first-real-create flow: filter out `id.startsWith("starter-")`, persist the cleaned array + new event in one write, emit `starterDataCleared` on the canonical bus (1.1.9). Do the removal + insert in **one persist**.
- **Edge cases:** User edited a starter event before creating their own — decide policy (simplest: starter is removed regardless; if editing adopted it, treat edited starter as real and keep — pick one, document); deleting all real events later must **not** bring starter back (the latch holds, 1.3.2).
- **UI/UX considerations:** Clean transition — no half-second where both sample and real events show (§9.4).
- **Data flow notes:** `starterDataCleared` → 2D/3D re-render showing only real data.
- **Testing notes:** After first real create, zero `starter-`marked events remain; the new event is present; `starterDataCleared` emits once.
- **Performance notes:** Single filter + single persist.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9.4, §13.2 `starterDataCleared`, 1.1.7/1.1.9, the `starter-` marker.
- **Status:** **Implicit / un-emitted.** Live "removes" starter by not re-seeding when the flag is set; no explicit removal, no `starterDataCleared`. **Next:** explicit marker-based removal + single persist + `starterDataCleared` emit.

## 1.3.6 — Tests for the starter lifecycle (incl. the key migration)

- **Purpose:** Lock the seed→use→clear flow — including the **wrong-key migration** (1.3.2) — so regressions can't reintroduce sample data or mis-detect returning users.
- **Dependencies:** 1.3.1–1.3.5; §28.
- **Acceptance criteria:** Tests cover: fresh install seeds starter (8–12, validate-passing); second launch (store present) does not reseed; **old-key→new-key migration** suppresses reseeding for a returning user; first user create clears starter + sets the latch + emits `starterDataCleared`; deleting all real events does not bring starter back; with a fake clock + mocked storage, reset between cases.
- **Implementation notes:** The **migration test is the highest-value addition** vs the old greenfield spec — it guards returning users through the key rename. Use a fake clock for the relative starter dates (1.3.1).
- **Edge cases:** Corrupt flag; edited starter; import-first; old-key present/new-key absent.
- **UI/UX considerations:** None directly.
- **Data flow notes:** Asserts `starterDataCleared` fires once.
- **Testing notes:** This is the lifecycle testing task.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Headless.
- **Integration points:** §28, 1.3.2 (migration under test).
- **Status:** **Missing.** No starter-lifecycle tests. **Next:** seed/reseed/migration/clear/latch tests with fake clock + mocked storage.

## 1.3.7 — Emit `initialized` after init/seed (MISSING)

- **Purpose:** Add the §3.3/§13.2 `initialized` emit the live model lacks — signal that the model is ready (after load or seed) so views and the Scheduler can start — replacing the live lazy no-signal boot.
- **Dependencies:** 1.1.9 (emit wiring), 1.1.3 (`init`), 1.3.3 (seed); §13.2 (`initialized`), §7.2.
- **Acceptance criteria:** After `init()` completes (load **or** seed), `initialized` is emitted **exactly once** with `{ eventCount }`, after persistence is settled; fires once even though `init()` is idempotent (1.1.3); both the seed path and the load path end in exactly one emit.
- **Implementation notes:** Live has no init and no such emit. Emit at the very end of `init()` (1.1.3), after any starter seed (1.3.3), on the canonical bus (1.1.9). (The roadmap calls this `timelineInitialized`; §13.2 uses `initialized` — Phase 2 reconciled to `initialized`; use `initialized`.)
- **Edge cases:** Seed path vs load path both end in exactly one emit; double-`init()` (guarded) still emits once.
- **UI/UX considerations:** Views subscribe and render on this, avoiding a blank first frame (the live lazy model has no such go-signal).
- **Data flow notes:** Kicks off the Scheduler's initial alert scan (§7.2) and first renders.
- **Testing notes:** Exactly one emit per init; payload count matches the loaded/seeded count.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 `initialized`, §7.2, 1.1.3/1.1.9, 1.3.3.
- **Status:** **Missing.** No `init()`, no `initialized` emit. **Next:** emit `initialized { eventCount }` once at the end of `init()` (after seed), on the canonical bus.

## 1.3.8 — Document the starter/flag behavior in `timelineModel.js`

- **Purpose:** Make the seed/latch/removal/migration logic obvious to future contributors (and Cursor) so no one "fixes" it wrongly (e.g. reverting the key migration or re-seeding for returning users).
- **Dependencies:** 1.3.1–1.3.7; §9, §10 line 967.
- **Acceptance criteria:** A comment block in `timelineModel.js` explains: the one-way latch, the **new** key + the migration from the old `"hasUserNotes"` key, the seed condition (key absent + flag false), the marker-based removal trigger, the `starterDataCleared`/`initialized` emits, and why starter never returns.
- **Implementation notes:** Co-locate with the logic, not a separate drifting doc; explicitly note the key migration so it isn't "cleaned up" later.
- **Edge cases:** Document the "edited starter" and "import-first" decisions (1.3.4/1.3.5).
- **UI/UX considerations:** None.
- **Data flow notes:** Note which emits fire and when.
- **Testing notes:** N/A.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9, §10, the key migration (1.3.2).
- **Status:** **Partial.** Live has light JSDoc but nothing on the latch/key/removal rationale. **Next:** a co-located comment block covering latch + key migration + seed/removal/emit rules.

## 1.3.9 — Guard starter data out of future export/backup

- **Purpose:** Ensure that when export/import lands (§8), sample data never ends up in a user's backup — relying on the explicit removal (1.3.5) plus a guard.
- **Dependencies:** 1.3.5; §8 (future export).
- **Acceptance criteria:** Because starter is removed on first real create (1.3.5), a real user's store has no `starter-`marked events; a TODO/guard at the (future) export site filters `starter-`marked events if any remain; documented.
- **Implementation notes:** Keep the `starter-` marker available to a future exporter; add a TODO at the future export site referencing this rule.
- **Edge cases:** A user who never created a real event exports while starter still shows — prefer stripping starter on export (with a note) over blocking.
- **UI/UX considerations:** Prevents "why are sample events in my backup?" confusion.
- **Data flow notes:** Forward-looking; ties to §8 / Phase 10.
- **Testing notes:** When export exists, exporting with only starter yields a sample-free file.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §8 (future), the `starter-` marker.
- **Status:** **Future (guard only).** No export yet; the marker enables a future filter. **Next:** leave a marker-aware TODO at the future export seam.

## 1.3.10 — Cross-check against §9 (incl. §9.5 Inkling sample-view note → Phase 6)

- **Purpose:** Final cross-check that the reconciled implementation matches §9 line-by-line, and track the cross-module §9.5 obligation for Phase 6.
- **Dependencies:** 1.3.1–1.3.9; §9, §10 line 967.
- **Acceptance criteria:** Each statement in §9.1–9.5 maps to implemented behavior; deviations are fixed or documented; §9.5 (Inkling prefixes summaries with "Here's a sample view — add your first event to get started." when only starter data is present) is captured as a **Phase-6 TODO** (it lives in `AIBrain.js`, not this model).
- **Implementation notes:** Walk §9 against the code; §9.5 is an Inkling/AI obligation — leave a tracked TODO referencing Phase 6 (AI integration), not implemented here.
- **Edge cases:** §9.5 is Phase-6; don't implement in Phase 1 — just track it.
- **UI/UX considerations:** Matches the intended new-user experience.
- **Data flow notes:** Confirms emits + removal match spec.
- **Testing notes:** Spec-to-test traceability checklist passes.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical.
- **Integration points:** §9 in full, §9.5 (Phase 6 `AIBrain.js`).
- **Status:** **Open (cross-check + §9.5 TODO).** **Next:** line-by-line §9 check; track §9.5 as a Phase-6 Inkling TODO.

---

### Milestone 1.3 — Definition of Done
- Fresh installs see 8–12 realistic, current-dated starter `Event`s; returning users never do (key migrated from `hasUserNotes` → `inkling-has-user-notes`).
- The latch is one-way; first real create explicitly removes `starter-`marked events in a single persist and emits `starterDataCleared`; `initialized` fires once.
- Lifecycle (incl. migration) is tested and documented; §9.5 Inkling note tracked for Phase 6.
- **Next:** Milestone 1.4 — Storage Safety & Limits.
