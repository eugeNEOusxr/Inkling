# Phase 3 — Milestone 3.2: Inkling Panel Shell (Expanded)

**Goal:** The Inkling chat panel as a *shell only* — slide-in/out drawer with message-list and input areas, open/minimized/closed states, Escape-to-close, glass styling, overlaying both calendar modes. No AI wiring yet (that is Phase later); this builds the container the AI plugs into.
**Spec alignment:** §2.1 (Layer 4 — overlays the calendar, holds its own per-session message history), §4.2 (panel anchoring, states, triggers, contents, message types), §8.3 (= §4.2), §8.6 (panel z-index 200), §8.7 (responsive — side panel desktop, bottom/full-screen mobile), §13.2 (`inklingOpened`, `inklingClosed`).
**Sequencing:** Mounts inside `UIShell` (3.1) and is triggered by the top bar's Inkling button (and the mobile FAB). Sits at z-index 200, below the Alerts dropdown (300, Phase 2) and toasts (400). It reuses the shared glass styling tokens introduced for the Alerts dropdown (2.3.7). AI behaviors (system-event summaries, message processing) are deferred — this milestone only emits open/close lifecycle events and renders the static shell.

---

## 3.2.1 — Create `InklingPanel.js` with open/close state

- **Purpose:** Establish the panel component and its core visibility state machine.
- **Dependencies:** 3.1 (UIShell host, bus).
- **Acceptance criteria:** `InklingPanel.js` mounts inside UIShell with three states — Closed (default), Open, Minimized (§4.2) — and renders as a right-anchored drawer on desktop / bottom drawer on mobile (§4.2).
- **Implementation notes:** The panel owns its own state and (per §2.1 Layer 4) its message history in memory per session — but in this shell milestone the history is empty/placeholder, no AI. Default state is Closed (§4.2). Keep the state machine explicit (closed↔open↔minimized) so 3.2.5 (minimize) and 3.2.6 (Escape) slot in cleanly.
- **Edge cases:** Opening when already open (no-op); state must survive a mode switch (panel overlays both 2D and 3D, 3.2.8); reload resets to Closed (no persistence yet, 3.2.7).
- **UI/UX considerations:** Slide-in drawer, not a full takeover — the calendar stays visible behind it (§1.3 note: panels layer on top, don't replace).
- **Data flow notes:** Local state now; bus lifecycle emits in 3.2.x; AI message flow is later.
- **Testing notes:** Mounts Closed; can enter Open and Minimized; right/bottom anchoring per platform.
- **Performance notes:** Render panel body only when not Closed; keep the trigger cheap.
- **Mobile vs desktop:** Right drawer (desktop) vs bottom drawer (mobile) — §4.2, expanded in 3.2.3.
- **Integration points:** §2.1, §4.2.

## 3.2.2 — Add open/close button in top bar

- **Purpose:** Give the user the primary entry point to Inkling.
- **Dependencies:** 3.2.1, 3.1.2 (top bar).
- **Acceptance criteria:** An Inkling button sits in the top bar's Inkling slot (§8.1); on mobile a floating action button (FAB) at bottom-right is the alternative trigger (§4.2/§8.1); activating it opens the panel (and emits `inklingOpened`, 3.2.x).
- **Implementation notes:** Per §13.2 the open trigger is `InklingButton` emitting `inklingOpened`, which InklingPanel subscribes to — i.e. the button does not call the panel directly; it goes through the bus (§2.4). On mobile the FAB floats above the bottom nav on the right (§8.2). The button may reflect open state (e.g., active styling) but the panel owns the actual state.
- **Edge cases:** Tapping the button while open — decide toggle vs no-op (recommend toggle to close, mirroring common drawer UX) but keep `inklingClosed` semantics correct; FAB overlap with bottom nav on short screens.
- **UI/UX considerations:** Obvious, reachable; FAB thumb-reachable on mobile (§8.2).
- **Data flow notes:** InklingButton → `inklingOpened` → InklingPanel (§13.2).
- **Testing notes:** Button/FAB opens panel and emits `inklingOpened`; present in both top-bar layouts.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Top-bar button (desktop/tablet) vs FAB (mobile) — divergence point.
- **Integration points:** §8.1, §8.2, §13.2 (`inklingOpened`).

## 3.2.3 — Implement slide-in animation (right on desktop, bottom on mobile)

- **Purpose:** Give the open/close a smooth, spatial transition matching the app's feel.
- **Dependencies:** 3.2.1.
- **Acceptance criteria:** Opening slides the panel in from the right (desktop) or up from the bottom (mobile); closing reverses it (§4.2); the panel sits at z-index 200 (§8.6), above the calendar, below the Alerts dropdown.
- **Implementation notes:** Use CSS transforms (translateX/translateY) for GPU-friendly motion; match the app's easing/duration conventions (the §1.3 400ms ease-in-out is the house standard — reuse it for consistency). Desktop side panel width and mobile sheet height follow §8.7 (desktop 380px fixed; tablet 50%). Swipe-down to close on mobile is part of the close triggers (§4.2) — wire the gesture here or in 3.2.6.
- **Edge cases:** Rapid open/close (don't stack animations — interrupt cleanly); reduced-motion preference → minimize/disable animation; orientation change mid-animation.
- **UI/UX considerations:** Immediate visual response (§1.4); calendar remains visible behind the drawer.
- **Data flow notes:** Presentation only; state transitions drive the animation.
- **Testing notes:** Slides from correct edge per platform; reverses on close; z-index 200.
- **Performance notes:** Transform/opacity only (no layout thrash); respect reduced-motion.
- **Mobile vs desktop:** Right edge vs bottom edge — divergence point.
- **Integration points:** §4.2, §8.6, §8.7, §1.3.

## 3.2.4 — Add message list area and input area (no AI yet)

- **Purpose:** Lay out the conversation surface and composer the AI will later drive.
- **Dependencies:** 3.2.1.
- **Acceptance criteria:** The open panel shows a scrollable message-history area (newest at bottom) and an input row with a single-line field (expandable to multi-line) plus a Send button (§4.2); a context indicator and Clear-history control are present per §4.2 (clear requires confirmation — wired later).
- **Implementation notes:** Build the four message-type slots from §4.2 as styled containers (user = right-aligned accent bubble; Inkling = left glass bubble; system event = centered subtle italic; error = left error-colored with retry) so the AI layer only has to feed content. No `AIBrain` calls in this milestone — Send may be inert or echo a placeholder. Reserve the context-indicator region (shows focused date/event) for later wiring.
- **Edge cases:** Empty history → friendly empty state; very long input → field expands to multi-line (§4.2); long message list → internal scroll, auto-scroll to newest on add.
- **UI/UX considerations:** Newest-at-bottom chat convention; input always reachable above the mobile keyboard (safe-area/keyboard-inset handling).
- **Data flow notes:** Static now; AI message flow (`AIBrain.processMessage`) is a later phase.
- **Testing notes:** Message area scrolls and pins to newest; input expands on long text; Send present (inert).
- **Performance notes:** Virtualize only if needed later; trivial at shell stage.
- **Mobile vs desktop:** Keyboard handling and width differ; same component.
- **Integration points:** §4.2.

## 3.2.5 — Add minimized state (header only)

- **Purpose:** Let the user keep Inkling at hand without it covering the calendar.
- **Dependencies:** 3.2.1, 3.2.4.
- **Acceptance criteria:** A Minimized state collapses the panel to a header bar only, showing the last message (§4.2); the user can restore to Open or close fully from the header.
- **Implementation notes:** Minimized is the third state in the 3.2.1 machine. Show the last message snippet in the header (§4.2) so context persists. Provide controls to expand (→Open) and close (→Closed). Keep the message history in memory across minimize/restore (§2.1 Layer 4).
- **Edge cases:** Minimize with empty history → header shows a neutral title, not a blank snippet; minimize on mobile (header docks to bottom edge); a new system event while minimized (later: subtle indicator; here just keep the header).
- **UI/UX considerations:** Header remains tappable to expand; doesn't obstruct the calendar.
- **Data flow notes:** Pure UI state change; history retained.
- **Testing notes:** Minimize collapses to header with last-message text; expand restores; history preserved.
- **Performance notes:** Body not rendered while minimized.
- **Mobile vs desktop:** Header docks bottom (mobile) / right column collapsed (desktop).
- **Integration points:** §4.2.

## 3.2.6 — Close on Escape key

- **Purpose:** Provide the standard desktop dismissal and accessibility affordance.
- **Dependencies:** 3.2.1, 3.2.3.
- **Acceptance criteria:** With the panel Open (desktop), pressing Escape closes it (§4.2) and emits `inklingClosed` (3.2.x); on mobile, swipe-down is the equivalent close gesture (§4.2).
- **Implementation notes:** Mirror the panel-close convention shared with Settings (3.3.5) and the Alerts dropdown (2.3.9). Add the key listener while Open and remove it on close/unmount to avoid leaks (§13.3 pattern from Phase 2). Escape from Minimized may also close fully (consistent dismissal). Restore focus to the Inkling button on close for keyboard users.
- **Edge cases:** Escape while another overlay (Alerts at z 300, a modal at 500) is open — the topmost overlay should consume Escape first; ensure Inkling doesn't steal it when not topmost.
- **UI/UX considerations:** Predictable dismissal; focus returns to trigger.
- **Data flow notes:** Close → `inklingClosed` (§13.2).
- **Testing notes:** Escape closes Open panel and emits `inklingClosed`; listener removed on close; focus restored.
- **Performance notes:** Single listener, added/removed with state.
- **Mobile vs desktop:** Escape (desktop) vs swipe-down (mobile) — both close.
- **Integration points:** §4.2, §13.2 (`inklingClosed`), §13.3.

## 3.2.7 — Persist open/closed state in memory only (no storage yet)

- **Purpose:** Keep the panel's state per session without committing a persistence schema prematurely.
- **Dependencies:** 3.2.1.
- **Acceptance criteria:** Open/Minimized/Closed state and message history live in memory for the session only; nothing is written to localStorage; a reload resets the panel to Closed (§2.1 Layer 4: history is per-session in memory; §13.x UI state not persisted).
- **Implementation notes:** §13.x explicitly says this UI state is not persisted and resets on reload (only `calendarMode` persists). Do not add an `inkling-*` storage key for panel state here. This keeps the shell decoupled from the preferences schema (which Settings, 3.3, will own).
- **Edge cases:** Reload mid-conversation → history gone by design (acceptable at shell stage); multiple tabs → independent in-memory state (no cross-tab sync).
- **UI/UX considerations:** Set expectations later if persistence is added; for now ephemeral is fine.
- **Data flow notes:** In-memory only; no persistence layer touched.
- **Testing notes:** Reload returns panel to Closed with empty history; no localStorage writes from the panel.
- **Performance notes:** Negligible.
- **Mobile vs desktop:** Identical.
- **Integration points:** §2.1, §13.x (UI state not persisted).

## 3.2.8 — Ensure panel overlays both 2D and 3D modes

- **Purpose:** Guarantee Inkling is available regardless of calendar mode.
- **Dependencies:** 3.2.1, 3.1.8.
- **Acceptance criteria:** The panel renders at z-index 200 (§8.6) above both the 3D canvas and the 2D calendar, and remains open and unchanged across a 2D↔3D mode switch (§1.3 note: Inkling layers on top of whichever mode is active).
- **Implementation notes:** Because both calendar containers persist and only toggle visibility (3.1.8), the panel — mounted in UIShell above them at z 200 — naturally overlays whichever is visible. A `modeChanged` (3.1.7) must not close or reset the panel; at most the AI later emits a contextual acknowledgment (§4.3), but the shell keeps its state.
- **Edge cases:** Mode switch while Open (panel stays Open, state intact); Alerts dropdown (z 300) correctly draws above Inkling; a modal (z 500) above both.
- **UI/UX considerations:** Continuity — switching the calendar underneath shouldn't disturb an in-progress chat.
- **Data flow notes:** `modeChanged` does not alter panel state in the shell (AI ack is later, §4.3).
- **Testing notes:** Panel stays open and on top across mode toggles; correct stacking vs Alerts/toasts/modals.
- **Performance notes:** No re-mount on mode switch.
- **Mobile vs desktop:** Identical guarantee.
- **Integration points:** §8.6, §1.3, §3.1 (3.1.8 visibility-toggle).

## 3.2.9 — Add basic styling per spec (glass, readable)

- **Purpose:** Match the app's glass-morphism language while keeping text legible (§1.4).
- **Dependencies:** 3.2.1, 3.2.4.
- **Acceptance criteria:** The panel uses the glass aesthetic (translucent, blurred) with readable contrast; message bubbles follow the §4.2 type styling (user accent, Inkling glass, system italic, error color); shares the styling tokens used by the Alerts dropdown (2.3.7).
- **Implementation notes:** Reuse the shared panel/glass tokens established in 2.3.7 so Inkling, Settings (3.3), and the Alerts dropdown stay visually consistent (no drift). §1.4/§1.6: aesthetics must never compromise readability — ensure contrast minimums against the translucent background. Settings shell (3.3) will reuse these same tokens.
- **Edge cases:** Busy 3D scene behind the glass reducing contrast → ensure a sufficient backing tint; low-end devices where heavy backdrop-blur janks → degrade blur gracefully (mirror 2.3.7).
- **UI/UX considerations:** "Glass, readable" — never sacrifice legibility for the effect.
- **Data flow notes:** Presentation only.
- **Testing notes:** Visual/snapshot + contrast check; message types visually distinct.
- **Performance notes:** Watch backdrop-blur cost, especially on mobile over the 3D canvas.
- **Mobile vs desktop:** Glass tuned per platform; tokens shared.
- **Integration points:** §4.2, §1.4, 2.3.7 shared tokens.

## 3.2.10 — Cross-check with spec §4.2

- **Purpose:** Confirm the Inkling shell matches §4.2 before the AI layer is wired in.
- **Dependencies:** 3.2.1–3.2.9.
- **Acceptance criteria:** Verified against §4.2 — anchoring (right desktop / bottom mobile), three states (Closed/Open/Minimized), open triggers (top-bar button + mobile FAB), close triggers (X / swipe-down / Escape), panel contents (history, input, send, clear-with-confirm, context indicator), and the four message types — plus §8.6 (z 200) and §8.7 (responsive). Deviations fixed or documented.
- **Implementation notes:** Walk §4.2 point by point. Confirm lifecycle emits match §13.2 (`inklingOpened` from the button, `inklingClosed` from the panel). Note explicitly what is intentionally deferred: AI message processing, system-event summaries (§4.3), and clear-history confirmation behavior — the shell renders the affordances but doesn't action them yet.
- **Edge cases:** Escape vs topmost-overlay precedence (3.2.6); reload resets to Closed (3.2.7); panel survives mode switch (3.2.8).
- **UI/UX considerations:** Confirm glass/readability holds with real-length placeholder content.
- **Data flow notes:** Confirms `inklingOpened`/`inklingClosed` wiring per §13.2; AI subscribers (§4.3) are stubbed for later.
- **Testing notes:** §4.2 checklist passes; lifecycle events emit correctly.
- **Performance notes:** N/A.
- **Mobile vs desktop:** Both anchorings/triggers verified (§8.7).
- **Integration points:** §4.2, §8.6, §8.7, §13.2.

---

### Milestone 3.2 — Definition of Done
- `InklingPanel` mounts in UIShell as a glass drawer (right on desktop, bottom on mobile) with Closed/Open/Minimized states, slide animation, message-list + input + send + context-indicator + clear affordances (§4.2), and the four §4.2 message-type styles — all shell-only, no AI wiring.
- Opens from the top-bar Inkling button / mobile FAB (emitting `inklingOpened`), closes on X / swipe-down / Escape (emitting `inklingClosed`), overlays both calendar modes at z-index 200 (§8.6) and survives mode switches, and keeps state/history in memory only (resets on reload).
- Styling reuses the shared glass tokens (2.3.7); AI behaviors are deferred to a later phase.
- Next: Milestone 3.3 — Settings Panel Shell.
