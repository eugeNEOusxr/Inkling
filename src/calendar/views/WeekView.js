import {
  getEventsForWeek,
  getWeekStartMonday,
  CategoryColors,
  formatTimelineDisplayTime,
  parseIsoDate,
  isoFromDate
} from "../../wordweaver/timelineModel.js";
import { loadAlerts } from "../alerts/alertsModel.js";
import { on as onBus } from "../../utils/EventBus.js";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** @type {WeekView | null} */
let instance = null;

function ensureStyles() {
  if (document.getElementById("week-month-view-styles")) return;
  const link = document.createElement("link");
  link.id = "week-month-view-styles";
  link.rel = "stylesheet";
  link.href = "/style-week-month-views.css";
  document.head.appendChild(link);
}

/**
 * Week grid — Mon → Sun columns with category-colored events.
 */
export class WeekView {
  constructor() {
    this.el = null;
    this.scrollEl = null;
    this.weekStart = getWeekStartMonday();
    ensureStyles();
    this._bindEvents();
  }

  _bindEvents() {
    document.addEventListener("inkling:open-panel", (e) => {
      const id = e.detail?.panelId;
      if (id === "weekView") {
        if (e.detail?.date) {
          this.weekStart = getWeekStartMonday(parseIsoDate(e.detail.date));
        }
        this.open();
      }
    });
    document.addEventListener("inkling:close-all-panels", () => this.close());
    const refreshAlerts = () => {
      if (this.isOpen()) this.render();
    };
    onBus("eventUpdated", refreshAlerts);
    onBus("eventDeleted", refreshAlerts);
    onBus("alertTriggered", refreshAlerts);
    onBus("navigateTo", (p) => {
      if (p?.level !== "week") return;
      if (p.date) {
        const d = parseIsoDate(p.date);
        if (!Number.isNaN(d.getTime())) {
          this.weekStart = getWeekStartMonday(d);
        }
      }
      if (!this.isOpen()) this.open();
      else this.render();
    });
    document.addEventListener("timelineUpdated", () => {
      if (this.isOpen()) this.render();
    });
  }

  ensurePanel() {
    if (this.el) return;
    const panel = document.createElement("section");
    panel.id = "week-view-panel";
    panel.className = "week-view-panel inkling-view-panel hidden";
    panel.setAttribute("aria-label", "Week view");
    panel.innerHTML = `
      <header class="inkling-view-panel__header">
        <button type="button" class="week-view-nav-btn" data-week-delta="-1" aria-label="Previous week">‹</button>
        <h2 class="inkling-view-panel__title">Week</h2>
        <button type="button" class="week-view-nav-btn" data-week-delta="1" aria-label="Next week">›</button>
        <button type="button" class="inkling-view-panel__close" aria-label="Close week view">×</button>
      </header>
      <div class="week-container" id="week-view-scroll"></div>
    `;
    document.getElementById("ui-overlay")?.appendChild(panel);
    this.el = panel;
    this.scrollEl = panel.querySelector("#week-view-scroll");

    panel.querySelector(".inkling-view-panel__close")?.addEventListener("click", () => this.close());
    panel.querySelectorAll("[data-week-delta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = Number(btn.getAttribute("data-week-delta")) * 7;
        const d = parseIsoDate(this.weekStart);
        d.setDate(d.getDate() + delta);
        this.weekStart = isoFromDate(d);
        this.render();
      });
    });
  }

  isOpen() {
    return this.el && !this.el.classList.contains("hidden");
  }

  open() {
    this.ensurePanel();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
    this.el?.classList.remove("hidden");
    this.el.style.display = "flex";
    this.el.style.zIndex = "10340";
    document.body.classList.add("inkling-week-view-open");
    this.render();
  }

  close() {
    this.el?.classList.add("hidden");
    this.el && (this.el.style.display = "none");
    document.body.classList.remove("inkling-week-view-open");
  }

  render() {
    if (!this.scrollEl) return;

    const alertIds = new Set(
      loadAlerts().filter((a) => !a.dismissed).map((a) => a.id)
    );
    const alertByTimeline = new Set(
      loadAlerts()
        .filter((a) => !a.dismissed && a.timelineEntryId)
        .map((a) => a.timelineEntryId)
    );

    const weekEvents = getEventsForWeek(this.weekStart);
    const start = parseIsoDate(this.weekStart);

    this.scrollEl.innerHTML = "";

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = isoFromDate(d);
      const dayEvents = weekEvents.filter((ev) => ev.date === iso);

      const col = document.createElement("div");
      col.className = "day-column";
      col.dataset.date = iso;

      const header = document.createElement("div");
      header.className = "day-header";
      header.textContent = `${DAY_NAMES[i]}, ${d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
      })}`;

      const eventsWrap = document.createElement("div");
      eventsWrap.className = "day-events";

      if (!dayEvents.length) {
        const empty = document.createElement("p");
        empty.className = "day-events-empty";
        empty.textContent = "No events";
        eventsWrap.appendChild(empty);
      }

      for (const ev of dayEvents) {
        const block = document.createElement("div");
        block.className = "event-block";
        const cat = ev.category === "errand" ? "errands" : ev.category;
        block.style.backgroundColor = CategoryColors[cat] ?? CategoryColors.default;

        const hasAlert =
          (ev.alertId && alertIds.has(ev.alertId)) ||
          alertByTimeline.has(ev.id);
        const time = formatTimelineDisplayTime(ev.time);

        block.innerHTML = `
          <span class="event-block__row">
            ${hasAlert ? '<span class="event-alert-icon" title="Alert">⏰</span>' : ""}
            <span class="event-block__time">${time}</span>
          </span>
          <span class="event-block__text"></span>
        `;
        block.querySelector(".event-block__text").textContent = ev.text;
        eventsWrap.appendChild(block);
      }

      col.append(header, eventsWrap);
      this.scrollEl.appendChild(col);
    }
  }
}

/**
 * @returns {WeekView}
 */
export function getWeekView() {
  if (!instance) instance = new WeekView();
  return instance;
}

if (typeof document !== "undefined") {
  getWeekView();
}
