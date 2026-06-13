# WordWeaver Journal — build plan

WordWeaver is a **3D journaling hall**: the year = 365 day-platforms, each a giant
white backboard wall you write/blog on in 3D. A small calendar teleports you to
any day's wall. (Slice 1 — the world + teleport + seeded entries — is DONE and
lives in `src/wordweaver/WeaverJournal.js`.)

This doc organizes everything still to do.

---

## The key architectural rule (decide first)

**Every placed text stores an absolute world size.** Zoom spans from "read one note
at normal size" (zoomed all the way in) to "see the whole hall" (zoomed out). As
you zoom out, a wall scales up huge on screen and small notes shrink toward
invisible. That only works if each insert carries its own physical size:

- Big heading you want seen from far away → physically large 3D text.
- Tiny aside → physically small 3D text, only legible up close.

So the **size slider** and the **zoom range** share ONE world-size convention.
Pick it once (e.g. "1.0 size unit = comfortably readable at the closest zoom"),
and the scroll bars + framing all build on it.

---

## Phases & backlog

### Phase A — Navigation & framing (make the space usable)
- [ ] **A1. Minimize the calendar** to a thin handle on the left edge; tap to
      re-expand. Default open on entry.
- [ ] **A2. Movement controls** — on-screen pad (pan + zoom, works on touch) so you
      can roam between walls, in addition to teleport + drag-orbit.
- [ ] **A3. Zoom range** — clamp min/max distance: fully-in = one note at normal
      reading size; fully-out = the whole 4×3 hall. Defines the world-size scale.
- [ ] **A4. Per-wall scroll** — vertical **and** horizontal (sideways) scroll bars
      so you can read text that overflows a wall, scrolling from your current
      viewpoint when you're up close to it.

### Phase B — Chrome cleanup (declutter the tab)
- [ ] **B1. Remove the doubled small icons** + irrelevant calendar chrome on the
      journal tab (the 4 right-side icons, Today/Week/Month/Year, "June 2026"
      label, etc.).
- [ ] **B2. Keep the pencil pin, rewire it** to "edit text": after a day is
      selected, tapping the pencil opens the text box for that wall.

### Phase C — Authoring / painting (the heart)
- [ ] **C1. Text box** opens from the pencil (after a day is selected).
- [ ] **C2. Live paint** — typing renders 3D styled text onto the selected wall in
      real time ("your white wall becomes painted with the text design of your
      choice").
- [ ] **C3. Style dropdowns** — ⚠ DECISION PENDING (see below). Proposed:
      **Style** (3D look), **Color** (swatches + wheel), **Animation**, **Font**.
- [ ] **C4. Size slider** — user controls the input text size (feeds the
      world-size rule above).
- [ ] **C5. Per-insert absolute sizing** — every placed text records its own world
      size so it behaves correctly under zoom (the rule above).

### Phase D — Persistence
- [ ] **D1. Save placed text** per day (text, x/y on wall, style, color, size,
      animation) → write through the timeline model; reload on revisit.

---

## Dependencies
- **A3 + C5** are coupled — settle the world-size convention before C2/C4.
- **B2 → C1** (pencil rewire feeds the text box).
- **C3** blocked by the dropdown decision.
- **D1** after C2 (need real placed inserts to save).

## Suggested order (small → big, each visible before the next)
1. **B1 + B2** — clean the tab, repurpose the pencil. (fast, visible)
2. **C1 + C2** — text box → live paint with ONE default style. (the magic moment)
3. **A3 + C5** — lock the zoom range + per-insert world size.
4. **C4** — size slider.
5. **A4** — per-wall vertical + sideways scroll.
6. **A1** — minimize the calendar.
7. **A2** — movement pad.
8. **C3** — the full style dropdowns (after the decision).
9. **D1** — persistence.

## Scope rule (locked)
**Journaling ONLY.** WordWeaver does NOT pull in calendar events/notes. Empty
walls show a gentle prompt ("What mattered today?"); the user writes their own
remarks and can delete any with ✕. It's a *memory wall*, not a note dump.

## Open decisions
1. **Style dropdown taxonomy** (C3): which 3D "looks" (beveled / deep extrude /
   neon glow / chrome / flat / wireframe) and which controls (color, animation,
   weight, multiple fonts). Multiple fonts = extra typeface files to load.
2. **World-size convention** (A3/C5): the number that means "readable at closest
   zoom," and the slider's min/max.

## Future / stretch (NOT building yet)
- **Shared / social memory walls.** Sharing mode for certain days where friends
  log the day together inside the space — effectively a chat interface that looks
  like a memory wall, plus stats like "how much we've talked." Cool, but needs a
  real backend (auth, realtime sync, storage, moderation) and would scale large —
  parked deliberately.
- **WordWeaver as its own app.** The journaling concept is strong enough to stand
  alone; for now it lives inside Inkling and can be extracted later.
