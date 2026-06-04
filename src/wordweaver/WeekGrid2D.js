import {
  getEventsForWeek,
  getWeekStartMonday,
  CategoryColors,
  formatTimelineDisplayTime,
  parseIsoDate,
  isoFromDate
} from "./timelineModel.js";
import { loadAlerts } from "../calendar/alerts/alertsModel.js";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Week columns (Mon → Sun) with category-colored events.
 */
export class WeekGrid2D {
  /**
   * @param {{ weekStartIso: string, onDaySelect?: (dateIso: string) => void }} opts
   */
  constructor(opts) {
    this.weekStartIso = opts.weekStartIso;
    this.onDaySelect = opts.onDaySelect ?? (() => {});
    this.root = document.createElement("div");
    this.root.className = "ww-week-grid-2d";
  }

  /**
   * @returns {HTMLElement}
   */
  render() {
    const alertIds = new Set(loadAlerts().filter((a) => !a.dismissed).map((a) => a.id));
    const alertByTimeline = new Set(
      loadAlerts()
        .filter((a) => !a.dismissed && a.timelineEntryId)
        .map((a) => a.timelineEntryId)
    );

    const weekEvents = getEventsForWeek(this.weekStartIso);
    const start = parseIsoDate(this.weekStartIso);

    this.root.replaceChildren();

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = isoFromDate(d);
      const dayEvents = weekEvents.filter((ev) => ev.date === iso);

      const col = document.createElement("div");
      col.className = "ww-week-grid-2d__col";

      const header = document.createElement("button");
      header.type = "button";
      header.className = "ww-week-grid-2d__col-header";
      header.textContent = `${DAY_NAMES[i]}, ${d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
      })}`;
      header.addEventListener("click", () => this.onDaySelect(iso));
      col.appendChild(header);

      const eventsWrap = document.createElement("div");
      eventsWrap.className = "ww-week-grid-2d__events";

      if (!dayEvents.length) {
        const empty = document.createElement("p");
        empty.className = "ww-week-grid-2d__empty";
        empty.textContent = "No events";
        eventsWrap.appendChild(empty);
      }

      for (const ev of dayEvents) {
        const block = document.createElement("button");
        block.type = "button";
        block.className = "ww-week-grid-2d__event";
        const cat = ev.category === "errand" ? "errands" : ev.category;
        block.style.backgroundColor = CategoryColors[cat] ?? CategoryColors.default;
        block.style.borderColor = CategoryColors[cat] ?? CategoryColors.default;

        const hasAlert =
          (ev.alertId && alertIds.has(ev.alertId)) || alertByTimeline.has(ev.id);
        block.innerHTML = `
          <span class="ww-week-grid-2d__event-row">
            ${hasAlert ? '<span title="Alert">⏰</span>' : ""}
            <span class="ww-week-grid-2d__event-time">${formatTimelineDisplayTime(ev.time)}</span>
          </span>
          <span class="ww-week-grid-2d__event-text"></span>
        `;
        block.querySelector(".ww-week-grid-2d__event-text").textContent = ev.text;
        block.addEventListener("click", () => this.onDaySelect(iso));
        eventsWrap.appendChild(block);
      }

      col.appendChild(eventsWrap);
      this.root.appendChild(col);
    }

    return this.root;
  }
}

/**
 * @param {string} dateIso
 * @returns {string}
 */
export function weekStartForDate(dateIso) {
  return getWeekStartMonday(parseIsoDate(dateIso));
}
