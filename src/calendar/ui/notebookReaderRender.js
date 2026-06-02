import { formatReaderRowMeta } from "../notebookReaderFeed.js";

const KIND_LABEL = {
  note: "Note",
  "slot-note": "Timeline",
  reminder: "Reminder",
  alarm: "Alarm",
  appointment: "Appointment"
};

export function escapeReaderHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {import("../notebookReaderFeed.js").ReaderItem[]} items
 * @returns {Map<string, Map<string, import("../notebookReaderFeed.js").ReaderItem[]>>}
 */
export function groupReaderItemsByDateAndTime(items) {
  const byDate = new Map();
  for (const item of items) {
    if (!byDate.has(item.date)) byDate.set(item.date, new Map());
    const byTime = byDate.get(item.date);
    const key = item.timeLabel;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(item);
  }
  return byDate;
}

/**
 * Vertical timeline: only dates and time slots that have content.
 * @param {import("../notebookReaderFeed.js").ReaderItem[]} items
 * @param {{ includeJump?: boolean }} [opts]
 */
export function renderNotebookReaderRows(items, opts = {}) {
  const includeJump = opts.includeJump !== false;
  const byDate = groupReaderItemsByDateAndTime(items);
  const parts = [];

  for (const [date, byTime] of byDate) {
    const sortedTimes = [...byTime.keys()].sort((a, b) => a.localeCompare(b));
    parts.push(`<section class="notebook-reader__day" data-date="${escapeReaderHtml(date)}">`);
    parts.push(`<h3 class="notebook-reader__date">${escapeReaderHtml(date)}</h3>`);
    parts.push(`<div class="notebook-reader__timeline" role="list">`);

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

    parts.push(`</div></section>`);
  }

  return parts.join("");
}

/**
 * @param {HTMLElement} container
 * @param {(target: { dayId: string, hour: string, wall: string }) => void} onJump
 */
export function bindNotebookReaderJumpHandlers(container, onJump) {
  container.querySelectorAll(".notebook-reader__jump").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".notebook-reader__row");
      if (!row) return;
      onJump({
        dayId: row.getAttribute("data-day-id") ?? "",
        hour: row.getAttribute("data-hour") ?? "0",
        wall: row.getAttribute("data-wall") ?? "notebook"
      });
    });
  });
}
