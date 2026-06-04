import { getEventsForMonth, getInitialNotes, todayIsoDate } from "./timelineModel.js";
import { loadAlerts } from "../calendar/alerts/alertsModel.js";
import { createDayCell2D } from "./DayCell2D.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Full or mini month grid (7 columns).
 */
export class MonthGrid2D {
  /**
   * @param {{
   *   year: number,
   *   month: number,
   *   compact?: boolean,
   *   showWeekdayRow?: boolean,
   *   onDaySelect?: (dateIso: string) => void
   * }} opts
   */
  constructor(opts) {
    this.year = opts.year;
    this.month = opts.month;
    this.compact = opts.compact ?? false;
    this.showWeekdayRow = opts.showWeekdayRow ?? !opts.compact;
    this.onDaySelect = opts.onDaySelect ?? (() => {});

    this.root = document.createElement("div");
    this.root.className = "ww-month-grid-2d";
    if (this.compact) this.root.classList.add("ww-month-grid-2d--compact");
  }

  /**
   * @returns {HTMLElement}
   */
  render() {
    const today = todayIsoDate();
    const monthEvents = getEventsForMonth(this.year, this.month);
    const initialNotes = getInitialNotes();
    const alertIds = new Set(
      loadAlerts()
        .filter((a) => !a.dismissed && a.timelineEntryId)
        .map((a) => a.timelineEntryId)
    );

    const first = new Date(this.year, this.month - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

    this.root.replaceChildren();

    if (this.showWeekdayRow) {
      const row = document.createElement("div");
      row.className = "ww-month-grid-2d__weekdays";
      row.setAttribute("aria-hidden", "true");
      for (const label of WEEKDAYS) {
        const span = document.createElement("span");
        span.textContent = label;
        row.appendChild(span);
      }
      this.root.appendChild(row);
    }

    const grid = document.createElement("div");
    grid.className = "ww-month-grid-2d__cells";

    for (let cell = 0; cell < totalCells; cell++) {
      const dayNum = cell - startPad + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        const pad = document.createElement("span");
        pad.className = "ww-day-cell-2d ww-day-cell-2d--pad";
        pad.setAttribute("aria-hidden", "true");
        grid.appendChild(pad);
        continue;
      }

      const iso = `${this.year}-${String(this.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      let dayEvents = monthEvents.filter((e) => e.date === iso);
      if (iso === today && !dayEvents.length && initialNotes.length) {
        dayEvents = initialNotes.map((n, i) => ({
          id: `starter-${i}`,
          date: iso,
          category: n.category,
          text: n.text,
          time: n.time
        }));
      }

      const enriched = dayEvents.map((e) => ({
        category: e.category,
        alertId: e.alertId || (alertIds.has(e.id) ? "1" : undefined),
        id: e.id
      }));

      grid.appendChild(
        createDayCell2D({
          day: dayNum,
          dateIso: iso,
          events: enriched,
          compact: this.compact,
          isToday: iso === today,
          onSelect: (d) => this.onDaySelect(d)
        })
      );
    }

    this.root.appendChild(grid);
    return this.root;
  }
}
