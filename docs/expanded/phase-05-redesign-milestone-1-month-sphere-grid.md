# Phase 5 (REDESIGN) — Milestone 1: Single-Month Sphere Grid (viewable prototype)

**Goal:** Put the *new* WordWeaver Calendar on screen for the first time — ONE month rendered as a flat wall-calendar grid of spheres with real 3D depth. This is the seed the later milestones (year grid, LOD zoom, busy-atoms, legend, interaction) grow from. Keep it **static and non-interactive** — the point is to SEE the model, not to build everything.

> This is a **redesign**. It REPLACES the old year-ring (`WordWeaverScene.createYearLayout`) and the old `#three-canvas` 2D-wall "calendar" — see the canonical vision in [[inkling-3d-calendar-vision]]. Build a NEW layout module; do NOT bend the ring into a grid.

## Decisions already locked (from the vision)
- **"2D but 3D":** a flat board viewed face-on (NOT a curved ring/wall), built from real 3D spheres/text with depth.
- **Sphere tiers + colors:** ⚪ white = month (largest, on top) · 🟠 orange = day (date-labeled) · 🔵 blue = a note at a time (sparse — only times that *have* a note).
- **Layout = real wall calendar:** 7 weekday columns (Mon…Sun) in fixed vertical lanes; weeks are rows with a GAP between them; EMPTY leading/trailing cells when the month starts/ends mid-week. Every day aligns under its weekday column.
- **Naming:** this is the **WordWeaver Calendar** (icon label), replacing the old 3D system entirely.

## Grounding (current code)
- Canonical scene = **`src/wordweaver/WordWeaverScene.js`** (the 5.1 decision to promote it). Two parallel 3D stacks exist (`src/wordweaver/*` vs `src/wordweaver/timeline3d/*`) — build M1 in the canonical one; do not add to both.
- Three.js loads via import map → unpkg `three@0.164.0` (bare `"three"` specifiers). r164 has `InstancedMesh`, `TextGeometry` (examples/jsm).
- Retire-in-place: leave the ring code present but STOP calling it from the scene's layout entry; the new grid layout is what mounts. (Full deletion happens in a later milestone once the grid replaces it everywhere.)

## Data API (already built + tested — use these, do not re-query per cell)
- `getYearTopology(year)` → `{ monthCounts[12], dayCounts{ISO:count}, busiestMonthIndex, maxMonthCount, maxDayCount }` (timelineModel.js). Use `dayCounts` to know which days have notes + how many.
- `getEventsForDate(iso)` → time-sorted records (`.time` "HH:MM", `.text`, `.category`) for a day's blue spheres.
- Model-reads ONLY. No mutations, no bus emits in M1.

## Tasks (M1 — focused, not the full 11-field treatment)
1. **`WordWeaverMonthGrid.js`** (new): given `(year, monthIndex)`, compute the wall-calendar cell layout — 7 columns × N rows (N = weeks the month spans), Monday-start, with empty leading/trailing cells. Deterministic positions (NO `Math.random`). Return a list of `{ iso, col, row, x, y }` day-cells.
2. **White month sphere** at top-center of the grid, larger radius, with a 3D/sprite label of the month name ("January"). Reuse `Real3DText.js`/`Holographic3DText.js` or a CanvasTexture sprite — match whatever the scene already uses for labels.
3. **Orange day spheres** at each non-empty cell, labeled with the day number. Empty leading/trailing cells render nothing (or a very faint placeholder — your call, keep subtle).
4. **Blue note spheres**: for each day with `dayCounts[iso] > 0`, render a short vertical stack of blue spheres above/below the orange day (one per note from `getEventsForDate`), ordered by time (12:00am low → 11:59pm high). Cap the visible stack (e.g. ≤6) for M1 — full towers + LOD come later.
5. **Instancing from the start**: one shared SphereGeometry + per-tier shared materials via `InstancedMesh` (white/orange/blue as instances or 3 small instanced meshes). This is the perf seam the year grid depends on — do it now, not later.
6. **Mount in the canonical scene** as the active layout (replacing the ring call), framed by the camera so the single month fills view. Reuse existing scene init/lights/camera.
7. **Connecting lines (optional for M1, nice-to-have):** thin lines blue→orange (notes to their day). Skip orange→white/week links until the grid is proven.
8. **Non-interactive**: no raycasting/click/hover in M1. Atoms/legend/zoom are later milestones.

## Acceptance criteria
- Opening the WordWeaver Calendar shows ONE month as a face-on wall-calendar grid: white month sphere on top, orange day spheres in 7 aligned weekday columns with week-row gaps and correct empty leading/trailing cells, and blue note-spheres only on days that actually have notes (verify against seeded/starter data).
- Positions are deterministic (same every load). Spheres use instancing/shared geometry. Reads are model-only. No ring is visible.
- No console errors; existing 2D + Inkling surfaces unaffected (this is scoped to the WordWeaver 3D surface).

## Explicitly OUT of scope for M1 (later milestones)
- LOD / semantic zoom (year⇄month⇄week⇄day), full 24h towers, year grid of all 12 months, golden busy-month atoms, the legend HUD, interaction (hover/click/fly-to), onboarding/tutorial/showcase-wipe. M1 is just "one month, on screen, from real data."

## Build rules (per .cursor/rules/milestone-workflow.mdc)
- Build in the canonical `src/wordweaver/` scene; converge, don't duplicate into `timeline3d/`.
- Stage ONLY the files this milestone changes (tree is dirty). One milestone, then STOP and report for review.
