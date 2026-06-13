# WordWeaver — Notes Constellation (vision)

**Name decided 2026-06-12:** this 3D notes-landscape gets its own icon called **WordWeaver**
(icon: 🕸️ / 🧶). The name was freed when the 3D month view became "Calendar" — it fits here:
notes woven together by colored threads, connections made by Inkling.

**Bottom nav becomes 5 tabs:** Calendar · Schedule · **WordWeaver** (new) · Inkling · Alerts.

WordWeaver is NOT the calendar (that's the "Calendar" tab) and NOT the old "game world" idea.
It is a **3D notes constellation**: a living web of every note you've written, where days and
months are nodes and your notes hang off them, all interwoven by Inkling into meaningful
connections.

## Core idea
- **Input → 3D output.** Text notes become 3D nodes (spheres). A "shitload of spheres" — one per
  note — arranged in space.
- **Days & months are connector nodes.** Each note links to its day; days link to their month.
  Lines interweave note ↔ day ↔ month so the whole year reads as one connected structure.
- **Inkling weaves the connections.** Beyond the literal day/month links, Inkling draws
  *semantic* connections between related notes (same topic, recurring themes, follow-ups) — the
  AI is what makes the web meaningful, not just a calendar grid.
- **Color = category.** Notes carry their coordinated category color (health=red, study=green,
  work=yellow, personal=blue, creative=purple, errands=orange) on the nodes and the lines.

## Category filter → full-panel, full-year
- The user picks a category to view — **Health, Fitness, Work, Study, …** (a notes-array facet).
- Selecting one **filters the constellation to that category** and shows those notes
  **full-panel, across the entire year** — every health note for the year, connected, in one view.
- Switching categories re-weaves the view live.

## How it relates to existing pieces
- Reuses the note data (`timelineModel` events + `classifyText`/`CategoryColors`).
- Reuses the 3D sphere + colored-connector work already in `WordWeaverMonthGrid` (per-note color,
  note→next-note lines) — generalize it from one month to the whole-year graph.
- Inkling (see [INKLING_AI_TODO.md](INKLING_AI_TODO.md)) supplies the semantic linking.

## Chosen layout: Helix timeline + LOD blooming (decided 2026-06-12)

**Skeleton (fixed, never dissolves):**
- Vertical time axis. **Jan at bottom → Dec at top.** Each **month = one coil turn** of a helix,
  labeled "2026 · January" (label faces camera, fades in as you approach).
- **Days** sit as nodes spaced around each coil turn (in date order). A day with notes shows a
  **bead sized by note count** when zoomed out.
- **LOD bloom:** fly close to a day and the bead blooms into its individual **note atoms**
  branching outward from the day node. Zoomed out, individual notes stay collapsed → keeps the
  "shitload of spheres" legible.

**Color threads (the interweave):**
- One **continuous colored ribbon per category** (health=red, study=green, work=yellow,
  personal=blue, creative=purple, errands=orange) spirals the whole helix, passing through every
  note of that color in date order. Six interwoven strands = the year's connections.
- **Inkling** adds *semantic* cross-links (related notes) as extra edges on top of the date order.

**Traversal:**
- Orbit the coil; fly **up** it month-by-month on a guided dolly path; or grab a color strand and
  the camera follows it through the year.

**Color isolation / filter:**
- Tap a category chip → that color's strand + atoms light up, others dim to ghosts. This IS the
  "trace by color for the year" + the full-panel/full-year category facet.

**Motion ("alive atoms") without losing structure:**
- Every node anchored at its computed helix slot; animate only a small orbital wobble + glow
  pulse around the anchor. Structure holds; atoms breathe.

**Density discipline:**
- Enforce a minimum gap between nodes (same collision lesson as the month grid); overflow goes
  into the LOD bloom, never crammed.

## Build sketch (todo)
- [ ] Data layer: gather all notes for the year, grouped by day/month, with category + color.
- [ ] 3D graph layout: position month nodes, day nodes, note nodes; force-directed or radial.
- [ ] Interweaving lines: note→day→month (structural) + Inkling semantic links (cross-note).
- [ ] Category facet UI: chips (Health/Fitness/Work/Study/…) → filter + full-year full-panel view.
- [ ] Inkling pass: ask the model to cluster/relate notes and emit connection edges.
- [ ] Interaction: tap a node to read/edit its note; tap a category to focus.
- [ ] Performance: instanced spheres + batched lines for "a shitload of spheres."
- [ ] (Later, optional) the old "game world" idea is separate — not this.
