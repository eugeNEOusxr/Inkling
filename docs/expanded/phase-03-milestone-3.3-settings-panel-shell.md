# Phase 3 — Milestone 3.3: Settings Panel Shell (Expanded)

**Goal:** The Settings panel as a *shell only* — slide-in drawer (right on desktop / full-screen modal on mobile) with placeholder preference sections, Escape + outside-click dismissal, a stub preferences module, and event-bus wiring for future preference changes. No real preference writes to the timeline; no theme application yet.
**Spec alignment:** §2.1 (Layer 6 — Settings does NOT interact with the timeline model directly), §8.4 (panel anchoring + sections: Display, Notifications, Data, AI, About), §8.6 (panel z-index 200), §8.7 (responsive — side panel desktop / full-screen mobile), §3.4 (`inkling-preferences-v1` key — owned by the preferences module, not the event store), §13.2 (bus). Roadmap cross-check cites §8.2 (mobile bottom nav houses the Settings entry); the panel content spec is §8.4.
**Sequencing:** Last milestone of Phase 3 (and the last defined phase). Mounts inside `UIShell` (3.1), triggered from the top bar's Settings button (and the mobile bottom nav, §8.2). Reuses the shared glass tokens (2.3.7 / 3.2.9) and the panel-dismissal conventions (Inkling 3.2.6). The stub preferences module it introduces is the seam the real preferences system (theme §21, defaults, notifications) will grow into later.

---

## 3.3.1 — Create `SettingsPanel.js`

- **Purpose:** Establish the Settings panel component and its visibility state.
- **Dependencies:** 3.1 (UIShell host, bus).
- **Acceptance criteria:** `SettingsPanel.js` mounts inside UIShell as a closed-by-default drawer; per §8.4 it is a slide-in panel from the right on desktop and a full-screen modal on mobile; per §2.1 (Layer 6) it does not read or write the timeline model directly.
- **Implementation notes:** Settings is the "user preferences, theme, data management" layer (§2.1 Layer 6). Its job is preferences, not events — any data-management action (export/import/clear) routes through the timeline model's public API, never by touching `_events` or `inkling-timeline-v1` directly (§2.1, reinforced in 3.3.6). State machine is simply Open/Closed (no minimized state, unlike Inkling).
- **Edge cases:** Open while already open (no-op); reload resets to Closed (UI state not persisted, §13.x); mode switch must not affect Settings state (overlays both, §8.6).
- **UI/UX considerations:** Slide-in drawer (desktop) keeps context; full-screen (mobile) for focus (§8.4).
- **Data flow notes:** Reads/writes only the preferences module (3.3.9), never the event store.
- **Testing notes:** Mounts Closed; opens to right-drawer (desktop) / full-screen (mobile); no timeline access.
- **Performance notes:** Render body only when open.
- **Mobile vs desktop:** Right drawer vs full-screen modal — §8.4, expanded in 3.3.3/3.3.7.
- **Integration points:** §2.1 (Layer 6), §8.4.

## 3.3.2 — Add Settings button in top bar

- **Purpose:** Provide the entry point to Settings.
- **Dependencies:** 3.3.1, 3.1.2 (top bar).
- **Acceptance criteria:** A Settings button (gear) sits in the top bar's Settings slot on desktop/tablet (§8.1); on mobile the Settings entry lives in the bottom navigation (§8.2); activating it opens the panel.
- **Implementation notes:** Mirror the Inkling-button pattern (3.2.2): the button triggers an open via the bus rather than poking the panel's internals (§2.4). On mobile the gear is part of the bottom nav (§8.2) alongside Today/Week/Month/Year; on desktop/tablet it's the rightmost top-bar control (§8.1).
- **Edge cases:** Tap while open → toggle-close vs no-op (recommend toggle for consistency with Inkling); gear placement on tablet (icon-only top bar).
- **UI/UX considerations:** Recognizable gear icon; reachable in both layouts.
- **Data flow notes:** Settings button → open Settings (bus/handler) → SettingsPanel.
- **Testing notes:** Opens panel from top bar (desktop) and bottom nav (mobile).
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Top-bar gear vs bottom-nav gear — §8.1/§8.2 divergence.
- **Integration points:** §8.1, §8.2.

## 3.3.3 — Implement slide-in animation

- **Purpose:** Smooth, consistent open/close transition.
- **Dependencies:** 3.3.1.
- **Acceptance criteria:** Opening slides the panel in from the right (desktop) or presents the full-screen modal (mobile, §8.4); closing reverses it; the panel sits at z-index 200 (§8.6).
- **Implementation notes:** Reuse the transform-based animation and house easing/duration used by Inkling (3.2.3) — the §1.3 400ms ease-in-out standard — so the two panels feel identical. Desktop width follows §8.7 (380px fixed desktop, 50% tablet); mobile is full-screen (§8.4). Respect reduced-motion.
- **Edge cases:** Rapid open/close (interrupt cleanly); orientation change mid-animation; full-screen modal entering on mobile shouldn't trap scroll behind it.
- **UI/UX considerations:** Immediate visual response (§1.4); consistent with Inkling's motion.
- **Data flow notes:** Presentation only.
- **Testing notes:** Slides from right (desktop) / full-screen (mobile); reverses on close; z-index 200.
- **Performance notes:** Transform/opacity only; respect reduced-motion.
- **Mobile vs desktop:** Side drawer vs full-screen — divergence point.
- **Integration points:** §8.4, §8.6, §8.7, §1.3.

## 3.3.4 — Add placeholder sections: Theme, Time format, Data

- **Purpose:** Lay out the settings surface with the sections the real preferences system will fill.
- **Dependencies:** 3.3.1.
- **Acceptance criteria:** The panel renders labeled placeholder sections — at minimum Theme, Time format, and Data (roadmap) — structured to grow into the full §8.4 set (Display, Notifications, Data, AI, About); controls are present but inert (no real effect yet).
- **Implementation notes:** Map the roadmap's three to the §8.4 taxonomy: "Theme" → Display/Theme selector (§21), "Time format" → Display (12/24h; complements first-day-of-week), "Data" → Data (export JSON / import JSON / clear-all with confirmation). Leave room for Notifications (sound/popup toggles) and AI (Inkling sensitivity) and About (version) sections per §8.4. Controls render but do nothing until the real preferences system lands — they bind to the stub module (3.3.9) only.
- **Edge cases:** Long section content on mobile full-screen → internal scroll; Data section's "Clear all" is destructive and must require confirmation (§8.4) — wire the confirm affordance even if the action is stubbed.
- **UI/UX considerations:** Clear section headers; destructive actions visually distinct and guarded.
- **Data flow notes:** Controls read/write the stub preferences module (3.3.9), not the timeline.
- **Testing notes:** Sections render with headers and inert controls; structure matches §8.4 groupings.
- **Performance notes:** Static; negligible.
- **Mobile vs desktop:** Same sections; layout differs (3.3.7).
- **Integration points:** §8.4, §21 (theme, future).

## 3.3.5 — Close on Escape and outside click

- **Purpose:** Standard dismissal — keyboard and pointer.
- **Dependencies:** 3.3.1, 3.3.3.
- **Acceptance criteria:** With the panel open, pressing Escape closes it, and clicking/tapping outside the panel (on the backdrop/scrim) closes it; on mobile full-screen, a close (X / back) dismisses it.
- **Implementation notes:** Mirror the shared panel-dismissal convention (Inkling 3.2.6, Alerts 2.3.9). Add the Escape and outside-click listeners on open and remove them on close/unmount (§13.3 no-leak pattern). Outside-click needs a backdrop/scrim hit area on desktop; on mobile full-screen there is no "outside," so rely on the X/back affordance. Restore focus to the Settings trigger on close.
- **Edge cases:** Outside-click should not fire when interacting with controls inside the panel; Escape precedence when a confirmation modal (z 500, e.g. Clear-all) is open — the modal consumes Escape first; clicking the scrim while a confirm dialog is up should not close Settings underneath.
- **UI/UX considerations:** Predictable dismissal; focus returns to the gear.
- **Data flow notes:** Close is a local state change (no persistence, §13.x).
- **Testing notes:** Escape and scrim-click close the panel; listeners removed on close; inner clicks don't dismiss.
- **Performance notes:** Listeners added/removed with state.
- **Mobile vs desktop:** Outside-click/scrim (desktop) vs X/back (mobile full-screen).
- **Integration points:** §8.4, §13.3, §8.6 (z-order vs modals).

## 3.3.6 — Ensure no direct timeline writes yet

- **Purpose:** Enforce the §2.1 Layer 6 rule — Settings never writes the timeline model directly.
- **Dependencies:** 3.3.1.
- **Acceptance criteria:** The Settings shell performs no writes to `inkling-timeline-v1` or the model's `_events`; any future data operation (export/import/clear) goes through the timeline model's public API; preference values go to the preferences module only (3.3.9).
- **Implementation notes:** This is an architectural guard, not a feature: §2.1 says the Settings panel "does not interact with the timeline model directly." Export reads via a model helper; import/clear call model methods (which validate + emit `eventCreated`/`eventDeleted`); they never serialize to localStorage from the panel. In this shell milestone these are stubbed, but the seams must respect the boundary so the later wiring can't shortcut it.
- **Edge cases:** Tempting shortcut — writing preferences into the event store or vice versa (forbidden, two separate keys §3.4); a future "clear all data" must go through the model so subscribers re-render (§3.5 lifecycle), not by wiping localStorage behind the model's back.
- **UI/UX considerations:** N/A (architectural).
- **Data flow notes:** Settings → preferences module (prefs key); data actions → timeline model public API → bus.
- **Testing notes:** No localStorage event-store writes originate from SettingsPanel; data-action stubs point at model APIs, not raw storage.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Identical rule.
- **Integration points:** §2.1 (Layer 6), §3.4, §3.5.

## 3.3.7 — Add basic layout for mobile/desktop

- **Purpose:** Make the panel correct across the §8.7 breakpoints.
- **Dependencies:** 3.3.1, 3.3.4.
- **Acceptance criteria:** Desktop (≥1024px): right-side drawer at 380px fixed. Tablet (640–1023px): side panel at 50% width. Mobile (<640px): full-screen modal with its own close affordance and the Settings entry coming from the bottom nav (§8.2/§8.4/§8.7).
- **Implementation notes:** Drive from the §8.7 breakpoint table (same source 3.1.9/3.2.3 use). On mobile, full-screen means sections stack and scroll vertically; on desktop, the drawer scrolls internally within 380px. Keep section order stable across breakpoints so the layout feels like one panel, not two.
- **Edge cases:** Landscape mobile (short height → internal scroll, sticky header/close); tablet boundary at 1024px (50% ↔ 380px); safe-area insets on full-screen mobile.
- **UI/UX considerations:** Comfortable touch targets on mobile; readable density on desktop.
- **Data flow notes:** Same content; responsive presentation only.
- **Testing notes:** Each breakpoint renders the specified width/format; sections scroll within the panel.
- **Mobile vs desktop:** Primary divergence point for this milestone.
- **Integration points:** §8.4, §8.7.

## 3.3.8 — Wire to event bus for future preferences

- **Purpose:** Establish the channel by which preference changes will notify the rest of the app.
- **Dependencies:** 3.3.1, 2.1 (bus), 3.3.9.
- **Acceptance criteria:** Settings is connected to the event bus so that changing a preference will emit a preference-changed signal that interested modules can subscribe to (e.g., theme → app shell, mode default → UIShell, sound/popup → alerts/audio); in this shell the wiring exists and emits are stubbed/no-op until real controls are active.
- **Implementation notes:** Per §2.1, cross-module communication is bus-only — Settings must not call other modules directly to apply a preference. Define the seam now (e.g., a `preferenceChanged { key, value }`-style emit from the stub module, 3.3.9) so later milestones add subscribers without re-plumbing. Note: §13.2's catalog doesn't yet enumerate a preferences event — this milestone introduces the seam that a future spec update will formalize; flag it as a carry-forward rather than inventing a contract silently.
- **Edge cases:** Avoid emit storms from rapid slider/toggle changes (debounce when real controls arrive); ensure no subscriber assumes a payload shape before it's defined.
- **UI/UX considerations:** Invisible now; enables instant theme/format application later (§1.4).
- **Data flow notes:** Settings control → preferences module → bus emit → future subscribers.
- **Testing notes:** Bus connection present; stubbed emit fires through the module seam (no subscribers required yet).
- **Performance notes:** Negligible at shell stage.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.1, §13.2 (carry-forward: preferences event to be catalogued).

## 3.3.9 — Add stub preferences module

- **Purpose:** Introduce the preferences data layer (the §2.1 "preferences module") as a minimal stub.
- **Dependencies:** 3.3.1.
- **Acceptance criteria:** A `preferences.js`-style module exposes get/set for preference keys backed by `inkling-preferences-v1` (§3.4), with sensible defaults; it is the only writer of that key, separate from the timeline model's event store.
- **Implementation notes:** §2.1 names a "Persistence Layer accessed exclusively through the timeline model and preferences module" — this is that preferences module. It owns `inkling-preferences-v1` (§3.4: "Theme, mode, etc."), distinct from `inkling-timeline-v1`. Provide defaults (theme, time format, default calendar mode, notification toggles) and a typed-ish get/set; emit `preferenceChanged` (3.3.8) on set. The actual *application* of preferences (rendering a theme, formatting times) is later — this is storage + defaults + the emit seam only.
- **Edge cases:** Missing/corrupt prefs JSON → fall back to defaults (don't crash); localStorage blocked → in-memory prefs; schema versioning via the `-v1` suffix (future migrations).
- **UI/UX considerations:** None directly; underpins later settings UX.
- **Data flow notes:** preferences module ↔ `inkling-preferences-v1`; emits `preferenceChanged` on the bus.
- **Testing notes:** get returns defaults when unset; set persists to the prefs key and emits; corrupt JSON → defaults.
- **Performance notes:** Tiny reads/writes; cache in memory.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.1 (preferences module / persistence), §3.4 (`inkling-preferences-v1`).

## 3.3.10 — Cross-check with spec §8.2

- **Purpose:** Confirm the Settings shell matches the spec before later milestones add real preferences.
- **Dependencies:** 3.3.1–3.3.9.
- **Acceptance criteria:** Verified against §8.2 (mobile bottom-nav Settings entry), §8.4 (anchoring + section taxonomy: Display, Notifications, Data, AI, About), §8.6 (z 200), §8.7 (responsive), §2.1 (Layer 6 — no direct timeline writes), and §3.4 (prefs key ownership). Deviations fixed or documented.
- **Implementation notes:** Reconcile the roadmap's three placeholder sections (Theme, Time format, Data) with §8.4's five — confirm the structure can host all five without rework. Confirm dismissal (Escape + outside-click / mobile X), the preferences-module ownership of `inkling-preferences-v1`, and the bus-only preference seam (3.3.8). Record the carry-forward: §13.2 should later add the preferences-changed event the seam emits.
- **Edge cases:** Roadmap cites §8.2 but the panel-content spec is §8.4 — note both; destructive "Clear all" confirmation present (§8.4); mobile entry via bottom nav (§8.2).
- **UI/UX considerations:** Confirm glass/readability and consistent motion with Inkling (3.2/3.3 shared tokens & easing).
- **Data flow notes:** Confirms Settings touches only the preferences module + bus, never the event store (§2.1).
- **Testing notes:** §8.4/§8.2 checklist passes; no timeline writes; prefs key owned solely by the module.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both layouts verified (§8.7).
- **Integration points:** §8.2, §8.4, §8.6, §8.7, §2.1, §3.4.

---

### Milestone 3.3 — Definition of Done
- `SettingsPanel` mounts in UIShell as a glass drawer (right on desktop, full-screen on mobile), opens from the top-bar gear / mobile bottom-nav (§8.1/§8.2), slides in (shared motion with Inkling), and closes on Escape + outside-click / mobile X — all at z-index 200 (§8.6), responsive per §8.7.
- It renders placeholder sections (Theme, Time format, Data) structured to grow into the full §8.4 taxonomy, makes no direct timeline writes (§2.1 Layer 6), introduces a stub `preferences` module owning `inkling-preferences-v1` (§3.4) with defaults, and is wired to the bus via a `preferenceChanged` seam for future subscribers (carry-forward: catalog the event in §13.2).
- **Phase 3 complete — last defined phase.** Remaining roadmap (Phases 4–10) is one-line stubs; next step per the workflow is to combine `docs/expanded/*.md` into `combined.md` and commit.
