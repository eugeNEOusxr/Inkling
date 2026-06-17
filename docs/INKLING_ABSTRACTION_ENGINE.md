# Inkling — Abstraction Engine Architecture (v2)

> **Revises v1** (`INKLING_MEMORY_ARCHITECTURE.md`). Inkling is **not a memory
> system — it is an abstraction engine.** Conversations are observations of human
> thought; memories are intermediate artifacts. The objective is to discover
> concepts, abstractions, relationships, and emergent models that reveal the
> user's evolving understanding of the world.
>
> The goal is not to remember everything. **The goal is to discover meaning.**
> Design priority: **abstraction discovery > memory retention.**

The system never asks "what should be remembered?" It asks, in rising order:
**"What concept is emerging?" → "What abstraction explains these concepts?" →
"What world model explains these abstractions?"**

---

## 1. The abstraction stack (Layers 0–6)

Each layer is *derived bottom-up* from the one below and feeds the one above.
Lower layers are cheap/disposable; higher layers are the product.

| L | Layer | Unit | Produced by | Retention |
|---|---|---|---|---|
| 0 | **Conversations** | utterance | ingestion | rolling window, then archived/pruned |
| 1 | **Facts** | atomic statement | extraction | disposable once abstracted |
| 2 | **Concepts** | clustered theme | concept clustering | kept while referenced |
| 3 | **Abstractions** | higher-order pattern over concepts | abstraction engine | kept |
| 4 | **Relationships** | typed edges between any nodes | relationship engine | kept |
| 5 | **Emergent Models** | coherent cluster of abstractions+edges | model synthesis | kept (core) |
| 6 | **World View** | integrated set of models | worldview synthesis | core identity |

**Transforms (the heart of the engine):**
- 0→1: extract atomic facts from each utterance (subject–predicate–object + confidence).
- 1→2: cluster semantically-similar facts → **concepts** (e.g. many "studying math" facts → concept *Mathematics study*).
- 2→3: group co-occurring/related concepts → **abstractions** (*Mathematics study* + *Unity learning* + *AI memory* → abstraction *Self-directed technical learning*).
- 3/2→4: discover typed **relationships** between nodes (any layer).
- 3+4→5: detect coherent sub-graphs of abstractions → **emergent models** (*Builder identity: learns tools in order to build systems*).
- 5→6: integrate models → the **world view**.

Crucially, facts and even conversations are **expendable** once their meaning has
been lifted into higher layers — the opposite of a retention-first memory system.

---

## 2. Node states (the engine's epistemics)

Every node in **every layer** carries a `state`:

- **Open** — a *hypothesis*: a candidate concept/abstraction/relationship with
  insufficient evidence. The system's question-space. Actively seeks corroboration.
- **Closed** — a *known* node with confidence above the close threshold. Trusted
  for recall and as input to higher layers.
- **Emergent** — a node the **system itself proposed** (not stated by the user)
  from repeated observation. Born Open; becomes Closed when corroborated, pruned
  if it never earns evidence.

```
        new evidence ↑confidence
 Open ─────────────────────────▶ Closed
   ▲                               │ contradiction / staleness
   └──── system proposes ──── Emergent (starts Open)
        (no evidence after N) → pruned
```

State + confidence together decide what flows upward: only **Closed** (and
strongly-supported Open) nodes feed the next abstraction layer, so the world view
is built from earned structure, not noise.

---

## 3. Graph architecture (the unifying substrate)

Everything above L0 is **one layered property graph**.

- **Node**: `{ id, layer (1–6), type, label, state, confidence, evidence[], created, updated, lastAccessed, decay }`
  - `type` ∈ Person · Place · Project · Concept · Goal · Event · Skill · Resource · Belief · Preference · Abstraction · Model · Worldview
- **Edge**: `{ id, from, to, rel, weight, state, confidence, evidence[] }`
  - `rel` ∈ RELATED_TO · CREATED_BY · STUDYING · INTERESTED_IN · DEPENDS_ON · INSPIRED_BY · PART_OF · CONTRADICTS · OCCURRED_BEFORE · OCCURRED_AFTER · ABSTRACTS (lower→higher layer) · EVIDENCED_BY (→ fact/conversation)
- `evidence[]` always points down to the facts/conversations that justify the node/edge → full **provenance + reprocessability**.
- **ABSTRACTS** edges make the layer hierarchy navigable: a Model links down to its
  Abstractions → Concepts → Facts → the original Conversations.

Traversal powers recall, the open-node frontier (nodes with low confidence / few
edges), and the WordWeaver 3D "connections" visualization (the graph *is* the viz).

---

## 4. Database schema (local-first)

Primary store = **on-device IndexedDB** (the user's machine owns the data). Object
stores:

```
conversations  { id, ts, sessionId, speaker, content, source(text|voice), meta }
facts          { id, convId, subject, predicate, object, category, confidence, ts }
nodes          { id, layer, type, label, state, confidence, decay,
                 created, updated, lastAccessed, props{} }
edges          { id, from, to, rel, weight, state, confidence }
evidence       { id, nodeOrEdgeId, factId|convId, weight, ts }   // many-to-many
embeddings     { refId, vector }                                // facts/concepts (optional, local)
frontier       { id, hypothesis, kind(gap|partial|contradiction), score, asked }
models         { id, name, summary, nodeIds[], confidence }      // L5
worldview      { id, summary, modelIds[], updated }              // L6 (singleton)
jobs           { id, type, status, cursor }                      // pipeline bookkeeping
```

Indexed by `layer`, `state`, `confidence`, `updated` for cheap sweeps. Optional
**encrypted sync** mirrors these to the backend for multi-device (see §11). The
existing `/api/sync` bundle is the migration seam.

---

## 5. Engines

### 5.1 Ingestion / "memory" engine (deliberately thin)
Append every utterance to `conversations` (immutable). Memory here is just the
substrate; it stages work for abstraction. Maintains a **work queue** of
un-processed conversation spans. Rolling window kept hot; older sessions
summarized + archived (their abstractions already persist higher up).

### 5.2 Abstraction engine (core)
Runs on idle / schedule, bottom-up:
1. **Extract** facts from new utterances (LLM or local heuristic) → `facts`.
2. **Embed** facts (local embedding model where available; else lexical fingerprint).
3. **Cluster** facts by similarity → candidate **concepts** (L2). New cluster → Open node.
4. **Lift** related concepts → candidate **abstractions** (L3) via higher-level clustering / community detection on the concept sub-graph.
5. Each promotion writes `ABSTRACTS` + `EVIDENCED_BY` edges (provenance).
Naming of concepts/abstractions: an LLM (or template) labels the cluster; the
label is itself Open until reused.

### 5.3 Relationship engine
Discovers typed edges: co-occurrence within sessions, temporal ordering
(OCCURRED_BEFORE/AFTER from timestamps), dependency/inspiration cues from language,
and **contradiction** detection (CONTRADICTS edges flag belief shifts). Edge
weight grows with corroboration; weak edges decay.

### 5.4 Confidence scoring
`confidence ∈ [0,1]` per node/edge, recomputed on new evidence:
```
confidence = w1·frequency + w2·recency + w3·consistency
           + w4·corroboration(distinct sources) + w5·emotional_weight
           + w6·user_confirmation        (clamped 0–1)
```
Thresholds: `≥ τ_close` (e.g. 0.75) → **Closed**; an Open node below `τ_min` after
N observations → pruned. **User commands** ("remember this", "I believe…") inject a
large `user_confirmation` term and can pin a node (decay-exempt).

### 5.5 Open-node discovery
The system maintains a **frontier** of hypotheses it can't yet confirm:
- **Gaps** — a concept with dangling/expected-but-missing relations.
- **Partials** — a pattern seen 1–2×, not yet a stable concept.
- **Contradictions** — conflicting facts → an Open "which is true?" node.
Frontier items are ranked; high-value ones become **clarifying questions** Inkling
can ask in conversation (turning dialogue into targeted evidence-gathering).

### 5.6 Emergent-node generation
Periodically run abstraction over the concept/abstraction graph; when a dense
cluster has **no naming node**, the system *generates* one (LLM names the latent
theme) as an **Emergent** node (Open). This is Inkling discovering an abstraction
the user never explicitly stated. It earns Closed status only through subsequent
corroboration, else it's pruned — keeping invention honest.

### 5.7 World-model generation
From L5 models, synthesize **L6 worldview**: the integrated account of how the
user sees the world. Periodic (weekly) LLM/template pass over high-confidence
models → a living `worldview` summary + the model graph. Answers "what patterns
define my life / how do I think?".

---

## 6. Conversational recall
Recall is a **graph + timeline query** behind natural questions:
- "What's emerging?" → newest Emergent/Open nodes by score.
- "What do I believe about X?" → nodes near X + their Beliefs/Abstractions.
- "What was I working on last month?" → timeline ∩ Project/Goal nodes.
- "What have I forgotten?" → high-confidence nodes with stale `lastAccessed`.
- "What connections have I missed?" → predicted edges between distant high-confidence nodes.
Flow: parse intent → traverse graph (filter by layer/state/confidence) → optional
LLM to phrase the answer. Every answer can drill to its evidence (provenance).

---

## 7. Local-first privacy architecture
- **Data lives on the device** (IndexedDB): conversations, facts, the whole graph.
  Inkling works fully offline for capture + recall of existing structure.
- **Processing tiers:** (1) local heuristics/lexicon (always), (2) optional
  **on-device embedding/LLM** (transformers.js / WebGPU) for clustering + naming,
  (3) opt-in **cloud LLM** for heavy extraction/world-model prose — sent only with
  explicit consent, **minimized + redactable**, never the raw store wholesale.
- **Sync is optional and end-to-end encrypted** (key from the user passphrase);
  the server stores ciphertext only. Matches today's stance (free-tier ephemeral
  backend, local-first calendar data).
- **User owns everything:** export (already in Settings → Privacy), per-node
  "forget", category decay, and audio-deletion controls.

## 8. Voice ingestion workflow
Builds on the shipped voice-to-text (`webkitSpeechRecognition`):
```
mic / wake-phrase "Inkling, remember this"
  → transcribe (on-device Web Speech; audio discarded by default)
  → conversation record (source: voice)
  → fact extraction → abstraction pipeline
  → if low confidence, Inkling confirms the candidate before closing it
```
Audio retention is configurable (default: transcript only). Hands-free capture
feeds the same L0→L6 pipeline as typed chat.

---

## 9. End-to-end pipeline
```
utterance ─▶ L0 store ─▶ extract ─▶ L1 facts ─▶ embed/cluster ─▶ L2 concepts(Open)
   │                                                   └▶ lift ─▶ L3 abstractions(Open)
   ▼                                                              └▶ relate ─▶ L4 edges
 recall (graph+timeline query, anytime)        confidence sweep promotes Open→Closed,
                                                prunes stale, decays weak
 idle/nightly:  emergent-node generation · open-node frontier → clarifying questions
 weekly:        emergent models (L5) → world view (L6) → digest (web push)
```

## 10. Mapping to the codebase + roadmap
**Today:** chat (ephemeral) · `patternBrain.js` (pattern seed) · `Connections2D` +
WordWeaver connections (graph-viz seed) · voice-to-text (shipped) · web push
(digest channel) · `timelineModel` (timeline) · local-first calendar storage +
`/api/sync`.

**Build order (each deployable):**
1. **L0 store** — durable on-device conversations (IndexedDB) + work queue.
2. **L1 extraction + confidence** — facts with provenance.
3. **Graph core** — nodes/edges store + state machine (Open/Closed/Emergent) + the WordWeaver graph view reads it.
4. **L2 concepts** — clustering (local fingerprint first, embeddings later).
5. **Confidence sweep + decay + open-node frontier** — promotion/pruning + clarifying questions.
6. **L3 abstractions + relationship engine.**
7. **Emergent nodes.**
8. **L5 models → L6 world view** + weekly digest.
9. **Local embedding/LLM tier + encrypted sync.**

## 11. Open questions
- On-device model feasibility (transformers.js/WebGPU size vs. phone limits) vs. opt-in cloud.
- Clustering algorithm for L1→L2→L3 (HDBSCAN-style on embeddings? community detection on the lexical graph?).
- Conversation retention window before summarize-and-archive.
- Graph scale: IndexedDB now; when (if) a real graph DB is warranted.
- Cost ceiling + batching for any cloud LLM steps.
