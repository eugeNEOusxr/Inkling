# Inkling + WordWeaver — Master Build Specification
### Version 2.0 — Expanded Production Architecture

> **Source of truth** for all Inkling / WordWeaver implementation.  
> Shorter summary: [INKLING_MASTER_BUILD_SPEC.md](./INKLING_MASTER_BUILD_SPEC.md) (§1–10 only).

---

## Table of Contents

1. Product Overview
2. Global Architecture
3. Data Model
4. Inkling AI Behavior
5. WordWeaver 3D Mode
6. Calendar 2D Mode
7. Alerts System
8. UI Shell
9. Starter Data
10. Implementation Guidelines
11. Component Tree
12. Data Flow Model
13. Event Propagation Model
14. AI Intent Classification Pipeline
15. AI Navigation Pipeline
16. 3D Rendering Pipeline
17. 2D Rendering Pipeline
18. State Synchronization Model
19. Error Recovery Model
20. Performance Optimization Plan
21. Theming System
22. Iconography System
23. Animation System
24. Input Handling System
25. Mobile Gesture System
26. Desktop Control System
27. Accessibility Plan
28. Testing Plan
29. Versioning Plan
30. Future Roadmap

---

## 1.0 Product Overview

### 1.1 Product Name

**Inkling + WordWeaver** — an AI-driven central calendar and thought engine.

### 1.2 Core Concept

Inkling + WordWeaver is a unified, AI-augmented time-management and personal knowledge system. It merges immersive 3D temporal navigation, traditional 2D calendar precision, and a conversational AI layer into a single coherent product.

The system is designed to make time feel spatial, navigable, and meaningful rather than administrative. Users do not merely "add events" — they explore time, receive AI-driven insight about how their time is being used, and interact with their schedule at multiple levels of abstraction simultaneously.

| Piece | Role | Primary File |
|-------|------|--------------|
| **Inkling** | Conversational AI brain and intent engine | `AIBrain.js`, `InklingPanel.js` |
| **WordWeaver** | Immersive 3D temporal world | `WordWeaverScene.js`, `DayBlock3D.js` |
| **2D Calendar** | Classic grid views for precision entry | `Calendar2D.js`, `MonthGrid2D.js` |
| **Alerts** | Time-based notifications and scheduling | `src/calendar/alerts/*` |
| **Timeline Model** | Single source of truth for all event data | `timelineModel.js` |

### 1.3 Primary Modes

The application operates in four primary modes. Modes are orthogonal: a user may be in 3D mode while also having the Inkling panel or Alerts dropdown open.

| Mode | Description | Default |
|------|-------------|---------|
| **3D Mode** | Immersive Three.js 3D year / month / day world | Yes |
| **2D Mode** | Traditional year / month / week / day grids | No |
| **Inkling Mode** | Conversational AI panel overlaid on current mode | Closed |
| **Alerts Mode** | Dropdown list of upcoming and triggered alerts | Closed |

**Mode State:** Stored in `calendarMode.js` as `calendarMode: "3d" | "2d"`. Persisted to `localStorage` so the user's last mode is restored on reload.

**Mode Transitions:** Animated. 3D → 2D fades the Three.js canvas out while fading the 2D DOM grid in. 2D → 3D reverses this. Duration: 400ms ease-in-out. Both systems remain instantiated in memory during transitions; only visibility changes.

**Inkling and Alerts** are panels that layer on top of whichever calendar mode is active. They do not replace the underlying calendar view.

### 1.4 Design Philosophy

- Time should feel spatial and navigable, not just listed.
- The AI should reduce cognitive load, not add to it.
- Every user action should have a clear, immediate visual response.
- Data integrity is paramount: the timeline model is never written to from multiple paths simultaneously.
- The product must be usable on both mobile (touch) and desktop (keyboard + mouse) without degrading.
- Aesthetic choices (3D glass panels, soft glows, atom glyphs) must never compromise readability or performance.

### 1.5 Target Platforms

- **Primary Desktop:** Chrome 110+, Firefox 115+, Safari 16.4+, Edge 110+
- **Primary Mobile:** iOS Safari 16+, Android Chrome 110+
- **Minimum Screen Width:** 320px (mobile); 768px (tablet); 1024px (desktop)
- **Minimum WebGL Support:** WebGL 1.0 required for 3D mode. If unavailable, the system falls back to 2D mode automatically and notifies the user.

---

## 2.0 Global Architecture

### 2.1 Layered Front-End Architecture

The application is organized as six distinct visual and logical layers. Each layer has a clear responsibility and communicates with others only through defined interfaces.

**Layer 1 — UI Shell**
Top bar, mode toggles, navigation buttons, panel triggers. Always visible. Contains no business logic. Dispatches user actions downward.

**Layer 2 — WordWeaver 3D Scene**
Three.js-based 3D rendering of the year layout. Visible only in 3D mode. Manages its own camera, lighting, and object lifecycle. Reads event data exclusively from the timeline model.

**Layer 3 — Calendar 2D Views**
DOM-based grid rendering of year, month, week, and day views. Visible only in 2D mode. Renders from the same data as the 3D scene. Must never be deleted or disabled when 3D changes are made.

**Layer 4 — Inkling Chat Panel**
Slide-in/slide-out conversational AI panel. Overlays the current calendar view. Maintains its own message history in memory per session.

**Layer 5 — Alerts Dropdown**
Overlay dropdown showing upcoming and triggered alerts. Triggered from the top bar. Managed by the Alerts Scheduler.

**Layer 6 — Settings Panel**
Slide-in panel for user preferences, theme selection, and data management. Does not interact with the timeline model directly.

### 2.2 Core Logic Modules

**Timeline Model (`timelineModel.js`)**
The authoritative data layer. All reads and writes to event data pass through this module. Exposes well-defined helpers. No other module writes to `localStorage` for event data.

**AI Layer (`AIBrain.js`)**
Handles natural language processing, intent classification, event structuring, and summary generation. Communicates with the external AI API. Results are always validated before being applied to the timeline model.

**Scheduler (`alerts/Scheduler.js`)**
Polls or uses `setTimeout`-based scheduling to check for upcoming alerts. Fires events into the event bus when alerts trigger. Does not modify event data; only reads alert times.

**Event Bus (`eventBus.js`)**
A lightweight pub/sub system. All cross-module communication happens through the event bus. No module imports another module's internal state directly.

**Persistence Layer**
localStorage-based storage accessed exclusively through the timeline model and preferences module. Never accessed directly from UI components.

### 2.3 Rendering Systems

**3D Rendering**
- Engine: Three.js (r152 minimum)
- Scene root: `WordWeaverScene.js`
- Day representation: `DayBlock3D.js` (instanced where possible)
- Decorative elements: `AtomGlyph3D.js`
- Camera: `PerspectiveCamera` with `OrbitControls` (desktop) and custom touch controls (mobile)
- Renderer: `WebGLRenderer` with antialias enabled, pixel ratio capped at 2.0

**2D Rendering**
- Engine: DOM + CSS
- Root: `Calendar2D.js`
- Sub-components: `MonthGrid2D.js`, `WeekGrid2D.js`, `DayCell2D.js`
- No canvas or SVG used in 2D views; pure DOM for accessibility and resize flexibility

**Shared Data Contract**
Both rendering systems query event data exclusively through `timelineModel.js` helpers. Neither system holds its own copy of events. On any timeline mutation, both systems receive an update event via the event bus and re-render their visible portions.

### 2.4 Module Communication Rules

- UI Shell → Event Bus → Core Logic Modules
- Core Logic Modules → Event Bus → Rendering Systems
- Rendering Systems → Event Bus → UI Shell (for feedback only, e.g., badge counts)
- No rendering system imports directly from another rendering system
- No AI module writes to the timeline model without first going through a validation step in `timelineModel.js`
- `AIBrain.js` never reads from `localStorage` directly; it always goes through `timelineModel.js`

---

## 3.0 Data Model

### 3.1 Event Structure

Every piece of user-created time information is represented as an `Event` object. This is the atomic unit of the entire system.

```ts
type EventType = "note" | "appointment" | "task" | "alert";

type Category =
  | "study"
  | "work"
  | "health"
  | "finance"
  | "errands"
  | "creative"
  | "personal"
  | "appointment"
  | "deadline"
  | "reminder";

type Priority = 0 | 1 | 2 | 3;
// 0 = low (informational)
// 1 = normal (default)
// 2 = high (time-sensitive)
// 3 = critical (must not be missed)

interface Alert {
  time: string;         // ISO 8601 datetime string (event-local time for linked alerts)
  kind: "popup" | "sound";
  triggered: boolean;   // true when all scheduled phases have fired (derived from firedPhases in the linked store)
  dismissed: boolean;   // true once the user has dismissed it
}

// Runtime (Milestone 2.2): authoritative alert records live in `inkling-alerts-v1`
// (`src/calendar/alerts/alertsModel.js`), linked to timeline events via `timelineEntryId`.
// Priority drives multi-phase lead times (e.g. CRITICAL: 60/30/10/5/0 min before event time).
// `Event.alerts[]` may hold optional/link fields; the separate alerts store is source of truth.

interface AIMetadata {
  summary?: string;                       // Short AI-generated sentence summarizing the event
  estimatedDurationMinutes?: number;      // AI estimate of how long this will take
  inferredCategory?: Category;            // Category inferred from body text
  confidence?: number;                    // 0.0–1.0 confidence in inferred category
  lastProcessedAt?: string;               // ISO timestamp of last AI processing pass
}

interface Event {
  id: string;                 // UUID v4
  type: EventType;
  title: string;              // Max 120 characters
  body: string;               // Free-form text; supports markdown-lite (bold, italic, lists)
  startTime: string;          // ISO 8601 datetime
  endTime: string | null;     // null for open-ended events (notes, reminders)
  category: Category;
  priority: Priority;
  alerts: Alert[];
  createdAt: string;          // ISO 8601 datetime; set once at creation
  updatedAt: string;          // ISO 8601 datetime; updated on every mutation
  aiMetadata?: AIMetadata;
}
```

**Field Constraints and Validation Rules:**

- `id`: Generated by `timelineModel.js` using `crypto.randomUUID()`. Never user-supplied.
- `title`: Required. Trimmed. Empty title is rejected with a validation error.
- `body`: Optional. May be empty string.
- `startTime`: Required. Must be a valid ISO 8601 string. Validated on write.
- `endTime`: If provided, must be after `startTime`. Validated on write. Null is allowed.
- `category`: Must be one of the defined Category literals. Defaults to `"personal"` if not supplied.
- `priority`: Must be 0, 1, 2, or 3. Defaults to 1.
- `alerts`: Array may be empty on the Event object (optional). Runtime alerts are stored in `inkling-alerts-v1` and linked by `timelineEntryId`. When present on Event, each alert's `time` must be before `endTime` (or `startTime` if `endTime` is null).
- `createdAt`: Set by `timelineModel.js` on `createEvent()`. Never overwritten.
- `updatedAt`: Set by `timelineModel.js` on every mutation. Never manually set by callers.

### 3.2 Derived Structures

The timeline model exposes derived views over the raw event array. These are computed on demand and never stored separately.

**Day:** All events where `startTime` falls within a given calendar date (00:00:00–23:59:59 local time).

**Week:** All events for the 7-day period starting from a given ISO week start date (Monday).

**Month:** All events for the given calendar month and year.

**Year:** All events for the given calendar year.

**Helpers (exported from `timelineModel.js`):**

```
getEventsForDate(date: Date): Event[]
getEventsForDay(year: number, month: number, day: number): Event[]
getEventsForWeek(year: number, isoWeek: number): Event[]
getEventsForMonth(year: number, month: number): Event[]
getEventsForYear(year: number): Event[]
getUpcomingAlerts(withinMinutes: number): { event: Event, alert: Alert }[]
getUnifiedEventsForDate(date: Date): Event[]  // Used by both 3D and 2D layers
```

All helper functions must be pure (no side effects) and return new arrays (never mutate stored data).

### 3.3 Timeline Model Internal Structure

The timeline model maintains a single in-memory array: `_events: Event[]`. This array is the authoritative state.

**Initialization:**
1. On startup, `timelineModel.init()` reads from `localStorage` key `inkling-timeline-v1`.
2. If no data exists, starter events are loaded from the `starterNotes` constant.
3. The `_events` array is populated and sorted by `startTime` ascending.
4. An `initialized` event is emitted on the event bus.

**Mutations:**
All mutations go through one of these functions:
- `createEvent(partial: Partial<Event>): Event` — validates, assigns `id`, `createdAt`, `updatedAt`, pushes to array, persists, emits `eventCreated`.
- `updateEvent(id: string, changes: Partial<Event>): Event` — validates, merges, updates `updatedAt`, persists, emits `eventUpdated`.
- `deleteEvent(id: string): void` — removes from array, persists, emits `eventDeleted`.
- `bulkCreateEvents(partials: Partial<Event>[]): Event[]` — batch version of `createEvent`. Used for starter data import.

**Persistence:**
After every mutation, the full `_events` array is serialized to JSON and written to `localStorage` under `inkling-timeline-v1`. Serialization is synchronous and happens before the event bus emit.

**Concurrency:**
Because this is a single-tab web app, no multi-writer concurrency is expected. A simple mutex flag (`_writing: boolean`) guards against re-entrant writes during batch operations.

**Storage Size Guard:**
Before writing, estimate the serialized size. If it approaches 4.5MB (leaving buffer below the 5MB localStorage limit), emit a `storageWarning` event. If it exceeds 4.9MB, reject the write and emit a `storageFull` error event.

### 3.4 Storage Schema

| Key | Value | Notes |
|-----|-------|-------|
| `inkling-timeline-v1` | JSON array of `Event[]` | Primary event store |
| `inkling-preferences-v1` | JSON object of user preferences | Theme, mode, etc. |
| `inkling-has-user-notes` | `"true"` or absent | Controls starter data removal |
| `inkling-calendar-mode` | `"3d"` or `"2d"` | Last active calendar mode |
| `inkling-last-focused-date` | ISO date string | Last date the user explicitly navigated to |

### 3.5 Event Lifecycle

```
User Action / AI Command
        |
        v
timelineModel.createEvent() / updateEvent() / deleteEvent()
        |
   [Validation]
        |
   [Mutation applied to _events array]
        |
   [Serialized to localStorage]
        |
   [Event Bus: eventCreated / eventUpdated / eventDeleted]
        |
   [WordWeaverScene re-renders affected DayBlock3D]
   [Calendar2D re-renders affected cell/view]
   [InklingPanel receives system event if Inkling is open]
   [Scheduler re-evaluates upcoming alerts]
```

---

## 4.0 Inkling AI Behavior

### 4.1 Overview

Inkling is the conversational AI layer of the system. It is not a general-purpose chatbot. Its domain is the user's time, calendar, and schedule. It can create, edit, query, and summarize events; navigate the calendar; suggest scheduling improvements; and respond intelligently to system events.

Inkling communicates with the AI API via `AIBrain.js`. All API calls are made server-side or through a secure proxy — no API keys are ever exposed to the client.

### 4.2 Inkling Panel UI

The Inkling panel is a slide-in drawer anchored to the right side of the screen on desktop and the bottom of the screen on mobile.

**States:** Closed (default), Open (full), Minimized (header bar only, showing last message).

**Open Trigger:** Inkling button in the top bar, or the floating action button (FAB) on mobile.

**Close Trigger:** X button, swipe-down on mobile, or pressing Escape on desktop.

**Panel Contents:**
- Message history (scrollable, newest at bottom)
- Input field (single-line, expandable to multi-line on long input)
- Send button
- Clear history button (confirmation required)
- Context indicator (shows which date/event Inkling is currently focused on)

**Message Types:**
- User message (right-aligned, accent color bubble)
- Inkling message (left-aligned, glass-morphism bubble)
- System event notification (centered, subtle, italic)
- Error message (left-aligned, error color, with retry option)

### 4.3 Inputs Inkling Accepts

**Direct user input:**
- Natural language commands: "Add a dentist appointment tomorrow at 3pm"
- Queries: "What do I have on Friday?"
- Navigation: "Go to next month"
- Editing: "Change my 2pm meeting to 4pm"
- Deletion: "Remove the dentist appointment"
- Summaries: "Summarize my week"
- Suggestions: "What should I prioritize today?"

**System events (automatically received, not user-typed):**

| Event Name | Trigger | Inkling Response |
|------------|---------|-----------------|
| `alertsOpened` | User opens Alerts dropdown | Summarize upcoming alerts |
| `alertTriggered` | An alert fires | Notify user; offer to snooze or dismiss |
| `dayFocused` | User navigates to a day | Summarize that day's events |
| `weekFocused` | User navigates to a week | Summarize the week |
| `monthFocused` | User navigates to a month | High-level month summary |
| `modeChanged` | User switches 2D/3D | Brief contextual acknowledgment |
| `eventCreated` | Any event is created | Confirm creation; offer to add details |
| `eventUpdated` | Any event is updated | Confirm update |

System events are injected into Inkling's context automatically. If the Inkling panel is closed, system event responses are queued and shown when the panel is next opened, unless they are time-sensitive (e.g., `alertTriggered`), in which case a non-intrusive badge or toast is shown.

### 4.4 AI Reasoning Flow

```
User Message Received
        |
        v
[Pre-processing]
 - Trim whitespace
 - Detect language (future: multi-language support)
 - Append current date/time context
 - Append current focused date/view context
 - Append relevant recent events from timeline model
        |
        v
[Intent Classification] (see Section 14)
 - Classify: CREATE | UPDATE | DELETE | QUERY | NAVIGATE | SUMMARIZE | SUGGEST | CHITCHAT
        |
        v
[Slot Filling]
 - Extract entities: date, time, title, category, priority, duration, recurrence
 - If slots are missing and required, enter clarification loop
        |
        v
[Action Execution]
 - Call appropriate timeline model function
 - Or call navigation function
 - Or generate summary
        |
        v
[Response Generation]
 - Compose natural language confirmation or answer
 - Include structured data reference (e.g., event title) in response
        |
        v
[Response Delivered to InklingPanel]
```

### 4.5 Inkling Capabilities

**Classification (`classifyEvent` in `AIBrain.js`)**
Given a raw text input or event body, infer the `category` and `type`. Returns `{ category, type, confidence }`. Used both for new event creation and for re-classifying existing events.

**Daily Summary**
Given a `Date`, retrieve events for that day, then generate a 2–3 sentence natural language summary. Emphasize dominant category, total event count, and any high-priority items. Returned as a string. Used in DayBlock3D content and Inkling panel responses.

**Weekly Summary**
Given a week identifier, retrieve all events for the week, group by category, identify overloaded days, and return a structured summary with highlights and warnings (e.g., "Wednesday looks very heavy with 6 appointments").

**Monthly Summary**
High-level overview: busiest days, dominant categories, upcoming deadlines, total event counts by type.

**Navigation**
Inkling can direct the calendar to navigate to a specific date, week, or month. Navigation commands are dispatched via the event bus as `navigateTo` events, which `WordWeaverScene.js` (3D) and `Calendar2D.js` (2D) both listen for.

**Suggestions**
Inkling can proactively suggest: scheduling a break after a dense cluster of events, moving a low-priority task to a less busy day, flagging a missed deadline, or noting an upcoming high-priority event.

**Auto-structuring**
When a user pastes or types a block of unstructured text (e.g., "meeting with John on tuesday 3pm re: Q4 budget, bring projections"), Inkling parses and extracts a fully structured `Event` object and presents it for confirmation before committing.

### 4.6 Clarification Loop

If Inkling cannot extract a required slot (e.g., date or title) from a user command, it enters the clarification loop:

1. Respond with a specific question: "What date should I schedule this for?"
2. Wait for user response.
3. Merge clarification with original command.
4. Re-run intent classification and slot filling.
5. Maximum 2 clarification rounds before asking the user to rephrase.

### 4.7 Error Handling in AI Responses

- If the AI API returns an error (network failure, rate limit, etc.): display a user-facing error message with a retry button. Do not show raw error codes.
- If the AI returns a response that cannot be parsed into a valid action: treat as CHITCHAT and respond gracefully ("I didn't quite catch that. Could you rephrase?").
- If the AI attempts to create an event with invalid data (e.g., `endTime` before `startTime`): catch the validation error from `timelineModel.js`, do not apply the mutation, and tell the user what went wrong.
- All AI errors are logged internally (non-blocking, non-shown to user unless actionable).

### 4.8 Inkling Rules

- Inkling **must** use the timeline model exclusively for all reads and writes.
- Inkling **must not** bypass data helper functions.
- Inkling **must** respond to all defined system events.
- Inkling **must not** hallucinate event details. If it cannot find an event, it says so.
- Inkling **must not** take destructive actions (delete, bulk delete) without explicit user confirmation.
- Inkling **must** always confirm successful mutations with the affected event's title and time.

---

## 5.0 WordWeaver 3D Mode

### 5.1 Overview and Philosophy

WordWeaver is the immersive 3D view of the user's year. The goal is to make the user feel as though they are physically present inside their calendar — flying through months, zooming into days, and seeing their time as a spatial landscape rather than a flat grid.

The 3D world is powered by Three.js. It is rendered in a `<canvas>` element that fills the viewport behind the UI shell layer. The scene persists in memory as long as the app is open; it is not destroyed when switching to 2D mode.

### 5.2 Scene Initialization

`WordWeaverScene.js` is responsible for initializing and managing the entire Three.js scene.

**Initialization sequence:**
1. Create `WebGLRenderer` with antialias, alpha enabled.
2. Set `pixelRatio` to `Math.min(window.devicePixelRatio, 2)`.
3. Create `PerspectiveCamera` (FOV 60, near 0.1, far 1000).
4. Position camera at origin-offset for year overview.
5. Create `AmbientLight` (intensity 0.4) and one `DirectionalLight` (intensity 0.8, positioned top-right-front).
6. Add subtle `HemisphereLight` (sky: pale blue, ground: dark grey, intensity 0.3) for soft fill.
7. Call `createYearLayout()` to build all 12 month clusters.
8. Start animation loop (`requestAnimationFrame`).
9. Register resize handler.

**WebGL Fallback:**
Before initializing, detect WebGL support. If unavailable, set `calendarMode` to `"2d"`, show a one-time notification to the user, and skip 3D initialization entirely.

### 5.3 Year Layout

`createYearLayout()` constructs the 3D representation of the entire year.

**Layout geometry:**
- 12 month clusters are placed in a ring around the world origin.
- Ring radius: 80 world units.
- Each cluster is rotated `(monthIndex / 12) * 2π` radians around the Y axis.
- Clusters face inward (toward origin) by default; camera starts outside the ring looking in.

**Month cluster contents:**
- Month label: `TextGeometry` or billboard sprite, centered above the cluster.
- Day grid: 7 columns × 4 or 5 rows of `DayBlock3D` instances.
- Day blocks start at the 1st of the month; empty cells before and after the month are rendered as invisible/dimmed blocks to maintain grid alignment.
- 2–4 `AtomGlyph3D` decorations floating around the cluster perimeter.

**Instance optimization:**
- All `DayBlock3D` objects sharing the same material configuration (same category color, same glass properties) are merged into `InstancedMesh` groups where possible.
- `AtomGlyph3D` objects use a single shared `SphereGeometry` and shared `MeshStandardMaterial`.
- Month labels use pre-rasterized canvas textures to avoid per-frame `TextGeometry` updates.

### 5.4 DayBlock3D

`DayBlock3D` represents a single calendar day in the 3D scene.

**Geometry:**
- Base: `BoxGeometry(2, 2.5, 0.15)` — a thin rectangular panel.
- Rounded corners: achieved via a `RoundedBoxGeometry` from the Three.js extended library.

**Material:**
- `MeshPhysicalMaterial` with `transmission: 0.7`, `roughness: 0.1`, `metalness: 0.0`, `thickness: 0.5`.
- This produces a clean glass-panel effect.
- **No cracked textures, no fracture shaders, no distortion effects.**
- `emissive`: Set to the dominant category color for the day.
- `emissiveIntensity`: 0.25 at rest, 0.6 on hover, 0.9 on focus.

**Content rendering:**
DayBlock3D uses a `CanvasTexture` as a `map` overlay on the glass panel for text content. The canvas is updated when the day's data changes.

Canvas content (rendered as 2D canvas):
- Day number (top-left, small, light grey)
- AI daily summary sentence (below day number, small, white, truncated to 2 lines)
- Up to 3 event rows: category icon + time string + title (truncated)
- If more than 3 events: "…+N more" indicator
- Alert indicator: ⏰ icon in the top-right corner if any alert exists for the day

**Canvas texture resolution:** 256×320 pixels (2× retina: 512×640 for `devicePixelRatio > 1`).

**State transitions:**
- Rest: `emissiveIntensity: 0.25`
- Hovered (raycaster intersection): `emissiveIntensity: 0.6`, slight Y-axis translation (+0.1 units), transition duration 150ms
- Focused (tapped/clicked): `emissiveIntensity: 0.9`, camera pans to center on this block, day detail panel opens

**Content update trigger:**
When `eventCreated`, `eventUpdated`, or `eventDeleted` fires on the event bus, `WordWeaverScene.js` identifies which `DayBlock3D` instances are affected by date and queues a canvas re-render for them. Re-renders are batched to the next animation frame.

### 5.5 AtomGlyph3D

`AtomGlyph3D` is a decorative 3D element — a slowly rotating atom-like structure made of a central sphere with orbital rings.

- Central sphere: `SphereGeometry(0.3, 16, 16)`, `MeshStandardMaterial` with slight emissive.
- Orbital rings: 2–3 `TorusGeometry` of varying radii, rotated at different axis orientations.
- Animation: Each ring rotates at a distinct slow speed (0.002–0.008 radians per frame) around a randomized axis.
- Placement: 2–4 per month cluster, positioned at the corners or edges of the day grid.
- Purpose: Visual depth and ambient life. No interactive function.
- Performance: All `AtomGlyph3D` instances share a single `SphereGeometry` reference and two `TorusGeometry` references via instancing. Materials are shared per-color.

### 5.6 Camera System

**Camera type:** `PerspectiveCamera`, FOV 60°, aspect updated on resize, near 0.1, far 2000.

**Controls (desktop):** `OrbitControls` from Three.js.
- Left mouse drag: orbit
- Right mouse drag: pan
- Scroll wheel: zoom
- WASD keys: fly-mode translation (W forward, S back, A left, D right)
- Q/E keys: elevate/descend
- R key: reset camera to year overview position

**Controls (mobile):** Custom touch gesture handler (not `OrbitControls`).
- Single-finger drag: rotate/orbit
- Two-finger pinch: zoom
- Two-finger drag: pan
- Thumb slide forward (specialized mobile control): fly forward
- Fly button (UI overlay): hold to fly forward continuously
- Descend button (UI overlay): hold to descend

**Camera positions:**
- Year overview: position `(0, 60, 120)`, looking at `(0, 0, 0)`
- Month focus: position translated to `~20` units in front of the selected month cluster
- Day focus: position close to the selected `DayBlock3D`, framing it in the center

**Camera transitions:**
All camera movements are animated using a lerp approach:
- `camera.position.lerpTo(targetPosition, factor)` applied each animation frame
- `controls.target.lerpTo(targetLookAt, factor)`
- Factor: 0.08 per frame (smooth but not sluggish)
- Snap threshold: if distance to target is < 0.01 units, snap to exact target

**Focusing logic:**
- `focusOnDay(monthIndex, dayIndex)`: calculates world position of the specific `DayBlock3D`, sets camera target, opens day detail panel.
- `focusOnMonth(monthIndex)`: moves camera to face the month cluster from ~20 units out, no panel opened.
- `focusOnToday()`: calls `focusOnDay` with today's month and day indices.
- `focusOnNextEvent()`: finds the next upcoming event, calls `focusOnDay` for its date.
- `focusOnCategory(category)`: navigates to the next day containing an event of that category.

### 5.7 Interaction Model (3D)

**Raycasting:**
A `Raycaster` is updated each animation frame from the current mouse/touch position. It tests against all `DayBlock3D` meshes. Only the first intersection is acted upon.

**Hover:**
When the raycaster intersects a `DayBlock3D`, that block enters hover state (emissive increase, Y translation). The cursor changes to pointer. A tooltip showing the day number and event count appears near the cursor.

**Click/Tap:**
On click (desktop) or tap (mobile), the focused `DayBlock3D` triggers `focusOnDay()`. If a day is already focused and the user clicks it again, the day detail panel opens (if not already open).

**Month label click:**
Clicking a month label triggers `focusOnMonth()`. The camera animates to view the cluster from a comfortable distance.

**Empty day blocks (days outside current month):**
Non-interactive. Rendered as invisible or nearly transparent panels. Raycaster ignores them.

**Keyboard navigation (desktop):**
- Arrow keys: move focus between adjacent day blocks
- Enter: focus on the currently keyboard-focused day
- Escape: return camera to month overview, then year overview

### 5.8 3D Background

- Background: deep dark blue-black gradient (`scene.background = new THREE.Color(0x04040f)` or similar).
- No cracked-reality visuals.
- No skybox with fracture textures.
- Only subtle floating `AtomGlyph3D` elements in the scene space outside month clusters serve as ambient decoration.
- Subtle post-processing (optional, performance-gated): very slight `UnrealBloomPass` on emissive elements only, with threshold 0.8, strength 0.3. Disabled on mobile.

---

## 6.0 Calendar 2D Mode

### 6.1 Overview

The 2D calendar provides traditional, precision-focused grid views of the user's schedule. It exists as a fully functional, independent rendering system. It must never be deleted, disabled, or treated as a secondary feature. Many users will prefer 2D mode for data entry and detailed review.

All 2D views share the same data from `timelineModel.js`. Switching between 2D sub-views (year/month/week/day) does not change the underlying calendar mode (`calendarMode`).

### 6.2 Year View

A 3×4 grid of month mini-calendars, representing the entire selected year.

**Layout:**
- 3 columns, 4 rows
- Each cell: month name (bold, top), 7-column day-of-week header (S M T W T F S), day number grid
- Day cells in year view are small (tap target minimum 28×28px on mobile)

**Visual indicators per day:**
- Category dots: up to 4 colored dots below the day number indicating event categories present
- Heatmap tint: background color of the day cell scales with event density (more events = deeper tint)
- Alert icon: small ⏰ if any alert exists for that day
- Today indicator: circle or underline on today's date

**Interaction:**
- Tapping a month name navigates to Month View for that month
- Tapping a day navigates to Day View for that day
- Year nav: left/right arrows to navigate to previous/next year

### 6.3 Month View

A 7-column grid representing a single month.

**Layout:**
- 7 columns (Sunday–Saturday or Monday–Sunday, based on user preference)
- 4–6 rows depending on month
- Day cells sized to fill available viewport height
- Days outside the current month: dimmed, non-interactive beyond navigation

**Day cell content:**
- Day number (top-right)
- Up to 3 event pills (colored bar with title text, truncated)
- "…+N more" link if more than 3 events exist
- Alert icon if alerts exist for the day
- Category dots below events

**Interaction:**
- Tapping an event pill opens the Event Detail panel
- Tapping a day number navigates to Day View
- Tapping "+N more" opens a popover listing all events for that day
- Month nav: left/right arrows for previous/next month
- Today button: jump to current month and highlight today

### 6.4 Week View

7 days displayed side by side with a time-based vertical axis.

**Layout:**
- Header row: day abbreviation + date number for each of 7 days
- Vertical axis: 24-hour or 6am–10pm range (configurable), 30-minute increments
- Each day column shows events as positioned blocks from their `startTime` to `endTime`
- All-day events in a dedicated row at the top of the column
- Events with no `endTime` are rendered as 30-minute blocks

**Event blocks:**
- Width: 95% of column width
- Background: category color (see Theming, Section 21)
- Text: title (truncated), time range
- Overlapping events: columns within a day column, each slightly narrower

**Interaction:**
- Click/tap an event block: open Event Detail panel
- Click/tap empty time slot: open New Event form pre-filled with that date and time
- Drag event block (desktop): move event to new time (updates `startTime` and `endTime` proportionally)
- Resize event block bottom edge (desktop): extend/shorten `endTime`
- Week nav: left/right arrows for previous/next week
- Today button: jump to current week

### 6.5 Day View

A single day with a detailed vertical timeline.

**Layout:**
- Same vertical time axis as Week View but full width
- Events displayed as wide blocks
- Side margin for hourly labels
- Current-time indicator line (red horizontal line for today)

**Event blocks:**
- Full column width (minus padding)
- Category color left border accent
- Title (full, not truncated)
- Time range
- Body preview (first 80 characters)
- Priority indicator (colored dot or bar)

**Interaction:**
- Tap event: open Event Detail panel
- Tap empty slot: open New Event form
- Swipe left/right (mobile): navigate to next/previous day
- Day nav: arrow buttons

### 6.6 Event Detail Panel

A slide-in panel (desktop: right side; mobile: bottom sheet) showing full event details.

**Contents:**
- Title
- Date and time range
- Category badge
- Priority indicator
- Body text (full, with markdown-lite rendering)
- Alert list
- AI metadata (summary, estimated duration) if present
- Edit button
- Delete button (with confirmation)
- "Ask Inkling" button (opens Inkling panel focused on this event)

**Edit Mode:**
All fields become editable inline. Save and Cancel buttons appear. On Save, `updateEvent()` is called. On Cancel, changes are discarded.

### 6.7 New Event Form

A modal or panel for creating a new event.

**Fields:**
- Title (required)
- Type selector (note / appointment / task / alert)
- Date picker
- Start time picker
- End time picker (optional)
- Category selector (dropdown with color/icon)
- Priority selector (0–3, visual)
- Body text area
- Alert adder (add multiple alerts with time and kind)
- "Let Inkling fill this in" button: pastes clipboard or typed description into Inkling for auto-structuring

**Validation:**
Real-time validation on all required fields. Save button disabled until form is valid. Inline error messages per field.

### 6.8 2D Synchronization with 3D

When the user is in 2D mode and navigates to a date, the 3D scene's internal focused date is updated silently. When the user switches back to 3D mode, the camera animates to the last date the user was viewing in 2D. This creates a seamless transition experience.

---

## 7.0 Alerts System

### 7.1 Architecture

The Alerts system consists of three parts:
- **Storage:** Authoritative alert records in `inkling-alerts-v1` (`src/calendar/alerts/alertsModel.js`), each linked to a timeline event via `timelineEntryId`. `Event.alerts[]` on the timeline is optional/link-only — not the runtime source of truth.
- **Scheduler:** `alertsScheduler.js` manages a single `setTimeout` to the soonest trigger (B3: plus `visibilitychange` recompute on wake; no active 15s polling).
- **UI:** The Alerts dropdown and badge in the top bar.

**Multi-phase triggers:** Alert priority selects lead-time phases before the event time (e.g. CRITICAL: 60, 30, 10, 5, and 0 minutes). Each phase fires once; `firedPhases[]` deduplicates. `triggered` means all phases for that alert have fired.

### 7.2 Scheduler

`alertsScheduler.js` subscribes on the canonical event bus (`src/utils/EventBus.js`) to `initialized`, `eventCreated`, `eventUpdated`, and `eventDeleted`. It does not use `setInterval` polling while the app is active; it arms one `setTimeout` to the soonest due phase (overflow-clamped). On `visibilitychange` → visible, it recomputes and processes due triggers (mobile backgrounding safety net).

**Scheduler logic:**

```
On initialized or timeline mutation (bus):
  1. Call alertsModel.getUpcomingAlerts (7-day horizon)
  2. Find the soonest un-fired phase within the 90s catch window
  3. clearTimeout(currentTimer)
  4. setTimeout(() => fire phase, msUntil)  // clamped; overflow → max delay then re-arm
```

**On alert fire:**
1. Mark the phase in `firedPhases[]` via `markAlertPhaseFired()` (persisted in `inkling-alerts-v1` with storage guards).
2. Emit `alertTriggered { event, alert }` on the canonical event bus (resolve `event` via `timelineEntryId`).
3. Show notification per `alert.kind` (popup vs sound); transitional `inkling:alert-fired` on document until 2.3 UI migration.
4. Re-arm for the next upcoming phase.

**Snooze:**
Snooze (5, 10, or 30 minutes) sets `snoozeFireAt` on the alert record — an additional phase fires at that time. Prior fired phases remain recorded.

**Dismiss:**
Sets `dismissed: true` on the alert record. The alert no longer schedules or appears in upcoming lists.

**Delete:**
On `eventDeleted`, alerts with matching `timelineEntryId` are removed from `inkling-alerts-v1`.

### 7.3 Alerts Dropdown UI

The Alerts dropdown is a fixed-position panel anchored below the Alerts button in the top bar.

**Contents:**
- Section header: "Upcoming Alerts"
- Alert list: sorted by `alert.time` ascending
- Per alert: event title, time-until string ("in 15 minutes"), alert kind icon
- Snooze and Dismiss actions per alert
- If no upcoming alerts: "No upcoming alerts" empty state with icon

**Badge:**
The Alerts button in the top bar shows a badge with the count of upcoming, un-dismissed alerts within the next 24 hours. Badge updates whenever the timeline model changes or an alert is dismissed.

**AI integration:**
When the Alerts dropdown opens, an `alertsOpened` system event is sent to Inkling. If Inkling is open, it generates a brief summary of the upcoming alerts. If Inkling is closed, the summary is queued.

### 7.4 Sound Alerts

When `alert.kind === "sound"`, the system plays a short audio notification. Implementation: a short pre-loaded `AudioContext`-based tone or a pre-loaded `.mp3` asset. Web Audio API is preferred for no-latency playback. The tone is a gentle, non-jarring sound (not a system alarm). User can disable sound alerts in Settings.

### 7.5 Popup Alerts

When `alert.kind === "popup"`, a toast notification appears in the top-right corner (desktop) or top of screen (mobile). Toast shows event title, time, and Snooze/Dismiss buttons. Auto-dismisses after 30 seconds if no action is taken (does not mark as dismissed — remains in Alerts dropdown).

### 7.6 Missed Alerts

If the app is closed when an alert would have fired, the next time the app opens, the Scheduler classifies phases with `fireAt` more than 90 seconds in the past (beyond the catch window) and not in `firedPhases` as **missed** — surfaced in the Alerts dropdown, not fired late.

---

## 8.0 UI Shell

> **Phase 3.1 amendment (Milestone 3.1 — Shell, Nav & Mode State):** The live shell is the **composition** of `InklingBottomNav`, `NavigationBar`, `WindowManager` / `AppLauncher` / `MinimizeBar`, panels, and `calendarMode` — **not** a separate `UIShell.js`. Navigation is **mobile-first single-panel**: each bottom-nav icon opens **one** full-screen surface; only one is visible at a time; **re-tap** the active icon closes to the **cosmos idle backdrop** (procedural starfield; optional image via `setCosmosBackdropImage`). Inkling opens **only** from its own tab. Both 2D and 3D renderers stay **instantiated**; the inactive renderer is **fully hidden** (not dimmed-through). **App tabs** (bottom nav) are distinct from **view levels** (top bar Today · Week · Month · Year → `navigateTo` on the canonical bus) and from **`calendarMode`** (2D/3D toggle inside WordWeaver only).

### 8.1 Top Bar

The top bar is always visible at the top of the viewport (56px desktop / 48px mobile). It is **secondary** to the bottom app-tab bar on mobile.

**Layout (desktop and mobile, contextual):**
- App logo / month block (existing chrome)
- **View level** (not app tabs): Today · Week · Month · Year — emit `navigateTo { date, level }` on the canonical bus; do not switch app tabs or `calendarMode`
- **Alerts:** bell icon + 24h badge (§7.3)
- **2D / 3D** segmented control when WordWeaver (or calendar context) is active — sets `calendarMode` only; §1.3 transition
- Settings

**View levels:** "Today" → `navigateTo { date: today, level: "day" }`. Week / Month / Year change focus level without opening the Inkling app tab.

**2D/3D toggle:** WordWeaver tab only (internal view mode). The **Calendar** app tab does **not** force `calendarMode`.

### 8.2 Bottom Navigation (Mobile-first app tabs)

Primary navigation on all breakpoints (thumb-reachable). Five **app tabs** — only one surface active:

| Tab | Surface |
|-----|---------|
| Calendar | Scheduling shell: small calendar + clock-insert / `calendar-max` layer |
| Writer | Notebook writer panel |
| WordWeaver | 3D immersive embed (`calendarMode` 2D/3D toggle is internal) |
| Alerts | Alerts dropdown / sheet (§7.3) |
| Inkling | Inkling panel (only way to open Inkling chat) |

**Re-tap** the active tab → close to **cosmos idle backdrop** (not Inkling). View levels (Today/Week/Month/Year) remain on the **top bar**, not duplicated here.

### 8.3 Inkling Panel

Described in detail in Section 4.2.

### 8.4 Settings Panel

A slide-in panel from the right side (desktop) or a full-screen modal (mobile).

**Sections:**
- **Display:** Theme selector (see Section 21), calendar mode default, first day of week (Sunday/Monday)
- **Notifications:** Enable/disable sound alerts, enable/disable popup alerts
- **Data:** Export events (JSON download), Import events (JSON upload), Clear all data (destructive, confirmation required)
- **AI:** Inkling sensitivity (how proactively Inkling responds to system events)
- **About:** App version, acknowledgments

### 8.5 Event Detail Panel

Described in Section 6.6.

### 8.6 Panel Z-Index Stack

| Layer | Z-Index | Element |
|-------|---------|---------|
| Base | 0 | Notebook `#three-canvas` (Calendar tab) / WordWeaver mount |
| Cosmos idle | 5 | `#cosmos-backdrop` when no app tab active |
| Shell | 100 | Top bar |
| Panels | 200 | Inkling, Settings, Event Detail |
| Alerts Dropdown | 300 | Alerts overlay |
| Toasts | 400 | Alert toasts |
| Modals | 500 | Confirmation dialogs |

### 8.7 Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Mobile | < 640px | **Primary:** bottom app tabs; each active surface is **full-screen and scrollable** (no x/y cut-off). Compact top bar (view levels + bell). Cosmos idle when no tab active. |
| Tablet | 640px–1023px | Same single-panel default; richer top chrome; panels up to ~50% width where applicable |
| Desktop | 1024px+ | Same single-panel default; full top bar labels; side panels ~380px; optional OS floating windows secondary to single-panel |

**Idle surface:** `#cosmos-backdrop` (z-index above base canvas, below shell @100) — default image `/assets/backgrounds/cosmos-backdrop.jpg` (JWST Pismis 24; credit NASA, ESA, CSA, STScI) with top/bottom legibility scrims; procedural canvas starfield if the image fails to load; `setCosmosBackdropImage(url)` to override.

---

## 9.0 Starter Data

### 9.1 Purpose

Starter data gives new users a sense of what the app looks like when populated. It is purely illustrative and should feel natural and varied, not like placeholder text.

### 9.2 Starter Notes Definition

`starterNotes` in `timelineModel.js` is a constant array of 8–12 `Event` objects. They are:
- Spread across the current and adjacent months
- Varied in type (notes, tasks, appointments, alerts)
- Varied in category (study, work, health, personal, creative)
- Given realistic titles and body text

### 9.3 Load Behavior

1. On `timelineModel.init()`, check if `inkling-timeline-v1` exists in `localStorage`.
2. If absent: load `starterNotes` into `_events`. Set `hasUserNotes = false`.
3. If present: load from `localStorage`. Do not load `starterNotes`.

### 9.4 Removal Behavior

When the user creates their first real event (via `createEvent()` not from the `starterNotes` constant):
1. Check if `hasUserNotes` is false.
2. If so: remove all starter events from `_events`.
3. Set `inkling-has-user-notes = "true"` in `localStorage`.
4. Persist the now-cleaned `_events` array.
5. Emit `starterDataCleared` on the event bus.
6. The 3D and 2D views re-render, now showing only the user's real events.

### 9.5 Edge Case: Starter Data and Inkling

If Inkling generates a summary while only starter data is present, it should prefix the summary with a note: "Here's a sample view — add your first event to get started."

---

## 10.0 Implementation Guidelines

1. **Do not delete** working systems, especially 2D calendar modules, when modifying 3D systems.
2. **Always align** every implementation decision with this specification.
3. **Timeline model** is the single source of truth for all event reads and writes. No component accesses `localStorage` directly for event data.
4. **2D and 3D** must remain synchronized. Both query the same helper functions. When data changes, both re-render.
5. **Inkling** must use shared data functions from `timelineModel.js`. It never reads `localStorage` directly.
6. **No cracked textures, no fracture shaders, no cracked-reality visuals** anywhere in the 3D scene.
7. **Mobile controls** must always be usable. Never break touch interaction when modifying desktop controls.
8. Use **instancing and shared materials** for 3D performance wherever multiple instances of the same geometry are used.
9. **Minimize scope** of each change. Do not refactor unrelated systems unless the spec requires it.
10. **Event bus** is the only permitted channel for cross-module communication. Direct function calls between rendering systems are prohibited.
11. **Validation** happens in `timelineModel.js`, not in UI components. UI components display validation errors but do not enforce them.
12. **Animations** use CSS transitions for DOM elements and Three.js lerp for 3D elements. No JavaScript-driven DOM animations (`element.style.left = ...` in `requestAnimationFrame`).
13. **All destructive user actions** (delete event, clear all data) require explicit confirmation.
14. **Accessibility**: all interactive elements must have appropriate ARIA labels. Keyboard navigation must work for all core flows.
15. **Error boundaries**: each major panel (Inkling, 2D Calendar, 3D Scene) catches its own rendering errors and shows a graceful fallback, not a broken screen.

---

## 11.0 Component Tree

### 11.1 Top-Level Component Hierarchy

```
CalendarApp (root)
├── UIShell
│   ├── TopBar
│   │   ├── AppLogo
│   │   ├── ModeToggle (2D/3D)
│   │   ├── ViewNavToggle (Today/Week/Month/Year)
│   │   ├── AlertsButton
│   │   ├── InklingButton
│   │   └── SettingsButton
│   ├── BottomNav (mobile only)
│   │   ├── TodayTab
│   │   ├── WeekTab
│   │   ├── MonthTab
│   │   ├── YearTab
│   │   └── SettingsTab
│   └── InklingFAB (mobile only)
├── WordWeaverScene (3D, always mounted, hidden in 2D mode)
│   ├── Three.js Canvas
│   ├── MonthCluster × 12
│   │   ├── MonthLabel
│   │   ├── DayBlock3D × 28–35
│   │   └── AtomGlyph3D × 2–4
│   └── CameraController
├── Calendar2D (2D, always mounted, hidden in 3D mode)
│   ├── YearView2D
│   │   └── MonthMini × 12
│   │       └── DayCell2D × 28–35
│   ├── MonthView2D
│   │   └── DayCell2D × 28–35
│   ├── WeekView2D
│   │   └── DayColumn × 7
│   │       └── EventBlock × N
│   └── DayView2D
│       └── EventBlock × N
├── InklingPanel
│   ├── MessageHistory
│   │   └── MessageBubble × N
│   ├── InputArea
│   │   ├── TextInput
│   │   └── SendButton
│   └── ContextIndicator
├── AlertsDropdown
│   ├── AlertItem × N
│   │   ├── AlertLabel
│   │   ├── SnoozeButton
│   │   └── DismissButton
│   └── EmptyState (conditional)
├── SettingsPanel
│   ├── DisplaySection
│   ├── NotificationsSection
│   ├── DataSection
│   ├── AISection
│   └── AboutSection
├── EventDetailPanel
│   ├── EventHeader
│   ├── EventBody
│   ├── AlertList
│   ├── AIMetadataDisplay
│   ├── EditButton
│   └── DeleteButton
├── NewEventForm (modal)
│   ├── TitleInput
│   ├── TypeSelector
│   ├── DateTimePicker
│   ├── CategorySelector
│   ├── PrioritySelector
│   ├── BodyTextArea
│   ├── AlertAdder
│   └── InklingFillButton
└── ToastContainer
    └── Toast × N
```

### 11.2 Data Flow Ownership

| Component | Reads From | Writes Via |
|-----------|------------|------------|
| WordWeaverScene | `getUnifiedEventsForDate()` | — |
| DayBlock3D | Parent (per-day events array) | — |
| Calendar2D views | `getEventsFor*()` helpers | — |
| InklingPanel | Event bus messages | `AIBrain.js` → `timelineModel.js` |
| AlertsDropdown | `getUpcomingAlerts()` | `updateEvent()` (dismiss/snooze) |
| NewEventForm | — | `createEvent()` |
| EventDetailPanel | `getEventsForDate()` | `updateEvent()`, `deleteEvent()` |

---

## 12.0 Data Flow Model

### 12.1 Write Path (User Creates an Event)

```
User fills NewEventForm
    → Form validates fields locally (required, format)
    → On submit: calls timelineModel.createEvent(formData)
        → timelineModel validates (business rules)
        → Assigns id, createdAt, updatedAt
        → Pushes to _events
        → Serializes to localStorage
        → Emits eventCreated on eventBus
            → WordWeaverScene: re-renders affected DayBlock3D
            → Calendar2D: re-renders affected cell
            → Scheduler: re-evaluates upcoming alerts
            → InklingPanel: receives eventCreated system event (if open)
    → NewEventForm closes
    → Success toast shown
```

### 12.2 Read Path (Day Focused in 3D)

```
User taps DayBlock3D (monthIndex=3, dayIndex=14)
    → WordWeaverScene.focusOnDay(3, 14)
        → Camera lerps to DayBlock3D position
        → Emits dayFocused { date: "2025-04-14" } on eventBus
            → InklingPanel receives dayFocused
                → AIBrain.generateDailySummary("2025-04-14")
                    → timelineModel.getEventsForDate(new Date("2025-04-14"))
                    → AI API call with events list
                    → Response rendered as Inkling message
            → EventDetailPanel (if open): updates to show April 14 events
```

### 12.3 AI Write Path (Inkling Creates an Event)

```
User types: "Add dentist appointment Thursday at 2pm"
    → InklingPanel sends message to AIBrain.processMessage(text, context)
        → AIBrain classifies intent: CREATE
        → AIBrain extracts slots: { type: "appointment", date: next Thursday, time: "14:00", title: "Dentist" }
        → AIBrain calls timelineModel.createEvent(extractedEvent)
            → [same write path as above]
        → AIBrain generates confirmation: "Done — I've added Dentist on Thursday April 17 at 2:00 PM."
        → InklingPanel renders confirmation message
```

### 12.4 Alert Fire Path

```
Scheduler setTimeout fires
    → alert.time <= now
    → timelineModel.updateEvent(eventId, { alerts: [..., { triggered: true }] })
        → Emits eventUpdated on eventBus
    → Scheduler emits alertTriggered { event, alert } on eventBus
        → AlertsDropdown: updates badge count
        → ToastContainer: shows popup toast (if kind === "popup")
        → AudioSystem: plays tone (if kind === "sound")
        → InklingPanel: receives alertTriggered (if open)
    → Scheduler schedules next alert
```

---

## 13.0 Event Propagation Model

### 13.1 Event Bus Design

The event bus (`eventBus.js`) is a simple singleton pub/sub implementation.

```
eventBus.on(eventName, handler)     // subscribe
eventBus.off(eventName, handler)    // unsubscribe
eventBus.emit(eventName, payload)   // publish
```

All handlers are called synchronously in subscription order. No async handlers are permitted on the event bus — async work is initiated within the handler but the handler itself returns immediately.

### 13.2 Event Catalog

| Event Name | Emitted By | Payload | Subscribers |
|------------|------------|---------|-------------|
| `initialized` | timelineModel | `{ eventCount }` | WordWeaverScene, Calendar2D |
| `eventCreated` | timelineModel | `Event` | WordWeaverScene, Calendar2D, Scheduler, InklingPanel |
| `eventUpdated` | timelineModel | `Event` | WordWeaverScene, Calendar2D, Scheduler, InklingPanel, AlertsDropdown |
| `eventDeleted` | timelineModel | `{ id }` | WordWeaverScene, Calendar2D, Scheduler, InklingPanel |
| `starterDataCleared` | timelineModel | — | WordWeaverScene, Calendar2D |
| `storageWarning` | timelineModel | `{ usedBytes }` | UIShell (shows warning toast) |
| `storageFull` | timelineModel | `{ usedBytes }` | UIShell (shows error, blocks save) |
| `dayFocused` | WordWeaverScene, Calendar2D | `{ date: string }` | InklingPanel |
| `weekFocused` | WordWeaverScene, Calendar2D | `{ weekStart: string }` | InklingPanel |
| `monthFocused` | WordWeaverScene, Calendar2D | `{ year, month }` | InklingPanel |
| `modeChanged` | ModeToggle | `{ mode: "2d" \| "3d" }` | WordWeaverScene, Calendar2D, InklingPanel |
| `navigateTo` | InklingPanel, UIShell | `{ date: string, level: "day" \| "week" \| "month" }` | WordWeaverScene, Calendar2D |
| `alertTriggered` | Scheduler | `{ event, alert }` | AlertsDropdown, ToastContainer, AudioSystem, InklingPanel |
| `alertsOpened` | AlertsDropdown | — | InklingPanel |
| `inklingOpened` | InklingButton | — | InklingPanel |
| `inklingClosed` | InklingPanel | — | InklingPanel, UIShell |

### 13.3 Subscription Lifecycle

Components subscribe on mount and unsubscribe on unmount. Failure to unsubscribe is a memory leak. The pattern is:

```
componentDidMount():
  eventBus.on("eventCreated", this.handleEventCreated)

componentWillUnmount():
  eventBus.off("eventCreated", this.handleEventCreated)
```

---

## 14.0 AI Intent Classification Pipeline

### 14.1 Overview

Intent classification is the first step in Inkling's processing pipeline. It determines what the user wants to do, so the correct downstream action can be taken.

### 14.2 Intent Classes

| Intent | Description | Example |
|--------|-------------|---------|
| `CREATE` | Create a new event | "Add dentist Thursday 3pm" |
| `UPDATE` | Edit an existing event | "Move my 2pm meeting to 4pm" |
| `DELETE` | Remove an event | "Delete the dentist appointment" |
| `QUERY` | Retrieve information | "What do I have Friday?" |
| `NAVIGATE` | Move the calendar to a location | "Go to next month" |
| `SUMMARIZE` | Generate a summary | "Summarize my week" |
| `SUGGEST` | Get recommendations | "What should I work on today?" |
| `CHITCHAT` | Off-topic or conversational | "How are you?" |
| `CONFIRM` | Responding to a clarification prompt | "Yes, Thursday" |
| `CANCEL` | Abandoning an action | "Never mind" |

### 14.3 Classification Prompt Design

The classification call to the AI API uses a system prompt that:
- Defines all intent classes with examples
- Includes the current date and time
- Includes the focused date (if any)
- Asks the model to return a JSON object: `{ intent, confidence, rawText }`

The classification call uses a low-latency model with `max_tokens: 50` to minimize latency.

### 14.4 Slot Extraction

After classification, a second AI call extracts structured slots from the user's message. Slots depend on intent:

**CREATE slots:** title (required), date (required), time (optional), endTime (optional), type (optional), category (optional), priority (optional), body (optional), alerts (optional)

**UPDATE slots:** target event identifier (required; natural language, resolved via event lookup), changed fields (1 or more)

**DELETE slots:** target event identifier (required)

**QUERY slots:** date range (required), category filter (optional), type filter (optional)

**NAVIGATE slots:** destination (required: a date, "today", "next week", "next month", etc.)

**SUMMARIZE slots:** scope (required: "today", "this week", "this month", a specific date)

### 14.5 Entity Resolution

**Date resolution:** Relative expressions ("tomorrow", "next Friday", "in two weeks") are resolved against the current date at the time of processing, using a deterministic date resolution function — not by the AI model.

**Event reference resolution:** When the user says "my 2pm meeting", the system searches the timeline model for events near the referenced time on the focused date. If multiple candidates exist, Inkling presents them for the user to choose.

**Ambiguity handling:** If a slot cannot be resolved confidently (confidence < 0.7), Inkling enters the clarification loop (see Section 4.6).

### 14.6 Classification Fallbacks

- If the AI API is unavailable: return `{ intent: "CHITCHAT", confidence: 0 }` and show an error message.
- If confidence is < 0.5 for any non-CHITCHAT intent: treat as CHITCHAT and ask for clarification.
- If the user sends an empty message: ignore; do not call the API.

---

## 15.0 AI Navigation Pipeline

### 15.1 Navigation Commands

When intent is classified as `NAVIGATE`, the slot extraction identifies a destination. This is resolved to a specific date, week start, or month, and then dispatched as a `navigateTo` event on the event bus.

### 15.2 Navigation Targets

| User phrase | Resolved target |
|-------------|-----------------|
| "today" | Today's date |
| "tomorrow" | Tomorrow's date |
| "next week" | Start of next ISO week (Monday) |
| "next month" | First of next month |
| "June" / "June 2025" | First of that month/year |
| "April 14" | That specific date in the current or next year |
| "my next appointment" | Date of the next event with `type === "appointment"` |
| "next deadline" | Date of the next event with `category === "deadline"` |

### 15.3 Dispatch Flow

```
Intent: NAVIGATE, destination: { date: "2025-06-01", level: "month" }
    → eventBus.emit("navigateTo", { date: "2025-06-01", level: "month" })
        → WordWeaverScene: focusOnMonth(5)  (June = index 5)
        → Calendar2D: setCurrentMonth(2025, 6)
    → Inkling responds: "Here's June 2025."
```

### 15.4 AI-Driven Focus Navigation

Beyond simple date navigation, Inkling can navigate to conceptual targets:

- `focusOnNextEvent()`: Find the next upcoming event chronologically and navigate to it.
- `focusOnCategory(category)`: Find the next day with an event of the given category.
- `focusOnBusiestDay()`: Find the day in the current month with the most events.
- `focusOnDeadlines()`: Navigate to the next deadline event.

These are implemented as timeline model queries followed by `navigateTo` event dispatches.

---

## 16.0 3D Rendering Pipeline

### 16.1 Frame Loop

The Three.js animation loop runs at `requestAnimationFrame` cadence (typically 60fps, capped by the browser). Each frame:

1. Update `OrbitControls` (desktop) or custom touch controls (mobile).
2. Lerp camera position toward target.
3. Update raycaster from mouse/touch position.
4. Detect hover state changes; update `DayBlock3D` emissive intensity.
5. Animate `AtomGlyph3D` rotations.
6. Process `CanvasTexture` re-render queue (max 3 per frame to avoid frame drops).
7. Render scene.
8. Update stats panel (if dev mode).

### 16.2 Canvas Texture Update Queue

When event data changes, affected `DayBlock3D` instances are added to a re-render queue rather than being re-rendered immediately. The queue is processed in the frame loop, limited to 3 textures per frame. This prevents a single bulk update from causing a frame drop.

### 16.3 Level of Detail

- **Year overview** (camera far from scene): All 12 month clusters rendered, but `DayBlock3D` canvas textures are low-resolution (128×160px).
- **Month focus** (camera ~20 units from cluster): The focused cluster uses high-resolution textures (256×320px). Other clusters use low resolution.
- **Day focus** (camera very close): The focused `DayBlock3D` renders at 512×640px. Others use low resolution. Event detail panel opens alongside.

LOD transitions are based on camera distance to each cluster's center, calculated each frame.

### 16.4 Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate (desktop) | 60fps |
| Frame rate (mobile) | 30fps minimum |
| Initial 3D scene load time | < 2 seconds |
| DayBlock3D canvas re-render | < 5ms per block |
| Maximum draw calls per frame | < 300 |
| Maximum triangles per frame | < 500,000 |

### 16.5 Resize Handling

On `window.resize`:
1. Update `renderer.setSize(width, height)`.
2. Update `camera.aspect = width / height`.
3. Call `camera.updateProjectionMatrix()`.
4. Recalculate month cluster positions if the ring radius depends on viewport.

Debounce the resize handler to 100ms to avoid thrashing during drag resize.

### 16.6 Memory Management

- On app visibility hidden (`document.visibilitychange`): pause the animation loop.
- On app visibility visible: resume.
- On mode switch to 2D: pause the loop but do not dispose of scene objects.
- On explicit app teardown (not applicable in web context, but plan for future desktop wrapping): dispose all geometries, materials, and textures.

---

## 17.0 2D Rendering Pipeline

### 17.1 DOM Rendering Strategy

2D views are rendered as pure DOM. No canvas, no SVG (except possible icons). This ensures:
- Native accessibility (screen readers can traverse the DOM).
- Native browser scroll behavior.
- Simple CSS-based theming.
- Easy keyboard navigation.

### 17.2 Render Triggers

2D views re-render their affected portions when:
- `eventCreated`, `eventUpdated`, `eventDeleted` events are received on the event bus.
- The user navigates to a different date/week/month/year.
- The calendar mode switches to 2D (full re-render of current view).

### 17.3 Diffing Strategy

To avoid full DOM rebuilds on minor changes, 2D components maintain a keyed list of day cells. When the event bus notifies of a change, only the affected day cells (keyed by date) are re-rendered. This is equivalent to a virtual DOM diffing approach.

If using a framework (React/Svelte/Vue): leverage the framework's built-in reconciler. If using vanilla JS: maintain a `Map<dateString, DayCellElement>` and update only affected nodes.

### 17.4 Overflow Handling

- Month view: max 3 visible event pills per day cell. A "+N more" indicator is shown if more events exist. Clicking/tapping it opens a popover listing all events.
- Week view: overlapping events (same time range) are displayed as side-by-side columns within the day column. The day column is subdivided as needed, with a minimum event block width of 80px.
- Day view: no overflow limit; all events displayed. Long events are scrollable within the view.

### 17.5 Drag-and-Drop (Desktop Only, Week/Day Views)

- Events in week view and day view are draggable.
- Drag starts on `mousedown` on an event block.
- A ghost element follows the cursor.
- A drop indicator line shows where the event will land.
- On `mouseup`: calculate new `startTime` from drop position, adjust `endTime` proportionally, call `updateEvent()`.
- On cancel (Escape key or drop outside valid area): revert to original position with no mutation.
- Resize: dragging the bottom edge of an event block changes `endTime`. Same drop indicator behavior.

---

## 18.0 State Synchronization Model

### 18.1 Single Source of Truth

The timeline model's `_events` array is the single source of truth. Neither the 3D scene nor the 2D calendar maintain their own copy of event data. They read from the model on demand and refresh when notified.

### 18.2 Focused State

A separate, lightweight "UI state" object tracks:
- `focusedDate: Date | null` — the currently focused calendar date
- `focusedLevel: "day" | "week" | "month" | "year"` — the current view level
- `calendarMode: "2d" | "3d"` — current calendar mode
- `inklingOpen: boolean` — whether the Inkling panel is open
- `alertsOpen: boolean` — whether the Alerts dropdown is open

This UI state is not persisted (except `calendarMode` which is in `localStorage`). It resets on reload.

When `focusedDate` changes, both 3D and 2D systems react via the event bus.

### 18.3 2D–3D Synchronization Rules

| Trigger | 2D | 3D |
|---------|----|----|
| User navigates in 2D | Updates `focusedDate`, emits `dayFocused`/`monthFocused` | Silently updates internal focused date. On next mode switch, camera positions to that date. |
| User navigates in 3D | Updates `focusedDate`, emits `dayFocused`/`monthFocused` | Camera animates to focused location |
| Event created | Re-renders affected day cell | Re-renders affected DayBlock3D |
| Event updated | Re-renders affected day cell | Re-renders affected DayBlock3D |
| Event deleted | Re-renders affected day cell | Re-renders affected DayBlock3D |
| Mode switch to 2D | Activates, renders current `focusedDate` view | Hides (pauses loop) |
| Mode switch to 3D | Hides | Activates, animates camera to `focusedDate` |

### 18.4 Conflict Prevention

Because only `timelineModel.js` mutates the `_events` array, and mutations are synchronous, there is no write conflict possible in a single-tab context. The event bus emits are synchronous and in-order. No race conditions exist under normal operation.

---

## 19.0 Error Recovery Model

### 19.1 Categories of Errors

| Category | Examples | Recovery Strategy |
|----------|---------|-------------------|
| Network errors | AI API timeout, offline | Show retry button; queue action if recoverable |
| Validation errors | Invalid date, empty title | Show inline field error; block submit |
| Storage errors | localStorage full | Warn user; offer export-and-clear |
| Rendering errors | Three.js crash | Fallback to 2D mode; show notification |
| Parse errors | Corrupted localStorage JSON | Reset to starter data; warn user |
| AI parse errors | AI returns unstructured response | Treat as CHITCHAT; ask to rephrase |

### 19.2 localStorage Corruption

On `timelineModel.init()`:
1. Attempt to parse `inkling-timeline-v1`.
2. If parse fails (invalid JSON), emit `storageCorrupted` event.
3. Show user notification: "Your calendar data appears corrupted. Would you like to reset to a fresh start?"
4. On confirm: clear `inkling-timeline-v1`, load starter data.
5. On cancel: leave `_events = []`; user can import data.

### 19.3 3D Rendering Error Recovery

Wrap the Three.js initialization in a try-catch. If initialization throws:
1. Set `calendarMode = "2d"`.
2. Show notification: "3D mode is unavailable on this device. Using classic calendar view."
3. Do not attempt to reinitialize 3D for the session.

Also: if the animation loop throws an uncaught error (via `window.onerror` within the canvas context), catch it, log it, and display an in-app error state on the 3D canvas area with a "Reload 3D View" button that attempts re-initialization.

### 19.4 AI Error Recovery

- Network timeout (>10 seconds): cancel the request, show "Inkling is taking too long. Try again?" with retry button.
- HTTP 429 (rate limited): show "Inkling is busy. Please wait a moment." Retry automatically after 5 seconds.
- HTTP 500: show "Something went wrong on our end. Try again?" with retry.
- Parse error (non-JSON response from AI): log and treat as CHITCHAT.

### 19.5 Event Bus Error Isolation

Each event bus handler is wrapped in a try-catch. An error in one handler does not propagate to other handlers for the same event. Errors are logged to the console and a silent internal error tracker.

---

## 20.0 Performance Optimization Plan

### 20.1 3D Performance

- **Instanced rendering:** All `DayBlock3D` geometries of the same dimensions share a single `InstancedMesh`. Category-colored materials are pre-created and shared.
- **Frustum culling:** Three.js performs this automatically. Month clusters outside the camera frustum are not drawn.
- **LOD system:** Described in Section 16.3. Low-resolution textures for distant objects.
- **Paused rendering:** When app is in background or Inkling/Settings panel is open full-screen, reduce frame rate to 10fps or pause entirely.
- **No per-frame geometry creation:** All geometries are created on startup and reused. No `new THREE.Geometry()` calls in the animation loop.
- **Bloom post-processing:** Disabled on mobile and on devices with `devicePixelRatio < 1.5`.

### 20.2 2D Performance

- **Keyed DOM diffing:** Only affected day cells are re-rendered on data changes.
- **Virtual scrolling:** In Day View and Week View, events outside the visible scroll area are not rendered.
- **Debounced resize:** Layout recalculation on window resize is debounced to 100ms.
- **CSS containment:** Apply `contain: layout style` to calendar grid cells to limit browser paint scope.

### 20.3 AI Performance

- **Classification model:** Use a smaller, faster model for intent classification (< 100ms target).
- **Slot extraction model:** Slightly larger model, but called only after classification confirms a non-CHITCHAT intent.
- **Response streaming:** If the AI API supports streaming responses, stream Inkling's replies token-by-token for perceived responsiveness.
- **Context window management:** Limit the conversation history sent to the AI to the last 6 message pairs plus system context. Older history is summarized and appended as a "memory" block.

### 20.4 localStorage Performance

- **Lazy reads:** Read from localStorage only once (on init). All subsequent reads are from the in-memory `_events` array.
- **Throttled writes:** Writes are debounced to 200ms. Rapid successive mutations (e.g., bulk import) are batched into a single write.
- **Size monitoring:** Before every write, check estimated size. Warn at 4.5MB, block at 4.9MB.

---

## 21.0 Theming System

### 21.1 Theme Architecture

The theming system uses CSS custom properties (variables) applied to the `:root` element. All component styles reference these variables. Swapping a theme is achieved by changing the variable values on `:root` — no component styles change.

### 21.2 Theme Variables

**Color variables:**

```css
--color-background-primary      /* Main app background */
--color-background-secondary    /* Panel backgrounds */
--color-background-tertiary     /* Card, cell backgrounds */
--color-surface                 /* Glass surface color */
--color-border                  /* Borders, dividers */
--color-text-primary            /* Main body text */
--color-text-secondary          /* Secondary labels */
--color-text-muted              /* Placeholder, hints */
--color-accent                  /* Primary CTA color */
--color-accent-hover            /* Hover state of accent */
--color-danger                  /* Destructive actions */
--color-success                 /* Confirmations */
--color-warning                 /* Non-critical warnings */
```

**Category colors (used in event pills, day block glows, dots):**

```css
--category-study        /* Blue-indigo */
--category-work         /* Slate blue */
--category-health       /* Emerald green */
--category-finance      /* Amber */
--category-errands      /* Orange */
--category-creative     /* Violet */
--category-personal     /* Rose pink */
--category-appointment  /* Sky blue */
--category-deadline     /* Red */
--category-reminder     /* Teal */
```

**3D-specific variables:**

```css
--3d-glass-transmission     /* 0.0–1.0 */
--3d-glass-roughness        /* 0.0–1.0 */
--3d-emissive-intensity     /* Rest state */
--3d-emissive-hover         /* Hover state */
--3d-background-color       /* Scene background */
--3d-ambient-intensity      /* Ambient light */
```

### 21.3 Built-in Themes

| Theme ID | Description |
|----------|-------------|
| `dark-cosmos` | Deep dark blue-black, default. High contrast. |
| `midnight-indigo` | Dark navy, cooler tone, purple accents. |
| `light-paper` | Light mode, warm off-white, ink accents. |
| `high-contrast` | WCAG AAA contrast ratios. Black/white primary. |

### 21.4 Theme Application

- Themes are stored in `inkling-preferences-v1` under `theme`.
- On init, read `theme` from preferences and apply by setting `:root` variable values.
- In Settings panel, the user previews themes with a thumbnail swatch.
- Applying a theme is instant (CSS variable update); no reload required.
- Three.js scene colors are updated programmatically when the theme changes: `directionalLight.color`, `ambientLight.color`, `scene.background`.

---

## 22.0 Iconography System

### 22.1 Icon Strategy

All icons are inline SVGs, delivered as a sprite or as individual imported SVG components. No icon font libraries are used (icon fonts cause accessibility issues and layout shift).

### 22.2 Icon Set

Icons are drawn in a consistent style: 24×24px viewport, 1.5px stroke, rounded linecap and linejoin, no fill (outline style). One filled variant exists per icon for "active" states.

**Required icons:**

| Icon | Usage |
|------|-------|
| calendar | App logo, calendar mode |
| bell | Alerts button |
| bell-dot | Alerts button with unread |
| sparkle | Inkling button |
| gear | Settings |
| plus | Add event, add alert |
| x | Close panels, dismiss |
| chevron-left | Previous nav |
| chevron-right | Next nav |
| check | Confirm, complete |
| trash | Delete |
| edit | Edit event |
| clock | Alert time, duration |
| tag | Category |
| flag | Priority |
| star | Priority 3 (critical) |
| 3d-box | 3D mode indicator |
| grid | 2D mode indicator |
| today | Today nav |

**Category icons** (used in event pills and day block content):

| Category | Icon |
|----------|------|
| study | book-open |
| work | briefcase |
| health | heart |
| finance | dollar-sign |
| errands | shopping-bag |
| creative | palette |
| personal | user |
| appointment | user-check |
| deadline | flag |
| reminder | bell |

### 22.3 Icon Usage Rules

- Icons must always have an `aria-label` or accompany visible text.
- Icon-only buttons (e.g., top bar buttons on mobile) require a `title` attribute and `aria-label`.
- Icons in 3D mode (DayBlock3D canvas) are rasterized from the same SVG source at 16×16px into the canvas texture.

---

## 23.0 Animation System

### 23.1 Animation Philosophy

Animations exist to orient the user, not to impress. Every animation communicates something: a transition, a state change, a confirmation. No animation is purely decorative without also carrying information.

### 23.2 Animation Catalog

| Animation | Trigger | Duration | Easing | Implementation |
|-----------|---------|----------|--------|----------------|
| Mode switch (3D→2D) | Mode toggle | 400ms | ease-in-out | CSS opacity transition on canvas and DOM |
| Mode switch (2D→3D) | Mode toggle | 400ms | ease-in-out | CSS opacity transition |
| Panel slide-in | Inkling/Settings open | 300ms | ease-out | CSS transform: translateX |
| Panel slide-out | Inkling/Settings close | 250ms | ease-in | CSS transform: translateX |
| Bottom sheet slide-up | Mobile panel open | 300ms | ease-out | CSS transform: translateY |
| Toast appear | Alert fires | 200ms | ease-out | CSS opacity + translateY |
| Toast dismiss | Timeout or dismiss | 200ms | ease-in | CSS opacity + translateY |
| DayBlock3D hover | Mouse enter | 150ms | ease-out | Three.js lerp in frame loop |
| DayBlock3D unhover | Mouse leave | 200ms | ease-in | Three.js lerp |
| Camera navigate | focusOnDay/Month | continuous | lerp factor 0.08 | Three.js lerp |
| AtomGlyph rotate | Continuous | ∞ | linear | Three.js rotation per frame |
| Event pill appear | New event | 300ms | ease-out | CSS scaleY from 0 to 1 |
| Confirmation dialog | Delete click | 200ms | ease-out | CSS opacity + scale |

### 23.3 Reduced Motion

All animations respect the `prefers-reduced-motion: reduce` media query. When reduced motion is preferred:
- All CSS transitions are set to `duration: 0`.
- Camera transitions snap immediately (lerp factor set to 1 for one frame).
- `AtomGlyph3D` rotation is paused.

---

## 24.0 Input Handling System

### 24.1 Input Event Architecture

A centralized `InputManager.js` module listens for all raw input events and routes them to the appropriate handler based on the current application state (mode, open panels, focused element).

This prevents event listener collisions and ensures clean separation between input sources and responders.

### 24.2 Keyboard Input (Desktop)

| Key | Context | Action |
|-----|---------|--------|
| Escape | Any panel open | Close topmost panel |
| Escape | 3D, day focused | Return to month view |
| Escape | 3D, month focused | Return to year view |
| Enter | DayBlock3D focused | Open day detail |
| Arrow keys | 3D mode | Move 3D focus between day blocks |
| Arrow keys | 2D mode | Navigate dates in current view |
| W/A/S/D | 3D mode, no text input focused | Camera fly movement |
| Q/E | 3D mode | Elevate/descend |
| R | 3D mode | Reset camera to year overview |
| N | Any | Open New Event form |
| I | Any | Toggle Inkling panel |
| Tab | Everywhere | Standard browser focus traversal |
| Ctrl+Z | New Event form | Undo last field change |

### 24.3 Mouse Input (Desktop)

| Action | Context | Result |
|--------|---------|--------|
| Left drag | 3D scene background | Orbit camera |
| Right drag | 3D scene background | Pan camera |
| Scroll wheel | 3D scene | Zoom |
| Click | DayBlock3D | Focus day |
| Click | Month label | Focus month |
| Hover | DayBlock3D | Hover state |
| Click | Event pill (2D) | Open Event Detail |
| Click | Empty day cell (2D) | Open New Event form |
| Drag | Event block (Week/Day 2D) | Move event time |
| Drag bottom edge | Event block (Week/Day 2D) | Resize event duration |

### 24.4 Priority of Input Handling

1. Open modal / confirmation dialog → captures all input
2. Open Inkling text input → captures keyboard; camera controls suspended
3. 3D scene → camera and raycasting controls active
4. 2D calendar → DOM interaction active

---

## 25.0 Mobile Gesture System

### 25.1 Touch Event Architecture

Custom `TouchController.js` handles all mobile touch interactions for the 3D scene. It translates touch gestures into the same camera commands that `OrbitControls` provides on desktop.

### 25.2 3D Touch Gestures

| Gesture | Action |
|---------|--------|
| Single finger drag | Orbit (rotate camera around scene) |
| Two-finger pinch in/out | Zoom in/out |
| Two-finger drag | Pan camera |
| Tap | Raycast: hover/select DayBlock3D |
| Double-tap | Zoom in one level (year→month→day) |
| Swipe up (fly button held) | Fly forward |
| Swipe down (descend button held) | Descend |
| Long press on DayBlock3D | Open context menu (Add event, View summary) |

### 25.3 2D Touch Gestures

| Gesture | Context | Action |
|---------|---------|--------|
| Tap event pill | Month view | Open Event Detail |
| Tap empty cell | Month view | Open New Event form |
| Swipe left/right | Day view | Navigate previous/next day |
| Swipe left/right | Week view | Navigate previous/next week |
| Swipe up/down | Week/Day view | Scroll time axis |
| Pull down | Month/Year view | Refresh (no-op in local mode; reserved for future sync) |

### 25.4 Panel Gestures (Mobile)

| Gesture | Panel | Action |
|---------|-------|--------|
| Swipe down | Inkling panel (bottom sheet) | Close |
| Swipe down | Alerts dropdown | Close |
| Drag handle | Bottom sheet | Resize to half-height or full-height |

### 25.5 Touch Target Rules

All interactive touch targets must be at minimum 44×44px (Apple HIG) and 48×48dp (Material Design). Day cells in Year view are the smallest elements; verify touch target size before shipping. Add invisible padding if the visual cell is smaller than the minimum.

---

## 26.0 Desktop Control System

### 26.1 Keyboard Navigation

Full keyboard accessibility is required for all views. Focus management follows the ARIA authoring practices guide.

**Focus traps:** Modal dialogs and the Inkling panel trap focus while open. Tab cycling wraps within the panel.

**Skip links:** A "Skip to calendar" link is the first focusable element in the DOM, allowing keyboard users to bypass the top bar.

### 26.2 Mouse Precision Features

- **Tooltip on DayBlock3D hover:** Day number, event count, dominant category. Appears after 500ms hover. Dismissed immediately on mouse leave.
- **Right-click context menu (3D):** "Add event on this day", "View summary", "Navigate to this day in 2D".
- **Right-click context menu (2D event pill):** "Edit", "Delete", "Ask Inkling about this".

### 26.3 Scroll Behavior

- Year view (2D): not scrollable; all 12 months fit in viewport.
- Month view (2D): not scrollable vertically; cells adjust height to fit.
- Week/Day view (2D): vertically scrollable time axis. Scroll position persists across day navigation within the same session.

---

## 27.0 Accessibility Plan

### 27.1 WCAG Target

Target: WCAG 2.1 AA compliance. The high-contrast theme provides WCAG AAA compliance for users who need it.

### 27.2 Screen Reader Support

- All interactive elements (buttons, links, day cells, event pills) have descriptive `aria-label` attributes.
- Dynamic content changes (new messages in Inkling, new events, alert fires) are announced via `aria-live="polite"` regions. Alert fires use `aria-live="assertive"`.
- The 3D scene canvas has `role="application"` and a descriptive `aria-label`. A fallback text representation of today's events is provided in a visually-hidden `<div aria-live="polite">` that updates when the scene updates.
- When 3D mode is active, a visible "Switch to 2D for keyboard navigation" prompt appears for keyboard users.

### 27.3 Color Contrast

- All text over dark backgrounds: minimum 4.5:1 contrast ratio.
- Category colors: tested against both light and dark backgrounds. The category color is never used as the sole conveyor of meaning; it is always accompanied by a label or icon.
- Alert and priority indicators: color + icon (never color alone).

### 27.4 Focus Indicators

- Custom focus rings on all interactive elements: 2px solid `--color-accent`, 2px offset.
- Focus rings are visible in both light and dark themes.
- The `:focus-visible` pseudo-class is used to show rings only for keyboard navigation, not mouse click.

### 27.5 3D Accessibility Alternative

Because 3D content cannot be fully made accessible to screen readers, the system provides:
- A "Jump to 2D view" button always visible in the top bar.
- 2D mode is fully screen-reader accessible.
- Inkling provides a text-based interface for all calendar operations, usable without either the 2D or 3D views.

### 27.6 Motion and Vestibular Considerations

All animations respect `prefers-reduced-motion` (see Section 23.3). The 3D mode's continuous motion (AtomGlyph rotations, camera float) is fully paused under reduced motion preference.

---

## 28.0 Testing Plan

### 28.1 Unit Tests

Scope: Pure logic functions, no DOM or Three.js.

| Module | Test Cases |
|--------|------------|
| `timelineModel.js` | createEvent validates all fields; updateEvent merges correctly; deleteEvent removes correctly; helpers return correct subsets; storage size guard triggers; corrupted JSON handled |
| Date resolution | All relative expressions resolve correctly for every day of week, month boundaries, year boundaries |
| Intent classification (mocked AI) | All intent classes recognized; low-confidence triggers clarification; missing slots trigger clarification loop |
| Scheduler | Next alert computed correctly; past alerts detected as missed; snooze adds new alert entry |
| Event bus | Handlers receive correct payloads; handler errors are isolated; unsubscribe prevents future calls |

### 28.2 Integration Tests

Scope: Interaction between modules; DOM or minimal Three.js.

| Flow | Test |
|------|------|
| Create event via form | Form → timelineModel → event bus → 2D cell re-renders |
| Inkling creates event | Inkling message → AIBrain → timelineModel → confirmation message |
| Alert fires | Scheduler fires → event bus → toast shown → badge updates |
| Mode switch | Toggle → canvas opacity → both systems re-render for focused date |
| localStorage corruption | Corrupted JSON → notification → reset flow |
| Starter data removal | First real event created → starter events removed → views re-render |

### 28.3 End-to-End Tests

Scope: Full user flows in a headless browser (Playwright or Cypress).

| Flow |
|------|
| New user: loads app, sees starter data, creates first event, starter data disappears |
| Create event via Inkling: types command, event appears in 2D month view |
| Navigate via Inkling: types "go to next month", calendar moves |
| Alert flow: create event with alert 1 minute from now, wait, toast appears |
| Mode switch: toggle to 2D, navigate to a date, toggle to 3D, camera lands on that date |
| Delete event: click event, delete, confirm, event disappears from both views |

### 28.4 Performance Tests

- Frame rate monitoring in 3D mode across a full year of events (360+ events): must sustain 60fps on desktop, 30fps on mobile.
- localStorage write latency: mutation to storage write must complete < 5ms for a 200-event dataset.
- Inkling response time: intent classification must return in < 500ms (network included).
- Initial load time: full app ready to interact in < 3 seconds on a 4G connection.

### 28.5 Accessibility Audits

- Automated: Axe-core integrated into the test suite, run on every 2D view and every panel state.
- Manual: Screen reader test (VoiceOver on macOS, NVDA on Windows) covering: creating an event, reading the current month, navigating to a day, using Inkling.

---

## 29.0 Versioning Plan

### 29.1 Storage Schema Versioning

The localStorage key `inkling-timeline-v1` includes a version suffix. When the Event schema changes in a way that is not backward-compatible:

1. Increment the version: `inkling-timeline-v2`.
2. Write a migration function: `migrateV1ToV2(v1Events): v2Events`.
3. On `timelineModel.init()`, check which version is present.
4. If v1 is present and v2 is not: run migration, write v2, keep v1 as backup for 2 sessions, then remove.
5. If neither is present: fresh start with starter data.

### 29.2 Application Versioning

The app has a semantic version (`major.minor.patch`) stored in the build config. This version is:
- Displayed in the Settings panel under About.
- Logged to the console on startup.
- Included in AI API request headers as a custom header (`X-Inkling-Version`) for future debugging.

### 29.3 Spec Versioning

This document is version 2.0. All future expansions increment the minor version. Breaking architectural changes (data model restructuring, new primary modes) increment the major version. The version header at the top of this document must be updated with every change.

---

## 30.0 Future Roadmap

### 30.1 Near-Term Extensions (Post-Launch)

**3D Weekly Heatmap:**
Inside each month cluster, a colored heat gradient overlays the day grid representing event density. Higher density = warmer color. Implemented as a plane geometry with a procedural color map, rendered behind the day blocks.

**3D Today Bubble:**
A visually distinct 3D element (glowing sphere or highlighted DayBlock3D variant) marking today's date in the year layout. Persistent visual anchor for spatial orientation.

**Recurrence Support:**
Add `recurrence` field to the `Event` type. Supported rules: daily, weekly (specific days), monthly (day of month or ordinal weekday), yearly. Recurring events are materialized by `timelineModel.js` into individual event instances up to 2 years out on startup. Re-materialized when the recurrence rule changes.

**Event Tags:**
Add a `tags: string[]` field to `Event`. Inkling can filter and group by tags. 3D mode can highlight days containing events with a specific tag.

### 30.2 Medium-Term Extensions

**AI Focus Mode:**
Inkling analyzes the user's schedule and suggests a "focus block" — a time period with no events, proposed for deep work. The suggestion appears as a highlighted region in both 2D and 3D views. The user can accept the suggestion to create a blocked event.

**AI Themes:**
Inkling can suggest theme changes based on the time of day, season, or dominant mood inferred from event categories (e.g., a more energetic theme during heavy work periods).

**Cloud Sync:**
Replace localStorage with a cloud-backed store (Supabase or similar). The timeline model's persistence layer is already abstracted; only `readFromStore()` and `writeToStore()` need to be replaced. Conflict resolution: last-write-wins per event by `updatedAt` timestamp. Full merge is a future feature.

**Multi-Calendar Support:**
Support multiple named calendars (e.g., "Personal", "Work", "Health"). Each calendar has a distinct color set. Events belong to exactly one calendar. The 3D scene can filter to show only selected calendars.

### 30.3 Long-Term Vision

**Collaborative Calendars:**
Shared timelines where multiple users can add and view events. Real-time updates via WebSocket. Inkling can summarize what collaborators are doing without revealing private calendars.

**Natural Language Import:**
Paste any block of text (emails, meeting notes, document excerpts) and Inkling extracts all implied events and tasks, presenting them for review before bulk-adding.

**Voice Input:**
Web Speech API integration for dictating events to Inkling: "Hey Inkling, add a workout tomorrow at 7am." Voice input feeds the same processing pipeline as typed input.

**3D Spatial Audio:**
In 3D mode, events in different parts of the year emit subtle ambient sounds based on category (soft tones for study events, gentle alerts for deadlines). Volume scales with event density. Fully opt-in; disabled by default.

**Mobile Native App:**
A React Native or Swift/Kotlin port of the core system. The timeline model and AI layer are portable. The 3D scene is re-implemented with Metal (iOS) or Vulkan (Android) for native GPU performance. 2D views and Inkling are direct ports.

---

## Key File Map (Reference)

| Area | Paths |
|------|--------|
| Spec | `docs/master_spec_expanded.md` (this file) |
| Timeline | `src/wordweaver/timelineModel.js`, `src/wordweaver/timelineEventContract.js` |
| Event Bus | `src/utils/EventBus.js` (§28 reconciled; canonical singleton) |
| Input Manager | `src/core/InputManager.js` |
| Touch Controller | `src/core/TouchController.js` |
| Scheduler | `src/calendar/alerts/Scheduler.js` |
| 3D Scene | `src/wordweaver/WordWeaverScene.js`, `src/wordweaver/DayBlock3D.js`, `src/wordweaver/AtomGlyph3D.js` |
| Calendar Mode | `src/wordweaver/calendarMode.js` |
| 2D Calendar | `src/calendar/Calendar2D.js`, `src/calendar/MonthGrid2D.js`, `src/calendar/WeekGrid2D.js`, `src/calendar/DayCell2D.js` |
| 2D Views | `src/calendar/views/WeekView.js`, `src/calendar/views/MonthView.js`, `src/calendar/views/DayView.js`, `src/calendar/views/YearView.js` |
| AI | `src/calendar/ai/AIBrain.js`, `src/calendar/ai/InklingPanel.js` |
| Alerts | `src/calendar/alerts/Scheduler.js`, `src/calendar/alerts/AlertsDropdown.js` |
| Shell | `src/shell/NavigationBar.js`, `src/shell/CalendarApp.js`, `src/shell/TopBar.js`, `src/shell/SettingsPanel.js` |
| Theming | `src/styles/themes/*.css`, `src/styles/variables.css` |
| Icons | `src/assets/icons/*.svg` |

---

*Inkling + WordWeaver Master Build Specification — Version 2.0*
*Canonical path: `/docs/master_spec_expanded.md`*
