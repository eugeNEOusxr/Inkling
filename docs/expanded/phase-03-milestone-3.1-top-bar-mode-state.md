# Phase 3 — Milestone 3.1: Shell, Nav & Mode State (Expanded)

**Goal:** Reconcile the **already-existing** app shell — a composition of [`InklingBottomNav`](../../src/calendar/ui/InklingBottomNav.js), [`NavigationBar`](../../src/calendar/ui/NavigationBar.js) (top chrome), the os-shell [`AppLauncher`](../../src/calendar/ui/AppLauncher.js) / [`WindowManager`](../../src/calendar/ui/WindowManager.js) / [`MinimizeBar`](../../src/calendar/ui/MinimizeBar.js), the panels, and the [`calendarMode`](../../src/wordweaver/calendarMode.js) store — toward §8 **and toward the user's single-panel, mobile-first navigation model** (each bottom-nav icon opens its own full-screen scrollable tab; only one open at a time; re-tap to close/minimize). Grounded against the live code — reconcile **built / gap / next-step**, not greenfield. **The greenfield "create `UIShell.js`" is wrong: the shell already exists as a composition with a `WindowManager` that already enforces "one surface active at a time."**

> ⚠️ **User nav model drives this milestone (from 2026-06-04 baseline review, see UI-change-requests).** Mobile-first. **Each bottom-nav icon (Calendar / Writer / WordWeaver / Alerts / Inkling) = its own full-screen, scrollable tab; only ONE open at a time; tapping the active icon again closes/minimizes it** (blank, or back to Inkling). Everything is its own scrollable screen so nothing is cut off on x or y on a phone. This **likely amends §8** (a desktop-top-bar model) toward the single-panel/mobile-first model — 3.1.1 is the decision + §8 amendment.

**Spec alignment:** §2.1 (Layer 1 UI Shell — no business logic, communicates via bus), §1.3 (2D/3D mode transition 400ms, both renderers stay instantiated), §8.0/§8.1 (top bar 56px/48px), §8.2 (mobile bottom nav), §8.6 (shell z-index), §8.7 (responsive), §3.4 (`inkling-calendar-mode` key), §13.2 (`modeChanged`, `navigateTo`, `storageWarning`/`storageFull`). **Plus user-directed amendments to §8** (single-panel/mobile-first nav, bell-icon Alerts, no 3D-behind-2D bleed, no wasted top gap).

**Sequencing:** First milestone of Phase 3 and the structural parent for 3.2 (Inkling shell) and 3.3 (Settings shell). Consumes the Phase 2 Alerts button (2.3) — which slots into the nav (and needs a **bell icon**, currently text-only). **Recurring threads:** the user's nav vision is the lens; the live os-shell (`WindowManager`/`AppLauncher`/`MinimizeBar`) is the partly-built foundation; and §8 needs amending to match (a spec-change milestone like 1.1.1/2.2.1).

---

## Current implementation status (reconciliation)

A **full shell already exists** — but as a **composition of many modules**, not a single `UIShell`, and its nav model is **partly** the user's single-panel vision (the bones are there: one-surface-active, toggle-detect, minimize) and partly not (wasted top gap, 3D bleeds behind 2D, Alerts is text-not-bell, mobile cut-off). This is a reconcile + complete + amend-§8 milestone, not greenfield.

- **No `UIShell.js` — the shell is a live composition.** The §8 chrome is assembled from `InklingBottomNav` (the Calendar/Writer/WordWeaver/Alerts/Inkling bottom bar), `NavigationBar` (top chrome: Today/Week/Month/Alerts), the os-shell `AppLauncher`/`WindowManager`/`MinimizeBar` (style.css:3030 "OS shell layer for AppLauncher + WindowManager"), the panels (`InklingPanel`, etc.), and the `calendarMode` store — bootstrapped by `CalendarApp`/`MainUI`/`App`. 3.1.1 decides whether to introduce a thin `UIShell` orchestrator or formalize the existing composition as "the shell" (+ amend §8).
- **The single-panel "one at a time" model is PARTLY BUILT.** `WindowManager` already has a method to "**hide all shell windows and in-page panels so only one surface is active**" (WindowManager.js:35) — exactly the user's "only one open at a time." `InklingBottomNav` already **detects re-tap-to-toggle** (`const toggle = this._activeTab === tab`, InklingBottomNav.js:18) and emits `onTab(tab, { toggle })` — the hook for "tap active icon → close/minimize." `AppLauncher.openPanel` + `inkling:open-panel`/`inkling:close-all-panels` events exist. So the user's model is a **completion**, not a build: wire `toggle` → minimize/close, route each bottom-nav tab through the one-surface-active path, default to blank/Inkling on close. 3.1.8 owns this.
- **Wasted ~1/8 top gap in WordWeaver (user complaint).** In 3D mode there's dead space between the top bar and the WordWeaver content — the viewport doesn't extend upward. 3.1.2 reconciles the layout to fill it (no dead chrome space).
- **The 3D map bleeds behind the 2D calendar (user complaint).** When the Calendar/2D surface is up, the 3D scene shows through dimmed behind it (the screenshots show the octagonal wall behind the month grid). Per the single-panel model, only one surface should be visible — the 3D must be **hidden** (not just dimmed) when a 2D/Calendar surface is active. This intersects the §1.3 "both renderers stay instantiated" rule: keep 3D **in memory** but **fully hidden** (visibility, not destruction) when not the active surface. 3.1.3/3.1.8.
- **Alerts is text-only — needs a bell icon (user).** `NavigationBar` renders Alerts as a label (NavigationBar.js:59 `{ id: "alerts", label: "Alerts" }`) next to the settings gear, with **no icon**. The user wants the standard **bell** notification icon. 3.1.2 (closes the 2.3.1 badge work with the right icon).
- **The Calendar vs WordWeaver vs 2D-Mode muddle (user).** WordWeaver (3D) also carries a 2D toggle ("2D Mode" button); the Calendar bottom-nav tab also shows calendar; users in WordWeaver may not see the 2D toggle. These are "only view modes." The nav model must define the relationship cleanly: the user's lean is **Calendar tab → the small calendar + clock-insert**, and **WordWeaver tab → the 3D view (with its 2D toggle as a view-mode within it)**. 3.1.1/3.1.4 reconcile the view-mode-vs-app-tab distinction.
- **Mode store exists (`calendarMode.js`).** `getCalendarMode`/`setCalendarMode` + the `inkling-calendar-mode` key likely exist (the WordWeaverScene `_tick` already gates render on `getCalendarMode()==="3d"`, the 5.1 finding). 3.1.5/3.1.6 reconcile persistence/restore + WebGL fallback; 3.1.7 the `modeChanged` emit on the canonical bus.
- **Mobile-first is the user's priority and the current gap.** "People are on phones more than computers." Everything must be **its own screen with a scroll bar**; content currently **gets cut off on x and y** on mobile. The §8 spec is desktop-top-bar-centric; the user wants mobile-primary single-panel. 3.1.9 reconciles the responsive shell to mobile-first (bottom nav primary, each tab a full scrollable screen).
- **What's already right (keep):** the **bottom nav exists** with toggle-detect + active-state + body-class hooks ✓ (InklingBottomNav); the **`WindowManager` one-surface-active** primitive ✓ (the core of the user's model); `AppLauncher`/`MinimizeBar`/`inkling:open-panel`/`close-all-panels` ✓; top-chrome `NavigationBar` with Today/Week/Month + the 2.3 Alerts badge wired to the **canonical bus** ✓ (NavigationBar.js:112-114); the `calendarMode` store + mode-gated 3D render ✓; the 2D and 3D renderers are **both instantiated** (the §1.3 invariant) ✓.

---

## 3.1.1 — DECISION: shell architecture + adopt the single-panel/mobile-first nav model (amend §8)

- **Purpose:** Resolve the foundational fork before reconciling the pieces — (A) introduce a thin `UIShell` orchestrator over the existing parts, or (B) formalize the **existing composition** (`InklingBottomNav` + `NavigationBar` + `WindowManager`/`AppLauncher`/`MinimizeBar` + panels + `calendarMode`) as "the shell" — and, critically, **adopt the user's single-panel/mobile-first nav model and amend §8 to match** (currently a desktop-top-bar layout). This is the lens for all of 3.1.
- **Dependencies:** Phase 1/2 (model, bus, Alerts); the live shell modules; §2.1, §8.0-§8.7, the user nav model (UI-change-requests).
- **Acceptance criteria:** A documented decision covering: **(1) shell structure** — thin `UIShell` orchestrator (A) vs formalize-the-composition (B, recommended — the parts already work and `WindowManager` already does one-surface-active); **(2) the nav model** — adopt **single-panel, each bottom-nav icon = its own full-screen scrollable tab, one open at a time, re-tap-to-close/minimize (default blank or Inkling)**, built on `WindowManager`'s one-surface-active + `InklingBottomNav`'s toggle-detect; **(3) §8 amendment** — amend §8.1/§8.2/§8.7 from the desktop-top-bar model to **mobile-first single-panel** (bottom nav primary; top chrome secondary/contextual), same way §28/§7 were amended; **(4) view-mode vs app-tab** — define Calendar (small-calendar + clock-insert) vs WordWeaver (3D, with 2D toggle as an internal view mode) vs the 2D/3D toggle, removing the muddle.
- **Implementation notes:** Recommend **(B) + adopt the user model + amend §8**: keep the os-shell composition, complete the single-panel behavior (3.1.8) on `WindowManager`/`InklingBottomNav`, and rewrite the §8 spec sections to the mobile-first single-panel model. Document the tab→surface map: Calendar→2D calendar surface (small cal + clock-insert), Writer→writer surface, WordWeaver→3D surface (2D toggle internal), Alerts→alerts dropdown/panel, Inkling→inkling panel. Don't build a parallel `UIShell` if the composition already does the job.
- **Edge cases:** §8 amendment must stay consistent with §1.3 (both renderers instantiated — single-panel hides, never destroys); the WebGL-fallback-to-2D path (§1.5) still applies; the existing AppLauncher/desktop affordances shouldn't be ripped out if some desktop users want multi-window — but the **default/mobile** is single-panel (document any desktop divergence).
- **UI/UX considerations:** A single clear surface at a time on a phone (the user's core ask) vs the current overlapping panels/bleed.
- **Data flow notes:** Bottom nav tab → (one-surface-active) WindowManager → show the tab's surface, hide others; re-tap → minimize/close.
- **Testing notes:** N/A (decision) — list the regression surface (every panel/surface the WindowManager governs) so 3.1.8 verifies one-at-a-time holds.
- **Performance notes:** Single-panel = only one heavy surface rendered at a time (3D paused when not active) — a mobile win.
- **Mobile vs desktop:** The model is mobile-first; desktop may allow richer chrome but defaults to the same single-panel flow.
- **Integration points:** §2.1, §8 (amend), §1.3, the live os-shell modules, UI-change-requests, 3.1.8 (completes the model).
- **Status:** **Fork + §8 amendment.** Live shell = composition with `WindowManager` one-surface-active (partly the user's model); §8 = desktop-top-bar. **Next:** formalize the composition (B), adopt the single-panel/mobile-first model, amend §8, define the tab→surface map.

## 3.1.2 — Reconcile the top bar: fill the wasted top gap, bell-icon Alerts, control order

- **Purpose:** Reconcile the top chrome to §8.1 **and** the user's complaints — eliminate the ~1/8-screen **dead gap** above the WordWeaver content, give **Alerts a bell icon** (it's text-only today), and confirm the control order — building on `NavigationBar`.
- **Dependencies:** 3.1.1, 2.3 (Alerts badge); §8.1, §8.6, user items.
- **Acceptance criteria:** The 3D/WordWeaver content region **extends up to the top bar** with no wasted gap (the viewport fills the available height); **Alerts shows a bell icon** (standard notification glyph) with the 24h badge (2.3.1) — replacing the text-only label (NavigationBar.js:59); the top bar keeps height per §8.1 (or the amended single-panel layout); control order is documented for the active layout.
- **Implementation notes:** Find the layout rule leaving the ~1/8 gap (likely a fixed top offset / margin on the WordWeaver canvas mount or a mis-sized flex region) and make the content fill to the bar. Swap the Alerts label for a bell icon (reuse the app's icon set) + keep the `[data-inkling-alerts-badge]` 24h badge. Keep the Alerts button wired to the canonical bus (NavigationBar.js:112-114 ✓).
- **Edge cases:** The gap fix must not overlap the top bar or clip the 3D scene; the bell icon must keep the badge legible; mobile vs desktop bar heights (§8.1 / amended).
- **UI/UX considerations:** No wasted space (user); bell = instantly-recognizable notifications (user).
- **Data flow notes:** Presentation; Alerts button still emits/open via the existing path.
- **Testing notes:** No dead gap above the 3D content; Alerts renders a bell + badge; control order matches the documented layout.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Bar layout differs per the amended §8 (3.1.9).
- **Integration points:** §8.1, 2.3.1 (badge), `NavigationBar`, user items (gap, bell).
- **Status:** **Divergent (wasted gap; text-only Alerts).** Live leaves a top gap in 3D and renders Alerts as a label. **Next:** fill the gap (content to the bar), bell icon + 24h badge for Alerts, document control order.

## 3.1.3 — 2D/3D mode toggle + kill the 3D-behind-2D bleed

- **Purpose:** Reconcile the live "2D Mode" toggle + `calendarMode` to §1.3/§13.2, and **fix the user complaint that the 3D map bleeds behind the 2D calendar** — per the single-panel model, the inactive renderer is **fully hidden** (not dimmed-through), while staying instantiated (§1.3).
- **Dependencies:** 3.1.1 (single-panel model), 3.1.5 (mode store), 3.1.8 (containers); §1.3, §1.5, §13.2 (`modeChanged`).
- **Acceptance criteria:** The 2D/3D toggle sets `calendarMode` and runs the §1.3 transition; **when 2D/Calendar is active, the 3D scene is fully hidden** (display/visibility off + render loop paused), not visible-dimmed behind it (the screenshot bleed is gone); both renderers stay in memory (§1.3); the active segment reflects actual `calendarMode` (incl. WebGL-forced 2D, §1.5); reconcile the "2D Mode toggle inside WordWeaver" vs "Calendar tab" relationship per 3.1.1's tab→surface map.
- **Implementation notes:** The 3D scene's `_tick` already mode-gates *render* on `getCalendarMode()==="3d"` (the 5.1 finding) — but the canvas/container may still be *visible* (dimmed) behind 2D. Ensure the 3D **container** is `display:none`/`visibility:hidden` when not active (not just paused), so nothing bleeds through. Keep the §1.3 400ms cross-fade for the switch. Emit `modeChanged` (3.1.7).
- **Edge cases:** Rapid toggling mid-transition (debounce, §1.3); WebGL absent → 3D disabled, pinned 2D (§1.5); the 3D container hidden must still get layout so it's correct when shown again.
- **UI/UX considerations:** One clean surface at a time (user) — no ghost 3D behind the calendar.
- **Data flow notes:** Toggle → `setCalendarMode` → `modeChanged` → renderers show/hide; only the active surface visible.
- **Testing notes:** In 2D, the 3D container is hidden (not just dimmed); toggle round-trips without destroying either; active segment matches state.
- **Performance notes:** Hidden + paused 3D saves GPU/battery on mobile (a single-panel win).
- **Mobile vs desktop:** Same; mobile benefits most from the paused-hidden 3D.
- **Integration points:** §1.3, §1.5, §13.2, `calendarMode.js`, 3.1.1/3.1.8.
- **Status:** **Divergent (3D bleeds behind 2D).** Render is mode-gated but the 3D container stays visible/dimmed behind 2D. **Next:** fully hide (not dim) the inactive renderer, keep it instantiated, keep the §1.3 fade.

## 3.1.4 — View nav (Today / Week / Month / Year) + Calendar↔WordWeaver view-mode clarity

- **Purpose:** Reconcile the live view nav (Today / Week View / Month View, plus the missing Year) to emit `navigateTo` per §13.2, and clarify (per 3.1.1) that these are **view modes within a surface**, distinct from the bottom-nav **app tabs**.
- **Dependencies:** 3.1.1 (tab vs view-mode), 5.5.9/4.x (`navigateTo` consumers); §13.2 (`navigateTo`), §6.x.
- **Acceptance criteria:** Today/Week/Month/**Year** emit `navigateTo { date, level }` on the canonical bus (the active renderer focuses that level); "Today" → `navigateTo { date: today, level: "day" }`; switching view level does **not** change `calendarMode` or the active app tab; the live "Week View"/"Month View"/"Street signs"/"Morning/Afternoon/Night" controls are reconciled (the time-of-day + street-signs are WordWeaver-specific view options — document which are app-tab vs view-mode vs WordWeaver-only).
- **Implementation notes:** Wire the view buttons to `navigateTo` (the §13.2 source) instead of any direct renderer calls; add the missing **Year** level; note the `navigateTo` **consumer** side in 3D is the 5.5.9 carry (WordWeaverScene doesn't yet listen). Keep the WordWeaver-only controls (Morning/Afternoon/Night, Street signs) scoped to the WordWeaver surface.
- **Edge cases:** Pressing the active level (re-center/no-op); view change while a panel is open (panel stays); the user's "all four views in 3D" (day/week/month/year) is a Phase-5 build — here just emit the right `navigateTo`.
- **UI/UX considerations:** Clear active level; "Today" always returns to now.
- **Data flow notes:** View nav → `navigateTo` → renderers focus level.
- **Testing notes:** Each level emits the right `navigateTo`; mode/app-tab unchanged; Year added.
- **Performance notes:** One emit per tap.
- **Mobile vs desktop:** Per amended §8 (view nav placement).
- **Integration points:** §13.2 (`navigateTo`), §6.x, 5.5.9 (3D consumer), the WordWeaver-only controls.
- **Status:** **Partial (Today/Week/Month exist; Year missing; wiring/clarity TBD).** **Next:** emit `navigateTo` (add Year), separate app-tab vs view-mode vs WordWeaver-only controls.

## 3.1.5 — `calendarMode` persistence (`inkling-calendar-mode`)

- **Purpose:** Confirm/reconcile mode persistence to §3.4 — `calendarMode` written to `inkling-calendar-mode` as `"2d"`/`"3d"` on every change — building on the live `calendarMode.js` store.
- **Dependencies:** 3.1.1, 3.1.3; §3.4, §1.3.
- **Acceptance criteria:** Mode changes persist to `inkling-calendar-mode` (§3.4); it's the single source restored on load (3.1.6); the write never touches the event store (§2.1); reconcile the live `calendarMode.js` key/values to §3.4 exactly.
- **Implementation notes:** Verify `calendarMode.js`'s storage key matches §3.4's `inkling-calendar-mode` (like the 1.3.2 `hasUserNotes` key bug — check it's not a divergent key); keep the write small/synchronous.
- **Edge cases:** localStorage blocked (private mode) → in-memory fallback, no crash; corrupt/unknown value → default (3.1.6).
- **UI/UX considerations:** Invisible; pays off in restore.
- **Data flow notes:** Toggle → `setCalendarMode` → localStorage.
- **Testing notes:** Toggle writes the §3.4 key/value; event store untouched; key string matches §3.4.
- **Performance notes:** Tiny string write.
- **Mobile vs desktop:** Identical.
- **Integration points:** §3.4, `calendarMode.js`.
- **Status:** **Likely present — verify key.** `calendarMode.js` store exists; confirm the key == `inkling-calendar-mode` (§3.4) and reconcile if divergent. **Next:** verify/align the key, confirm event-store isolation.

## 3.1.6 — Restore last mode on load + WebGL fallback

- **Purpose:** Reconcile load-time mode restore to §1.5/§3.4 — read `inkling-calendar-mode`, apply before first paint, with WebGL-absent forcing 2D — so the app reopens in the last mode without a flip.
- **Dependencies:** 3.1.5; §1.5, §3.4, §1.3.
- **Acceptance criteria:** On startup the stored mode is active on first paint (no 3D→2D flicker); absent/invalid → default; **WebGL unavailable → forced 2D** with a one-time notice (§1.5, the 5.1 finding that no WebGL probe exists today — add it); the toggle segment reflects the resolved mode.
- **Implementation notes:** Resolution order: WebGL probe (the 5.1.2 gap — `new WebGLRenderer` is currently unguarded) → stored value → default. The 5.1/5.2 specs flagged the missing WebGL fallback; this is where the shell-level force-2D lives.
- **Edge cases:** Stored 3D but WebGL now absent → silent 2D + notice; missing key first run → default, no flash.
- **UI/UX considerations:** No mode flicker; feels "remembered."
- **Data flow notes:** localStorage → `calendarMode` → initial render.
- **Testing notes:** 2D/3D restore; invalid→default; WebGL-absent overrides stored 3D.
- **Performance notes:** One read at startup.
- **Mobile vs desktop:** Mobile more likely to hit the WebGL/perf fallback.
- **Integration points:** §3.4, §1.5, 5.1.2 (WebGL probe gap).
- **Status:** **Partial (restore likely; WebGL fallback missing — 5.1 finding).** **Next:** WebGL probe → force 2D + notice; apply stored mode pre-paint.

## 3.1.7 — Emit `modeChanged` on the canonical bus

- **Purpose:** Reconcile the mode-switch signal to §13.2 — emit `modeChanged { mode }` on the **canonical bus** (the 2.1 one) — so renderers + Inkling react; note `modeChanged` is the Phase-3 catalog addition (the 2.1.9 carry).
- **Dependencies:** 3.1.3, 2.1 (bus); §13.2 (`modeChanged`), §4.3.
- **Acceptance criteria:** Mode switch emits `modeChanged { mode: "2d"|"3d" }` on `src/utils/EventBus.js` after the state/persist update; subscribers WordWeaverScene/Calendar2D/InklingPanel react; once per genuine switch (not on same-mode restore); **`modeChanged` is added to the §13.2 catalog** (the 2.1.9/2.1.4 carry — it was already in the catalog at line 1170 ✓, so this just wires the emit).
- **Implementation notes:** The live mode switch may currently route through the standalone `calendarMode.js` store + direct `cal2d.hide()/show()` (the 5.1.9 finding) rather than the bus — reconcile to emit `modeChanged` on the canonical bus and have WordWeaverScene/Calendar2D **listen** (closing the 5.1.9 gap where neither listens to `modeChanged`/`navigateTo`).
- **Edge cases:** Same-mode restore → no emit; mid-transition re-toggle → no double-emit.
- **UI/UX considerations:** Enables Inkling's mode-acknowledgment without the shell knowing about Inkling (§2.1).
- **Data flow notes:** Toggle → `modeChanged` → renderers + InklingPanel.
- **Testing notes:** One emit per real switch; no emit on same-mode restore; subscribers react.
- **Performance notes:** Single emit.
- **Mobile vs desktop:** Identical.
- **Integration points:** §13.2 (`modeChanged`), §4.3, 5.1.9 (renderers should listen).
- **Status:** **Divergent (direct hide/show, not bus).** Mode likely routes via `calendarMode.js` + direct cal2d.hide/show, not `modeChanged` on the bus. **Next:** emit `modeChanged` on the canonical bus; renderers subscribe (close 5.1.9).

## 3.1.8 — Single-panel / one-surface-active + re-tap-to-minimize (complete the user model)

- **Purpose:** Complete the user's core nav model on the existing primitives — **only one surface open at a time** (built on `WindowManager`'s "one surface active"), **re-tap the active bottom-nav icon to close/minimize** (built on `InklingBottomNav`'s toggle-detect), default to blank/Inkling on close — while keeping both renderers instantiated (§1.3) and protecting the 2D view (§2.1 Layer 3).
- **Dependencies:** 3.1.1 (the model), `WindowManager`/`InklingBottomNav`/`MinimizeBar`; §1.3, §2.1, user model.
- **Acceptance criteria:** Tapping a bottom-nav icon opens its surface and **hides all others** (via `WindowManager`'s one-surface-active path, WindowManager.js:35); **re-tapping the active icon** (the `toggle:true` signal, InklingBottomNav.js:18) **closes/minimizes** it → blank background or Inkling (per 3.1.1); only one surface is ever visible; both the 2D and 3D renderers stay **instantiated** (hidden, not destroyed, §1.3) across all of this; the 3D scene **pauses** its loop when hidden; the `MinimizeBar` reflects minimized surfaces.
- **Implementation notes:** Wire `InklingBottomNav.onTab(tab, { toggle })`: if `toggle` → minimize/close the active surface (default blank/Inkling); else → `WindowManager.open(tabSurface)` which hides all others (the one-surface path). Map each tab → its surface (3.1.1). Reuse `MinimizeBar` for the minimized state. Ensure the 2D/3D containers mount once and toggle **visibility** (the §1.3 invariant) — never remount. This is where the user's "each icon minimizes its feature" + "one at a time" lands.
- **Edge cases:** Switching surfaces mid-3D-render (pause cleanly); the 2D view must never be destroyed (§2.1 Layer 3); a surface with unsaved input (Writer) — confirm before close or keep state on minimize; restoring a minimized surface keeps its scroll/state.
- **UI/UX considerations:** The user's central ask — one clean surface, tap-to-toggle, nothing overlapping/bleeding.
- **Data flow notes:** Bottom nav → WindowManager one-surface-active → show/hide surfaces; toggle → minimize.
- **Testing notes:** Opening a tab hides all others; re-tap minimizes to blank/Inkling; both renderers still in DOM after many switches; 3D paused when hidden.
- **Performance notes:** One heavy surface at a time + paused 3D = the mobile win.
- **Mobile vs desktop:** Mobile-primary; desktop may allow more, but defaults to single-panel.
- **Integration points:** §1.3, §2.1, `WindowManager`/`InklingBottomNav`/`MinimizeBar`, 3.1.1, user model.
- **Status:** **Partly built — complete it.** `WindowManager` one-surface-active + `InklingBottomNav` toggle-detect + `MinimizeBar` exist; not yet wired to the full "tap-active-to-minimize, one-at-a-time, default blank/Inkling" flow. **Next:** wire toggle→minimize + tab→one-surface-open, keep renderers instantiated, pause hidden 3D.

## 3.1.9 — Mobile-first: every surface its own scrollable screen (no x/y cut-off)

- **Purpose:** Reconcile the responsive shell to the user's **mobile-first** priority — each surface is its **own full-screen, scrollable screen** so nothing is cut off on **x or y** on a phone — amending §8.7 from desktop-centric to mobile-primary.
- **Dependencies:** 3.1.1 (§8 amendment), 3.1.8 (single-panel), the DayScroller scroll fix (b5547d4); §8.7, §8.2, user mobile priority.
- **Acceptance criteria:** On mobile (<640px) each active surface fills the screen and **scrolls** (both axes handled — no content cut off horizontally or vertically); the **bottom nav is the primary navigation** (thumb-reachable); the top chrome is compact/contextual; safe-area insets/notches handled; the recurring **scroll regressions** (the clock/time-slot DayScroller — now JS-enforced + guarded, b5547d4; and any other scroll containers) stay scrollable; desktop keeps a richer layout but the same single-panel flow.
- **Implementation notes:** Amend §8.7 to mobile-first single-panel. Audit each surface (Calendar, Writer, WordWeaver-2D, Alerts, Inkling, Settings) for **overflow/scroll** on small screens — apply the same JS-enforced-scroll discipline the clock fix used where CSS cascades are fragile (and the dayscroller guard pattern). Ensure no fixed-width content overflows x; ensure scroll containers have bounded height + overflow-y. The 3D surface is the exception (full-bleed canvas).
- **Edge cases:** Landscape mobile (short height); very small widths; the WordWeaver 3D controls (fly/descend — the cut-out regression, restore in Phase 5) must be reachable on mobile; notch safe-areas for the bottom nav.
- **UI/UX considerations:** The user's headline: mobile-aesthetic, nothing cut off, everything scrolls.
- **Data flow notes:** Same controls/bus events; responsive presentation only.
- **Testing notes:** Each surface renders full-screen + scrolls under 640px; no x/y cut-off; bottom nav reachable; scroll guards hold.
- **Performance notes:** Single-panel + paused 3D helps mobile; watch blur/effects cost.
- **Mobile vs desktop:** This is the primary divergence — and the user's priority is mobile.
- **Integration points:** §8.7, §8.2, the scroll-guard pattern (b5547d4 / check-dayscroller-scroll), 3.1.8.
- **Status:** **Divergent (desktop-centric; mobile cut-off).** Content cut off on x/y on mobile; §8.7 is desktop-first. **Next:** amend §8.7 to mobile-first single-panel; make each surface a full-screen scrollable screen; audit overflow with the JS-enforced-scroll discipline.

## 3.1.10 — Cross-check §2.1/§8 + amend §8 + close out the nav-model items

- **Purpose:** Confirm the reconciled shell honors §2.1 (Layer 1), **apply the §8 amendment** (single-panel/mobile-first), and close out the user's nav items (top gap, bell, 3D bleed, one-at-a-time, mobile scroll) before 3.2/3.3 build on it.
- **Dependencies:** 3.1.1-3.1.9; §2.1, §8.0-§8.7, §13.2, user model.
- **Acceptance criteria:** Verified against §2.1 (shell = no business logic, communicates via bus, only writes the mode preference key); §8 is **amended** to the single-panel/mobile-first model (3.1.1) and the shell matches it; the user items are each resolved/tracked: wasted top gap **filled** (3.1.2), **bell** Alerts (3.1.2), 3D-behind-2D **hidden** (3.1.3), **one-surface-active + re-tap-minimize** (3.1.8), **mobile full-screen scroll** (3.1.9); `modeChanged`/`navigateTo` on the canonical bus (3.1.7/3.1.4); the constellation/memory-tree column removal (UI-change-requests #7) is scheduled (3.3/Settings or here — document); deviations fixed/documented.
- **Implementation notes:** Walk §8 (amended) against the live shell; re-assert §2.1 (only the mode key is written by the shell); confirm the bus sources/subscribers; record the §8 amendment prominently (like §28/§7).
- **Edge cases:** WebGL fallback (§1.5) reflected in the toggle; same-mode restore no `modeChanged`; the "remove constellation/memory-tree column" item — confirm where it lives (top chrome) and schedule.
- **UI/UX considerations:** Every action gives an immediate visual response (§1.4); one clean surface at a time (user).
- **Data flow notes:** Confirms the shell's bus sources (`modeChanged`/`navigateTo`) + the single-panel surface routing.
- **Testing notes:** §2.1/§8 (amended) checklist passes; user items resolved/tracked.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both verified against the amended §8.7.
- **Integration points:** §2.1, §8 (amended), §13.2, UI-change-requests.
- **Status:** **Open (cross-check + §8 amendment + item close-out).** **Next:** amend §8 to single-panel/mobile-first, verify §2.1, close the nav items (gap/bell/bleed/one-at-a-time/mobile-scroll/constellation-column).

---

### Milestone 3.1 — Definition of Done
- The shell is reconciled as the canonical composition (no parallel `UIShell`): bottom nav + top chrome + `WindowManager`/`AppLauncher`/`MinimizeBar` + panels + `calendarMode`, with **§8 amended to the single-panel/mobile-first model**.
- **One surface open at a time; re-tap a bottom-nav icon to close/minimize** (default blank/Inkling); both renderers stay instantiated (§1.3); the 3D no longer bleeds behind 2D; the wasted top gap is filled; Alerts has a **bell** icon.
- `calendarMode` persists/restores (§3.4) with WebGL-forced 2D; `modeChanged`/`navigateTo` emit on the canonical bus; every surface is a full-screen scrollable screen on mobile (no x/y cut-off).
- **Next:** Milestone 3.2 — Inkling Panel Shell (re-ground just-ahead, around this nav model).
