import { groupByDateSegmentAndTime, segmentLabel } from "../unifiedTimelineFeed.js";
import { formatReaderRowMeta } from "../notebookReaderFeed.js";
import {
  bindNotebookReaderJumpHandlers,
  escapeReaderHtml
} from "./notebookReaderRender.js";

const KIND_LABEL = {
  note: "Note",
  "slot-note": "Timeline",
  reminder: "Reminder",
  alarm: "Alarm",
  appointment: "Appointment"
};

/**
 * @param {Map<string, Map<string, import("../notebookReaderFeed.js").ReaderItem[]>>} bySeg
 * @param {{ includeJump?: boolean }} opts
 */
function renderSegmentBlocks(bySeg, opts = {}) {
  const includeJump = opts.includeJump !== false;
  const parts = [];
  const segments = ["morning", "afternoon", "night"];

  for (const segment of segments) {
    const byTime = bySeg.get(segment);
    if (!byTime?.size) continue;

    const sortedTimes = [...byTime.keys()].sort((a, b) => a.localeCompare(b));
    parts.push(`<div class="unified-timeline__segment" data-segment="${segment}">`);
    parts.push(`<h4 class="unified-timeline__segment-title">${escapeReaderHtml(segmentLabel(segment))}</h4>`);
    parts.push(`<div class="notebook-reader__timeline unified-timeline__segment-body" role="list">`);

    for (const timeLabel of sortedTimes) {
      const slotItems = byTime.get(timeLabel) ?? [];
      if (!slotItems.length) continue;
      const first = slotItems[0];
      const { when } = formatReaderRowMeta(first);

      parts.push(`
        <div class="notebook-reader__slot" role="listitem" data-time="${escapeReaderHtml(timeLabel)}">
          <div class="notebook-reader__slot-rail" aria-hidden="true"></div>
          <div class="notebook-reader__slot-time-col">
            <span class="notebook-reader__row-clock">${escapeReaderHtml(timeLabel)}</span>
            <span class="notebook-reader__row-when">${escapeReaderHtml(when)}</span>
          </div>
          <div class="notebook-reader__slot-entries">
      `);

      for (const item of slotItems) {
        const { icon } = formatReaderRowMeta(item);
        const kind = KIND_LABEL[item.kind] ?? item.kind;
        const jumpBtn = includeJump
          ? `<button type="button" class="btn-ghost btn-ghost--sm notebook-reader__jump" aria-label="Open this time">Open</button>`
          : "";
        parts.push(`
          <article class="notebook-reader__row notebook-reader__row--${item.kind} reader-entry-card"
            data-day-id="${escapeReaderHtml(item.dayId)}"
            data-hour="${escapeReaderHtml(item.timeLabel.split(":")[0])}"
            data-wall="${escapeReaderHtml(item.wall)}">
            <div class="notebook-reader__row-body">
              <span class="notebook-reader__row-kind">${icon} ${escapeReaderHtml(kind)}</span>
              <strong class="notebook-reader__row-title">${escapeReaderHtml(item.title)}</strong>
              <p class="notebook-reader__row-msg">${escapeReaderHtml(item.message)}</p>
            </div>
            ${jumpBtn}
          </article>
        `);
      }

      parts.push(`</div></div>`);
    }

    parts.push(`</div></div>`);
  }

  return parts.join("");
}

/**
 * @param {import("../notebookReaderFeed.js").ReaderItem[]} items
 * @param {'day'|'week'|'month'} scope
 * @param {string} anchorIso
 * @param {{ includeJump?: boolean }} [opts]
 */
export function renderUnifiedTimeline(items, scope, anchorIso, opts = {}) {
  const tree = groupByDateSegmentAndTime(items);
  const dates = [...tree.keys()].sort((a, b) => a.localeCompare(b));
  const parts = [];

  if (scope === "day") {
    const bySeg = tree.get(anchorIso);
    if (!bySeg?.size) return "";
    parts.push(`<section class="unified-timeline unified-timeline--day" data-anchor="${escapeReaderHtml(anchorIso)}">`);
    parts.push(`<h3 class="notebook-reader__date">${escapeReaderHtml(anchorIso)}</h3>`);
    parts.push(renderSegmentBlocks(bySeg, opts));
    parts.push(`</section>`);
    return parts.join("");
  }

  const scopeClass = scope === "week" ? "week" : "month";
  parts.push(`<div class="unified-timeline unified-timeline--${scopeClass}" data-anchor="${escapeReaderHtml(anchorIso)}">`);

  for (const date of dates) {
    const bySeg = tree.get(date);
    if (!bySeg?.size) continue;
    parts.push(`<section class="unified-timeline__day-block" data-date="${escapeReaderHtml(date)}">`);
    parts.push(`<h3 class="notebook-reader__date">${escapeReaderHtml(date)}</h3>`);
    parts.push(renderSegmentBlocks(bySeg, opts));
    parts.push(`</section>`);
  }

  parts.push(`</div>`);
  return parts.join("");
}

export { bindNotebookReaderJumpHandlers };
