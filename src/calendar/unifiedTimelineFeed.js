/**
 * Combined notes + appointments + alerts for the 2D unified timeline (Reader).
 */
import { segmentFromTime, DAY_SEGMENTS } from "../inkling-core/timelineNode.js";
import { buildNotebookReaderItems } from "./notebookReaderFeed.js";

export { buildNotebookReaderItems };
export { DAY_SEGMENTS };

const SEGMENT_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night"
};

/**
 * @param {import("./notebookReaderFeed.js").ReaderItem} item
 * @returns {import("../inkling-core/timelineNode.js").DaySegment}
 */
export function segmentForItem(item) {
  return segmentFromTime(item.timeLabel || "12:00");
}

/**
 * @param {string} iso YYYY-MM-DD
 */
function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Monday-start week containing anchor date.
 * @param {string} anchorIso
 */
export function weekRangeForDate(anchorIso) {
  const d = parseIso(anchorIso);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toIso(start), end: toIso(end) };
}

/**
 * @param {string} anchorIso
 */
export function monthRangeForDate(anchorIso) {
  const d = parseIso(anchorIso);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toIso(start), end: toIso(end) };
}

/**
 * @param {import("./notebookReaderFeed.js").ReaderItem[]} items
 * @param {'day'|'week'|'month'} scope
 * @param {string} anchorIso
 */
export function filterItemsByScope(items, scope, anchorIso) {
  if (scope === "day") {
    return items.filter((i) => i.date === anchorIso);
  }
  if (scope === "week") {
    const { start, end } = weekRangeForDate(anchorIso);
    return items.filter((i) => i.date >= start && i.date <= end);
  }
  const { start, end } = monthRangeForDate(anchorIso);
  return items.filter((i) => i.date >= start && i.date <= end);
}

/**
 * @param {import("./notebookReaderFeed.js").ReaderItem[]} items
 * @returns {Map<string, Map<string, import("./notebookReaderFeed.js").ReaderItem[]>>}
 */
export function groupByDateSegmentAndTime(items) {
  /** @type {Map<string, Map<string, Map<string, import("./notebookReaderFeed.js").ReaderItem[]>>>} */
  const tree = new Map();

  for (const item of items) {
    const seg = segmentForItem(item);
    if (!tree.has(item.date)) tree.set(item.date, new Map());
    const bySeg = tree.get(item.date);
    if (!bySeg.has(seg)) bySeg.set(seg, new Map());
    const byTime = bySeg.get(seg);
    const key = item.timeLabel;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(item);
  }
  return tree;
}

export function segmentLabel(segment) {
  return SEGMENT_LABELS[segment] ?? segment;
}
