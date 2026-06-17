/**
 * Inkling Mind — Stage 2: the cognitive core (storage-agnostic, synchronous).
 *
 * Pure in-memory graph builder + scorer + insight generator. Operates on the
 * SAME node/edge shape as graph.js (the IndexedDB persistence layer), so the
 * MVP validation harness and the production engine share one model — this is
 * not throwaway. Persistence is a trivial map from this structure to graph.js.
 *
 * Pipeline per turn: extract concepts → upsert nodes (frequency/sessions) →
 * recompute confidence + Open/Closed state → add co-occurrence edges →
 * recompute importance (degree centrality). Insights read the finished graph.
 */
import { extractConcepts } from "./extract.js";

export const CLOSE_THRESHOLD = 0.75; // mirrors graph.js — Open → Closed at this confidence

export function createMind() {
  return { nodes: new Map(), edges: new Map(), turnCount: 0, minTs: Infinity, maxTs: -Infinity };
}

function conceptId(label) {
  return "c_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** confidence rises with frequency and with spread across distinct sessions. */
function scoreConfidence(freq, sessionCount) {
  const base = 1 - 1 / (1 + freq);            // 1→.50  2→.67  3→.75  4→.80
  const spread = Math.min(0.25, (sessionCount - 1) * 0.08);
  return Math.min(1, base + spread);
}

function upsertNode(mind, { label, type }, sessionId, ts) {
  const id = conceptId(label);
  let node = mind.nodes.get(id);
  if (!node) {
    node = {
      id, layer: 2, type, label,
      state: "open", confidence: 0, importance: 0,
      props: { frequency: 0, sessions: [], stances: [], firstTs: ts, lastTs: ts }
    };
    mind.nodes.set(id, node);
  }
  node.props.frequency += 1;
  if (!node.props.sessions.includes(sessionId)) node.props.sessions.push(sessionId);
  node.props.lastTs = ts;
  node.confidence = scoreConfidence(node.props.frequency, node.props.sessions.length);
  if (node.state === "open" && node.confidence >= CLOSE_THRESHOLD) node.state = "closed";
  return node;
}

function upsertEdge(mind, fromId, toId, rel) {
  if (fromId === toId) return;
  const [a, b] = [fromId, toId].sort();
  const id = `e_${a}_${rel}_${b}`;
  let edge = mind.edges.get(id);
  if (!edge) {
    edge = { id, from: a, to: b, rel, weight: 0, confidence: 0 };
    mind.edges.set(id, edge);
  }
  edge.weight += 1;
  edge.confidence = Math.min(1, 1 - 1 / (1 + edge.weight));
  return edge;
}

/**
 * Ingest one conversation turn into the graph.
 * @param {object} mind
 * @param {{sessionId:string, speaker?:string, text:string, ts?:number, contradicts?:[string,string]}} turn
 */
export function ingestTurn(mind, turn) {
  const ts = turn.ts ?? Date.now();
  mind.turnCount += 1;
  mind.minTs = Math.min(mind.minTs, ts);
  mind.maxTs = Math.max(mind.maxTs, ts);

  const concepts = extractConcepts(turn.text);
  const ids = concepts.map((c) => upsertNode(mind, c, turn.sessionId, ts).id);

  // Co-occurrence edges: every pair mentioned together this turn.
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) upsertEdge(mind, ids[i], ids[j], "RELATED_TO");

  // Explicit contradiction (stance conflict captured in synthetic data).
  if (turn.contradicts?.length === 2) {
    const [a, b] = turn.contradicts;
    upsertNode(mind, { label: a, type: "concept" }, turn.sessionId, ts);
    upsertNode(mind, { label: b, type: "concept" }, turn.sessionId, ts);
    const edge = upsertEdge(mind, conceptId(a), conceptId(b), "CONTRADICTS");
    if (edge) edge.confidence = Math.max(edge.confidence, 0.6);
  }

  recomputeImportance(mind);
  return ids;
}

/** Degree centrality (edge-weighted) blended with frequency, normalized 0..1. */
export function recomputeImportance(mind) {
  const degree = new Map();
  for (const n of mind.nodes.keys()) degree.set(n, 0);
  for (const e of mind.edges.values()) {
    degree.set(e.from, (degree.get(e.from) || 0) + e.weight);
    degree.set(e.to, (degree.get(e.to) || 0) + e.weight);
  }
  let max = 0;
  const raw = new Map();
  for (const n of mind.nodes.values()) {
    const r = (degree.get(n.id) || 0) + 0.5 * n.props.frequency;
    raw.set(n.id, r);
    if (r > max) max = r;
  }
  for (const n of mind.nodes.values()) n.importance = max ? raw.get(n.id) / max : 0;
}

function degreeOf(mind, id) {
  let d = 0;
  for (const e of mind.edges.values()) if (e.from === id || e.to === id) d++;
  return d;
}

function neighborsOf(mind, id) {
  const set = new Set();
  for (const e of mind.edges.values()) {
    if (e.rel === "CONTRADICTS") continue;
    if (e.from === id) set.add(e.to);
    else if (e.to === id) set.add(e.from);
  }
  return set;
}

/**
 * Read the graph and produce Inkling's commentary.
 * @returns {{central:object[], recurring:object[], emerging:object[], suggestions:object[], contradictions:object[], lines:string[]}}
 */
export function insights(mind) {
  const nodes = [...mind.nodes.values()];
  const label = (id) => mind.nodes.get(id)?.label ?? id;

  // Central: highest degree-weighted importance.
  const central = [...nodes].sort((a, b) => b.importance - a.importance).slice(0, 4);

  // Recurring: closed (high-confidence) concepts seen across ≥2 sessions.
  const recurring = nodes
    .filter((n) => n.props.sessions.length >= 2 && n.confidence >= CLOSE_THRESHOLD)
    .sort((a, b) => b.props.frequency - a.props.frequency)
    .slice(0, 5);

  // Emerging: appeared recently, recurring a little, not yet settled (still Open).
  const span = (mind.maxTs - mind.minTs) || 1;
  const recentCut = mind.maxTs - span * 0.4;
  const emerging = nodes
    .filter((n) => n.props.firstTs >= recentCut && n.props.frequency >= 2 && n.state === "open")
    .sort((a, b) => b.props.frequency - a.props.frequency)
    .slice(0, 3);

  // Suggestions: unconnected pairs sharing ≥2 common neighbors (link prediction).
  const suggestions = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const na = neighborsOf(mind, a.id), nb = neighborsOf(mind, b.id);
      if (na.has(b.id)) continue; // already linked
      let common = 0;
      for (const x of na) if (nb.has(x)) common++;
      if (common >= 2) suggestions.push({ a: a.label, b: b.label, common });
    }
  }
  suggestions.sort((x, y) => y.common - x.common);
  const topSuggestions = suggestions.slice(0, 3);

  // Contradictions: explicit CONTRADICTS edges.
  const contradictions = [...mind.edges.values()]
    .filter((e) => e.rel === "CONTRADICTS")
    .map((e) => ({ a: label(e.from), b: label(e.to) }));

  const lines = [];
  if (central.length)
    lines.push(`🧭 “${central[0].label}” is the most central node in your thinking right now${central[1] ? `, alongside ${central.slice(1, 3).map((n) => `“${n.label}”`).join(" and ")}` : ""}.`);
  if (recurring.length)
    lines.push(`🔁 Recurring themes across multiple sessions: ${recurring.slice(0, 4).map((n) => `“${n.label}”`).join(", ")}.`);
  if (emerging.length)
    lines.push(`🌱 Emerging lately: ${emerging.map((n) => `“${n.label}”`).join(", ")} — newer, but already coming up more than once.`);
  for (const s of topSuggestions)
    lines.push(`🔗 “${s.a}” and “${s.b}” aren’t directly connected, but they share ${s.common} related ideas — you may want to connect them.`);
  for (const c of contradictions)
    lines.push(`⚖️ Possible tension: “${c.a}” vs “${c.b}” — you’ve framed these in opposing ways.`);
  if (!lines.length) lines.push("Not enough signal yet — feed me more conversation.");

  return { central, recurring, emerging, suggestions: topSuggestions, contradictions, lines };
}

/** Snapshot for persistence/inspection. */
export function snapshot(mind) {
  return { nodes: [...mind.nodes.values()], edges: [...mind.edges.values()] };
}

export { conceptId, degreeOf };
