import { escapeReaderHtml } from "./notebookReaderRender.js";

/**
 * Month-style 2D grid for notification wall (days with alert counts).
 * @param {import("../notifications/notificationFeed.js").NotificationWallGroup[]} groups
 * @param {number} year
 * @param {number} month 1-12
 */
export function renderNotificationMonthGrid(groups, year, month) {
  const byDate = new Map(groups.map((g) => [g.date, g.items]));
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;

  const parts = [];
  parts.push(`<div class="notification-wall-grid" role="grid" aria-label="Notification month grid">`);
  parts.push(`<div class="notification-wall-grid__weekdays">`);
  for (const d of ["M", "T", "W", "T", "F", "S", "S"]) {
    parts.push(`<span>${d}</span>`);
  }
  parts.push(`</div><div class="notification-wall-grid__cells">`);

  for (let i = 0; i < startPad; i++) {
    parts.push(`<span class="notification-wall-grid__pad" aria-hidden="true"></span>`);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const items = byDate.get(iso) ?? [];
    const count = items.length;
    const types = [...new Set(items.map((i) => i.type))].slice(0, 3);
    const dots = types
      .map((t) => `<span class="notification-wall-grid__dot notification-wall-grid__dot--${t}" aria-hidden="true"></span>`)
      .join("");

    parts.push(`
      <button type="button" class="notification-wall-grid__cell${count ? " has-items" : ""}"
        data-date="${escapeReaderHtml(iso)}" ${count ? "" : "disabled"}
        aria-label="${day}${count ? `, ${count} alerts` : ", no alerts"}">
        <span class="notification-wall-grid__day">${day}</span>
        ${count ? `<span class="notification-wall-grid__dots">${dots}</span>` : ""}
      </button>
    `);
  }

  parts.push(`</div></div>`);
  return parts.join("");
}
