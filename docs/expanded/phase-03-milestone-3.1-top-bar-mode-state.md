# Phase 3 — Milestone 3.1: Top Bar & Mode State (Expanded)

**Goal:** A root `UIShell` that renders the always-visible top bar (§8.1), owns the `calendarMode` (2D/3D) and sub-view (Today/Week/Month/Year) state, persists and restores the last mode, and toggles between the two calendar containers by visibility only — never destroying either renderer.
**Spec alignment:** §2.1 (Layer 1 UI Shell — no business logic, dispatches actions downward), §1.3 (mode transition: 400ms ease-in-out, both systems stay in memory), §8.0/§8.1 (top bar layout, 56px desktop / 48px mobile), §8.2 (mobile bottom nav), §8.6 (shell z-index 100), §8.7 (responsive breakpoints), §3.4 (`inkling-calendar-mode` key), §13.2 (`modeChanged`, `navigateTo`, `storageWarning`/`storageFull` → UIShell).
**Sequencing:** First milestone of Phase 3 and the structural parent for 3.2 (Inkling shell) and 3.3 (Settings shell) — both mount inside `UIShell` and trigger from its top bar. Consumes the Phase 2 Alerts button (2.3.1), which slots into the top bar's Alerts position. WebGL detection (§8.1/§3.x) can force `calendarMode = "2d"` before this milestone's restore logic runs.

---

## 3.1.1 — Create `UIShell.js` as root layout component

- **Purpose:** Establish the single always-visible chrome that hosts the top bar, mounts both calendar containers, and anchors all panels/overlays.
- **Dependencies:** Phase 1 (timeline model), Phase 2 (event bus, Alerts button); none within 3.1.
- **Acceptance criteria:** `UIShell.js` renders a fixed top bar (z-index 100, §8.6) plus a content region holding the 2D and 3D containers; it contains no business logic and communicates only via the event bus (§2.1 Layer 1).
- **Implementation notes:** UIShell owns UI state (`calendarMode`, current sub-view, panel open/closed) but never writes event data — it dispatches actions downward and via the bus (§2.1). It is the documented subscriber for `storageWarning`/`storageFull` (§13.2) and will render those as a toast/error (full toast system is Phase 7; here just reserve the subscription point).
- **Edge cases:** First-ever load with no persisted mode (3.1.6); WebGL unavailable → mode forced to 2D before mount (§8.1, §1.5); container region must not collapse to zero height on short viewports.
- **UI/UX considerations:** Top bar always visible at top of viewport on both platforms (§8.1); content fills below it.
- **Data flow notes:** UIShell → bus → renderers/panels; never UIShell → renderer internals (§2.4).
- **Testing notes:** Mounts with top bar + both containers present; no direct timeline writes; z-index 100 on the bar.
- **Performance notes:** Single mount; children toggle visibility rather than remount (3.1.8).
- **Mobile vs desktop:** Renders the desktop or mobile top-bar layout per breakpoint (3.1.9, §8.1).
- **Integration points:** §2.1, §8.0, §8.6, §13.2.

## 3.1.2 — Implement top bar with app title/logo

- **Purpose:** Brand the shell and give the bar a stable left anchor.
- **Dependencies:** 3.1.1.
- **Acceptance criteria:** Top bar shows the "Inkling" wordmark on desktop and an icon-only logo on mobile, left-aligned, followed by a flexible spacer (§8.1); bar height is 56px desktop / 48px mobile (§8.1).
- **Implementation notes:** Layout order (desktop, left→right): logo, spacer, 2D/3D toggle, view nav, Alerts, Inkling, Settings (§8.1). The spacer pushes controls to the right. Mobile drops the wordmark to an icon and moves the view nav to the bottom bar (3.1.9, §8.2).
- **Edge cases:** Very narrow tablet widths — ensure logo never overlaps controls; long wordmark must not wrap the bar.
- **UI/UX considerations:** Logo legible on the glass bar; tapping the logo is a no-op (or future "home") — do not bind navigation here yet.
- **Data flow notes:** Presentation only.
- **Testing notes:** Wordmark on desktop, icon on mobile; correct heights per breakpoint.
- **Performance notes:** Static; negligible.
- **Mobile vs desktop:** This is a divergence point (wordmark vs icon, 56px vs 48px).
- **Integration points:** §8.1.

## 3.1.3 — Implement 2D/3D mode toggle button

- **Purpose:** Let the user switch between the spatial 3D scene and the DOM 2D calendar.
- **Dependencies:** 3.1.1, 3.1.5.
- **Acceptance criteria:** A segmented control with "3D" and "2D" segments sits in the top bar (§8.1); the active segment is filled/highlighted; activating a segment sets `calendarMode` and triggers the mode transition (§1.3) and `modeChanged` emit (3.1.7).
- **Implementation notes:** The toggle is the `ModeToggle` source of `modeChanged` in §13.2. It sets state and emits; it does not directly show/hide renderers — the transition (3.1.8) and subscribers handle that. Reflect the current `calendarMode` so the highlighted segment always matches actual state (including a WebGL-forced 2D).
- **Edge cases:** WebGL unavailable → 3D segment disabled/locked with a hint, mode pinned to 2D (§1.5); rapid toggling mid-transition (debounce / ignore until the 400ms transition settles, §1.3).
- **UI/UX considerations:** Clear active state; switching gives the §1.3 cross-fade so the change has an immediate visual response (§1.4).
- **Data flow notes:** ModeToggle → set `calendarMode` → `modeChanged` → WordWeaverScene, Calendar2D, InklingPanel (§13.2).
- **Testing notes:** Active segment matches state; click sets mode, emits `modeChanged`, runs transition; disabled when WebGL absent.
- **Performance notes:** Transition is a CSS opacity cross-fade; both systems already in memory (3.1.8).
- **Mobile vs desktop:** Present on both; on mobile it stays in the top bar (view nav moves to bottom, §8.2).
- **Integration points:** §8.1, §1.3, §13.2 (`modeChanged`).

## 3.1.4 — Implement view toggle: Today / Week / Month / Year

- **Purpose:** Change the sub-view level within the active calendar mode without changing the mode itself.
- **Dependencies:** 3.1.1; coordinates with 3.1.3 (mode is orthogonal to sub-view).
- **Acceptance criteria:** A view nav (Today · Week · Month · Year) emits the appropriate navigation so the active renderer changes sub-view; "Today" navigates to the current date at day level; switching sub-views does not change `calendarMode` (§6.x: 2D sub-views share one mode).
- **Implementation notes:** Tapping Week/Month/Year emits `navigateTo { date, level }` (§13.2) consumed by whichever renderer is active; "Today" emits `navigateTo { date: today, level: "day" }`. UIShell is a documented `navigateTo` source (§13.2). It does not reach into renderer state — both 3D and 2D subscribe and focus accordingly (§2.4).
- **Edge cases:** Pressing the already-active level (no-op or re-center on Today); "Today" when already on today's day view (re-focus, harmless); level changes while a panel is open (panel stays; underlying view changes).
- **UI/UX considerations:** Active level visually indicated; "Today" always returns the user to now in any mode (§8.1).
- **Data flow notes:** View nav → `navigateTo` → renderers focus the requested level (§12 navigation).
- **Testing notes:** Each tab emits the right `navigateTo`; mode is unchanged by sub-view switches; "Today" targets the current date.
- **Performance notes:** Single emit per tap.
- **Mobile vs desktop:** Desktop = text tabs in the top bar; mobile = icon tab bar at the bottom (§8.1/§8.2) — see 3.1.9.
- **Integration points:** §8.1, §8.2, §13.2 (`navigateTo`).

## 3.1.5 — Wire `calendarMode` state to `inkling-calendar-mode` storage key

- **Purpose:** Make the chosen mode durable across reloads.
- **Dependencies:** 3.1.1, 3.1.3.
- **Acceptance criteria:** On every mode change, `calendarMode` is persisted to the `inkling-calendar-mode` key as `"2d"`/`"3d"` (§3.4); the value is the single source of truth restored on load (3.1.6).
- **Implementation notes:** Mode persistence lives in `calendarMode.js` (§1.3 mode state), not in the event timeline store — it is a UI preference, distinct from `inkling-timeline-v1` (§3.4). Writing the mode must never touch the event store (§2.1: UI shell does not write event data). Keep the write small and synchronous on toggle.
- **Edge cases:** localStorage unavailable/blocked (private mode) → fall back to in-memory mode, do not crash; corrupt/unknown stored value → treat as default (3.1.6).
- **UI/UX considerations:** Invisible to the user; the payoff is the restore in 3.1.6.
- **Data flow notes:** ModeToggle → `calendarMode.js` set → localStorage `inkling-calendar-mode`.
- **Testing notes:** Toggling writes the correct key/value; event store untouched.
- **Performance notes:** Single tiny string write per toggle.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.4, §1.3.

## 3.1.6 — On load, restore last mode from storage

- **Purpose:** Reopen the app in the mode the user last used.
- **Dependencies:** 3.1.5.
- **Acceptance criteria:** On startup, `UIShell` reads `inkling-calendar-mode`; if `"2d"` or `"3d"`, that mode is active on first paint; if absent/invalid, the default applies; a WebGL-forced 2D (§1.5) overrides a stored `"3d"`.
- **Implementation notes:** Resolution order: (1) WebGL support check — if absent, force 2D and notify (§1.5/§8.1); (2) else stored value; (3) else default mode. Apply the resolved mode before the transition system runs so there is no visible 3D→2D flip on load. The mode toggle's highlighted segment (3.1.3) must reflect the resolved value.
- **Edge cases:** Stored `"3d"` but WebGL now unavailable (different device/browser) → silently fall back to 2D with the one-time notice; missing key on first run → default with no flash.
- **UI/UX considerations:** No mode flicker on load; the restore should feel like the app "remembered."
- **Data flow notes:** localStorage → `calendarMode.js` → UIShell initial render.
- **Testing notes:** Stored 2D/3D restores correctly; invalid/missing → default; WebGL-absent overrides stored 3D.
- **Performance notes:** One read at startup.
- **Mobile vs desktop:** Identical logic; mobile more likely to hit the WebGL/perf fallback.
- **Integration points:** §3.4, §1.5, §1.3.

## 3.1.7 — Emit `modeChanged` on mode switch

- **Purpose:** Let renderers and Inkling react to a mode change through the bus.
- **Dependencies:** 3.1.3, 2.1 (bus).
- **Acceptance criteria:** Switching mode emits `modeChanged { mode: "2d" | "3d" }` (§13.2); subscribers are WordWeaverScene, Calendar2D, and InklingPanel.
- **Implementation notes:** Emit after the state/persistence update so subscribers read a consistent `calendarMode`. WordWeaverScene/Calendar2D use it to start/stop their render loops or visibility; InklingPanel uses it for a "brief contextual acknowledgment" (§4.3). Emit once per genuine switch, not on every re-render or on restore-to-same-mode.
- **Edge cases:** Restoring the same mode on load should not spuriously emit `modeChanged`; mid-transition re-toggle (3.1.3 debounce) should not emit twice.
- **UI/UX considerations:** Enables Inkling's acknowledgment without the shell knowing about Inkling (§2.1 decoupling).
- **Data flow notes:** ModeToggle → `modeChanged` → renderers + InklingPanel (§13.2).
- **Testing notes:** One emit per real switch with correct payload; no emit on same-mode restore.
- **Performance notes:** Single emit.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 (`modeChanged`), §4.3.

## 3.1.8 — Ensure 2D and 3D containers mount once and toggle visibility only

- **Purpose:** Preserve renderer state and meet §1.3's "both systems remain instantiated" rule; protect the 2D view per §2.1 Layer 3 ("must never be deleted").
- **Dependencies:** 3.1.1, 3.1.3.
- **Acceptance criteria:** Both the 3D canvas container and the 2D calendar container mount once at startup and persist; switching mode changes only their visibility/opacity (the §1.3 400ms cross-fade), never unmounting or destroying either.
- **Implementation notes:** Use the §1.3 transition — fade the outgoing system out while fading the incoming in over 400ms ease-in-out; keep both in the DOM/memory. The inactive 3D scene may pause its render loop (perf, 3.1 note) but must not be torn down. This is the structural guarantee the rest of Phase 3+ relies on (renderers keep camera/scroll/scene state across toggles).
- **Edge cases:** Toggling during the 400ms transition (queue/ignore, 3.1.3); resize while one container is hidden (hidden container must still receive layout so it is correct when shown); memory pressure on mobile (pause, don't destroy).
- **UI/UX considerations:** Smooth cross-fade, no white flash, no re-initialization stutter on every switch.
- **Data flow notes:** Visibility/opacity only; no remount, no data reload (both read the same model, §2.3).
- **Testing notes:** Mode switch toggles visibility, both containers still in DOM after many switches; 3D scene state (camera) survives a round-trip.
- **Performance notes:** Avoid full re-init per switch (the whole point); pause inactive render loop to save GPU/battery.
- **Mobile vs desktop:** Especially important on mobile where re-init would be costly; pausing the inactive loop matters more there.
- **Integration points:** §1.3, §2.1 (Layer 3 protection), §2.3.

## 3.1.9 — Add responsive layout for mobile vs desktop

- **Purpose:** Make the shell correct and usable across the §8.7 breakpoints.
- **Dependencies:** 3.1.1–3.1.4.
- **Acceptance criteria:** Desktop (≥1024px): full top bar with text labels and the view-nav tabs inline. Tablet (640–1023px): top bar with icons. Mobile (<640px): compact 48px top bar (logo, Alerts, Inkling, Settings) with the view nav moved to a bottom navigation bar (§8.2); Inkling available as a FAB (§8.1).
- **Implementation notes:** Drive layout from the §8.7 breakpoints. On mobile the bottom nav (§8.2) carries Today/Week/Month/Year + Settings; the Inkling FAB floats above it on the right. The 2D/3D toggle stays in the top bar across breakpoints. Keep the Alerts button (2.3.1) in the top bar on all sizes (§8.1).
- **Edge cases:** Tablet/desktop boundary at 1024px (labels↔icons); landscape mobile (short height — bottom nav + top bar must not eat the content region); safe-area insets/notches for the bottom nav.
- **UI/UX considerations:** Thumb-reachable bottom nav on mobile; labels for clarity on desktop; consistent control placement so muscle memory holds.
- **Data flow notes:** Same controls emit the same bus events regardless of layout; only placement changes.
- **Testing notes:** Each breakpoint renders the specified arrangement; view nav relocates to bottom under 640px; FAB present on mobile.
- **Mobile vs desktop:** This task is the primary divergence point for the shell.
- **Integration points:** §8.1, §8.2, §8.7.

## 3.1.10 — Cross-check with spec §2.1, §8.0

- **Purpose:** Confirm the shell honors the layered architecture and the UI-shell spec before panels build on it.
- **Dependencies:** 3.1.1–3.1.9.
- **Acceptance criteria:** Verified against §2.1 (UIShell is Layer 1 — no business logic, no direct timeline writes, communicates via bus) and §8.0/§8.1/§8.2/§8.6/§8.7 (top-bar layout and heights, mobile bottom nav, z-index 100, breakpoints). Deviations fixed or documented.
- **Implementation notes:** Walk §8.1 control order on both layouts; confirm §1.3 mode transition (400ms, both systems retained, 3.1.8); confirm `calendarMode` persistence/restore (§3.4, 3.1.5–3.1.6); confirm `modeChanged`/`navigateTo` sources match §13.2. Re-assert §2.1: the only thing UIShell "writes" is the UI-preference mode key, never the event store.
- **Edge cases:** WebGL fallback path forces 2D and reflects it in the toggle (§1.5); same-mode restore does not emit `modeChanged`.
- **UI/UX considerations:** Confirm "every action has an immediate visual response" (§1.4) — toggles and nav give instant feedback.
- **Data flow notes:** Confirms the shell's bus sources/subscribers (`modeChanged`, `navigateTo`, `storageWarning`/`storageFull`) align with §13.2.
- **Testing notes:** Spec-to-implementation checklist passes for §2.1 and §8.0.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both layouts verified against §8.7.
- **Integration points:** §2.1, §8.0, §13.2.

---

### Milestone 3.1 — Definition of Done
- `UIShell` renders the always-visible top bar (§8.1, z-index 100) with logo, 2D/3D segmented toggle, Today/Week/Month/Year view nav, and the Alerts/Inkling/Settings buttons, in the correct order per breakpoint (§8.7), with the mobile bottom nav (§8.2).
- `calendarMode` is owned by the shell, persisted to `inkling-calendar-mode` (§3.4) and restored on load (with WebGL-forced 2D override), emits `modeChanged` on switch (§13.2), and toggles between the 2D and 3D containers by visibility only via the §1.3 400ms cross-fade — both renderers stay instantiated.
- The shell holds no business logic and never writes the event store (§2.1); view nav emits `navigateTo` (§13.2).
- Next: Milestone 3.2 — Inkling Panel Shell.
