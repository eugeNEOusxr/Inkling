# Inkling — Product Architecture: Conversational Memory Protocol v1

> Inkling is not a note-taking app. It is an **external memory system** that learns
> through natural conversation and gradually builds a living knowledge graph of a
> person's life — projects, goals, ideas, skills, relationships.
>
> The user should never feel like they're taking notes. They should feel like
> they're having a conversation. The system decides what's worth remembering.

This document has two halves:
1. **The Protocol** — the product spec / vision (the source of truth for behavior).
2. **The Architecture** — how it maps onto Inkling's real codebase + a phased roadmap.

---

## Part 1 — The Protocol

### Core principles
1. **Conversation first**
2. **Memory second**
3. **Notes last**

The user speaks naturally; the AI is responsible for: extracting meaning,
detecting importance, creating relationships, building memory structures, and
generating insights.

### Memory layers
| Layer | Name | What it is | Lifecycle |
|---|---|---|---|
| 1 | **Raw conversations** | Immutable transcript records | Append-only, never edited |
| 2 | **Extracted facts** | AI-scanned statements w/ confidence | Derived, reprocessable |
| 3 | **Memories** | Facts that recur → durable entities | Promoted, scored, decayed |
| 4 | **Knowledge graph** | Nodes + relationships | Continuously woven |

**Layer 1 — Conversation:** `{ id, timestamp, session_id, speaker, content, metadata }`.
Purpose: historical replay, future reprocessing, memory reconstruction.

**Layer 2 — Fact:** `{ id, confidence, timestamp, source_conversation, category, content }`.
e.g. "User is studying precalculus", "User is building WorldWeaver".

**Layer 3 — Memory:** types = Person · Project · Goal · Skill · Interest · Event ·
Belief · Preference · Relationship · Concept. Facts that repeatedly appear become
memories with properties + links.

**Layer 4 — Knowledge graph:**
- Node types: Person · Place · Project · Concept · Goal · Event · Skill · Resource
- Relationship types: RELATED_TO · CREATED_BY · STUDYING · INTERESTED_IN ·
  DEPENDS_ON · INSPIRED_BY · OCCURRED_BEFORE · OCCURRED_AFTER

### Importance scoring (0–100)
Weighted from: **frequency** (how often discussed), **duration** (how long),
**emotional weight** (detected significance), **project relevance** (tied to active
goals), **recency**, and explicit **user commands** ("remember this",
"this is important"). The weighted score drives retention.

### Memory decay
- **Temporary** — expires automatically ("buy milk")
- **Seasonal** — reviewed periodically
- **Permanent** — never deleted ("WorldWeaver project")
- **Core identity** — highest protection

### Memory confidence
Each memory stores `confidence` 0.0–1.0. Only high-confidence memories become
permanent automatically ("likes programming" 0.98 vs "wants to move to Mars" 0.12).

### Conversational recall
"What was I working on last month?" → search graph → search timeline → search
projects → generate summary.

### Timeline engine
Every memory carries `created_date / updated_date / last_accessed`; the system
constructs an explorable **life timeline** (2025: housing transition, Unity
learning · 2026: precalculus, Inkling architecture, WorldWeaver).

### Reflection engine (nightly)
AI reviews the day's conversations → generates insights, patterns, connections.
e.g. "You discussed memory systems 3× today; your WorldWeaver concept and your 3D
calendar concept may solve similar problems."

### Insight generation (weekly)
Surface: emerging interests · recurring themes · abandoned projects · knowledge
gaps · potential connections — ideas the user hasn't noticed.

### Project tracking engine
Projects are first-class entities tracking purpose, status, tasks, resources,
ideas, conversations — evolving automatically through conversation.

### Voice capture protocol (future)
"Inkling, remember this." → record → transcribe → extract concepts → generate
memory candidates → confirm if confidence is low. Audio deletion configurable.

### End goal
Not an AI assistant — a **persistent cognitive companion**, an external memory
layer for human thought that can answer: What have I learned? What am I building?
What patterns define my life? What ideas have I forgotten? What connections have I
missed?

---

## Part 2 — The Architecture (grounding in Inkling today)

### System shape
- **Client**: the Inkling PWA (GitHub Pages, `eugeneousxr.github.io`), 3D/2D
  calendar + Inkling chat + voice-to-text + web-push alarms.
- **Backend**: zero-dep Node server on Render (`server/`), user store (JSON files
  or Neon Postgres), `/api/*` routes, OpenAI-compatible LLM provider (mock without
  a key), web-push dispatcher.
- **LLM**: server-side for signed-in users (`generateInklingChat`); a local
  intent-router (`AIBrain` + lexicons) for guests.

### What already exists vs. what's new
| Protocol piece | Today in the codebase | Gap to build |
|---|---|---|
| L1 Conversations | Inkling chat (`/api/inkling/chat`, `fetchInklingChat.js`, `InklingPanel`) — **ephemeral** | A durable append-only **conversation store** (per user) |
| L2 Facts | — | LLM **extraction pass** over conversations → facts table |
| L3 Memories | `patternBrain.js` derives patterns from timeline events | A **memory store** w/ promotion + scoring + decay |
| L4 Knowledge graph | `Connections2D` / WordWeaver "connections" viz seed | A **graph store** (nodes + edges) + the weaving job |
| Importance scoring | — | Scoring service (frequency/recency/emotion/relevance/commands) |
| Decay | — | Decay categories + a sweep (reuse the alarm scheduler cadence) |
| Recall | calendar/timeline search; chat | **Graph+timeline query** behind a recall intent |
| Timeline engine | `timelineModel.js` events (dates), 3D calendar, `WeaverHelix` | Attach memory `created/updated/last_accessed`; life-timeline view |
| Reflection (nightly) | `patternBrain` insight stubs (`patternInsights`, `reportSuggestions`, `recentRemarks`, `checkInQuestions`) | A scheduled **reflection job** → push/digest |
| Insights (weekly) | same stubs | Weekly rollup surface |
| Project tracking | `GoalsPanel` (goals) | **Project entity** + auto-evolution from chat |
| Voice capture | ✅ voice-to-text shipped (NoteAddBar mic + chat mic, `webkitSpeechRecognition`) | "Inkling, remember this" wake-phrase + candidate confirm |
| Confidence | — | `confidence` field on facts/memories |

### Proposed data model (backend)
Per-user, alongside the existing user record / `/api/sync` bundle:
- `conversations[]` — `{ id, ts, sessionId, speaker, content, meta }` (immutable)
- `facts[]` — `{ id, confidence, ts, sourceConvId, category, content }`
- `memories[]` — `{ id, type, name, properties{}, confidence, importance, decay, created, updated, lastAccessed }`
- `graph` — `{ nodes[]: {id,type,label}, edges[]: {from,to,rel,weight} }`
- `projects[]` — `{ id, name, purpose, status, tasks[], resources[], links[] }`

Storage: start in the user JSON/bundle (small), migrate hot paths to Postgres
(Neon) as volume grows. Conversations are the only large append-only set — cap +
archive older sessions.

### Processing pipeline
```
chat turn ─▶ (1) append to conversations
          └▶ (2) extract facts (LLM)  ─▶ (3) score importance
                                       └▶ (4) promote recurring facts → memories
                                              └▶ (5) weave memories → graph edges
nightly  ─▶ reflection job over the day's conversations → insights → push/digest
weekly   ─▶ insight rollup (emerging / recurring / abandoned / gaps / connections)
sweep    ─▶ apply decay by category + confidence
```
Extraction/reflection run **server-side** (LLM) for signed-in users; queue per
session and batch to control cost. Guests get a lighter local heuristic pass.

### Privacy & control
- Memory is the user's; **export + clear** already exist (Settings → Privacy).
- Per-category decay + "forget this" must be user-invokable.
- Voice audio deletion configurable; transcripts kept, audio optional.
- Confidence + provenance (`source_conversation`) make every memory auditable.

### Phased roadmap
1. **Persist conversations** (L1) — store chat turns durably; foundation for all else.
2. **Fact extraction + confidence** (L2) — LLM pass per turn/session → facts.
3. **Memory promotion + importance + decay** (L3) — recurring facts become scored, decaying memories.
4. **Knowledge graph + weaving** (L4) — nodes/edges; surface in the WordWeaver/Connections 3D view.
5. **Recall + timeline** — "what was I working on…" queries; life-timeline surface.
6. **Reflection + insights** — nightly/weekly jobs → push digests (web push already shipped).
7. **Projects + wake-phrase voice capture** — first-class projects; "Inkling, remember this."

### Open questions
- Cost ceiling for per-turn LLM extraction (batch vs. on-demand?).
- Conversation retention/cap before archive.
- Graph store: keep in the JSON bundle vs. a real graph/relational store at scale.
- Where the knowledge graph renders (reuse `Connections2D` + the 3D calendar's
  connections vision).
