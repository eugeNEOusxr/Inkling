/**
 * Inkling Mind — live bridge between the cognitive core and persistence.
 *
 * The in-memory cognition graph (cognition.js) is rebuilt from the immutable
 * Layer-0 conversation log (the source of truth) on first use, then kept warm
 * and persisted to the IndexedDB graph stores (graph.js shape) as new turns
 * arrive. This is WordWeaver wired into the running app: every real chat turn
 * grows the on-device knowledge graph. No network, no LLM key.
 */
import { createMind, ingestTurn, insights, snapshot } from "./cognition.js";
import { recentTurns } from "./conversations.js";
import { putMany } from "./db.js";

let _mind = null;
let _ready = null;

/** Rebuild the graph from all captured conversations, then persist it. */
async function ensureReady() {
  if (_ready) return _ready;
  _ready = (async () => {
    _mind = createMind();
    try {
      const turns = await recentTurns(0); // 0 = all, oldest→newest
      for (const t of turns) {
        ingestTurn(_mind, { sessionId: t.sessionId, speaker: t.speaker, text: t.content, ts: t.ts });
      }
      await persist();
    } catch {
      /* engine must never break the app */
    }
    return _mind;
  })();
  return _ready;
}

/** Write the current nodes + edges to IndexedDB (small graphs: full rewrite). */
async function persist() {
  if (!_mind) return;
  const { nodes, edges } = snapshot(_mind);
  try {
    await Promise.all([putMany("nodes", nodes), putMany("edges", edges)]);
  } catch {
    /* ignore persistence failures */
  }
}

/**
 * Ingest one live turn (called right after Layer-0 capture).
 * @param {{ sessionId:string, speaker?:string, content:string, ts?:number }} t
 */
export async function ingestText(t) {
  await ensureReady();
  if (!t?.content) return null;
  ingestTurn(_mind, { sessionId: t.sessionId, speaker: t.speaker, text: t.content, ts: t.ts });
  await persist();
  return _mind;
}

/** Current insights (central / recurring / emerging / suggestions / contradictions). */
export async function mindInsights() {
  await ensureReady();
  return insights(_mind);
}

/** Current graph snapshot for viewers. */
export async function mindGraph() {
  await ensureReady();
  return snapshot(_mind);
}

/** Force a rebuild (e.g. after import or clear). */
export function resetMindStore() {
  _mind = null;
  _ready = null;
}
