/**
 * Inkling Mind — the layered property graph core (Layers 2–6).
 *
 * Nodes + edges with the Open/Closed/Emergent state machine and confidence.
 * Higher stages (concepts, abstractions, models) create nodes through here.
 * See docs/INKLING_ABSTRACTION_ENGINE.md §2–§3.
 */
import { put, get, getAll, getAllByIndex, del, mindId } from "./db.js";

export const NODE_STATE = { OPEN: "open", CLOSED: "closed", EMERGENT: "emergent" };
export const CLOSE_THRESHOLD = 0.75; // confidence at which an Open node becomes Closed

/**
 * Create/replace a node. Defaults: Open, confidence 0.
 * @param {{ id?:string, layer:number, type:string, label:string,
 *           state?:string, confidence?:number, props?:object }} n
 */
export async function putNode(n) {
  const now = Date.now();
  const existing = n.id ? await get("nodes", n.id) : null;
  const node = {
    id: n.id || mindId("n"),
    layer: n.layer,
    type: n.type,
    label: n.label,
    state: n.state || existing?.state || NODE_STATE.OPEN,
    confidence: n.confidence ?? existing?.confidence ?? 0,
    decay: n.decay ?? existing?.decay ?? "seasonal",
    props: { ...(existing?.props || {}), ...(n.props || {}) },
    created: existing?.created ?? now,
    updated: now,
    lastAccessed: existing?.lastAccessed ?? now
  };
  await put("nodes", node);
  return node;
}

export const getNode = (id) => get("nodes", id);
export const allNodes = () => getAll("nodes");
export const nodesByLayer = (layer) => getAllByIndex("nodes", "layer", layer);
export const nodesByState = (state) => getAllByIndex("nodes", "state", state);
export const deleteNode = (id) => del("nodes", id);

/** Touch lastAccessed (recall/decay signal). */
export async function touchNode(id) {
  const node = await get("nodes", id);
  if (!node) return null;
  node.lastAccessed = Date.now();
  await put("nodes", node);
  return node;
}

/** Recompute state from confidence (Open→Closed at threshold). */
export async function reconcileNodeState(id) {
  const node = await get("nodes", id);
  if (!node) return null;
  if (node.state === NODE_STATE.OPEN && node.confidence >= CLOSE_THRESHOLD) {
    node.state = NODE_STATE.CLOSED;
    node.updated = Date.now();
    await put("nodes", node);
  }
  return node;
}

/**
 * Create/replace a typed edge.
 * @param {{ id?:string, from:string, to:string, rel:string,
 *           weight?:number, state?:string, confidence?:number }} e
 */
export async function putEdge(e) {
  const id = e.id || `e_${e.from}_${e.rel}_${e.to}`;
  const existing = await get("edges", id);
  const edge = {
    id,
    from: e.from,
    to: e.to,
    rel: e.rel,
    weight: e.weight ?? existing?.weight ?? 1,
    state: e.state || existing?.state || NODE_STATE.OPEN,
    confidence: e.confidence ?? existing?.confidence ?? 0,
    updated: Date.now()
  };
  await put("edges", edge);
  return edge;
}

export const edgesFrom = (nodeId) => getAllByIndex("edges", "from", nodeId);
export const edgesTo = (nodeId) => getAllByIndex("edges", "to", nodeId);
export const allEdges = () => getAll("edges");
export const deleteEdge = (id) => del("edges", id);

/** Neighbors (both directions) of a node. */
export async function neighbors(nodeId) {
  const [out, inc] = await Promise.all([edgesFrom(nodeId), edgesTo(nodeId)]);
  const ids = new Set([...out.map((e) => e.to), ...inc.map((e) => e.from)]);
  const nodes = await Promise.all([...ids].map((id) => get("nodes", id)));
  return nodes.filter(Boolean);
}
