/**
 * Persist and load timeline nodes (Inkling graph / WordWeaver segments).
 */
import { getNotesForDate } from "../utils/storage.js";
import { buildSegmentModule, demoSegmentNodes, nodesFromSlotNotes } from "./timelineNode.js";

const PREFIX = "inkling:";
const NODES_KEY = `${PREFIX}timelineNodes`;

/** @typedef {import('./timelineNode.js').TimelineNode} TimelineNode */
/** @typedef {import('./timelineNode.js').SegmentModule} SegmentModule */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/**
 * @returns {TimelineNode[]}
 */
export function getAllTimelineNodes() {
  return readJson(NODES_KEY, []);
}

/**
 * @param {TimelineNode[]} nodes
 */
export function saveAllTimelineNodes(nodes) {
  writeJson(NODES_KEY, nodes);
}

/**
 * @param {string} date
 * @param {DaySegment} segment
 * @returns {TimelineNode[]}
 */
export function getNodesForSegment(date, segment) {
  const all = getAllTimelineNodes();
  const stored = all.filter((n) => n.date === date && n.segment === segment);
  if (stored.length) return stored;

  const fromNotes = nodesFromSlotNotes(date, segment, getNotesForDate(date));
  if (fromNotes.length) return fromNotes;

  return demoSegmentNodes(date, segment);
}

/**
 * @param {string} date
 * @param {DaySegment} segment
 * @returns {SegmentModule}
 */
export function getSegmentModule(date, segment) {
  return buildSegmentModule(date, segment, getNodesForSegment(date, segment));
}

/**
 * Upsert nodes for a date+segment (replaces segment slice).
 * @param {string} date
 * @param {DaySegment} segment
 * @param {TimelineNode[]} nodes
 */
export function saveNodesForSegment(date, segment, nodes) {
  const all = getAllTimelineNodes().filter((n) => !(n.date === date && n.segment === segment));
  saveAllTimelineNodes([...all, ...nodes]);
}
