/**
 * Inkling Mind — public API barrel (Abstraction Engine, stage 1: L0 + graph core).
 * Also exposes window.__inklingMind for inspection/debugging and future stages.
 */
import * as db from "./db.js";
import * as conversations from "./conversations.js";
import * as graph from "./graph.js";
import * as cognition from "./cognition.js";
import * as mindStore from "./mindStore.js";

export { db, conversations, graph, cognition, mindStore };
export { appendTurn, recentTurns, conversationCount, currentSessionId } from "./conversations.js";
export { putNode, putEdge, getNode, allNodes, nodesByLayer, nodesByState, neighbors, NODE_STATE } from "./graph.js";
export { clearMind, isMindSupported } from "./db.js";
export { extractConcepts } from "./extract.js";
export { ingestText, mindInsights, mindGraph, resetMindStore, connectConcepts, ingestCalendar, ingestGoals, syncSources, enrichFromServer } from "./mindStore.js";

if (typeof window !== "undefined" && !window.__inklingMind) {
  window.__inklingMind = { db, conversations, graph, cognition, mindStore };
}
