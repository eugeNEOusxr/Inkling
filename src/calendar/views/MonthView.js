import {
  getEventsForMonth,
  CategoryColors,
  getWeekStartMonday,
  parseIsoDate
} from "../../wordweaver/timelineModel.js";
import { loadAlerts } from "../alerts/alertsModel.js";
import { on as onBus } from "../../utils/EventBus.js";
import { getWeekView } from "./WeekView.js";

/** @type {MonthView | null} */
let instance = null;

/**
 * Month grid — tap a day to open Week View for that week.
 */
export class MonthView {
  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;
    this._bindEvents();
  }

  _bindEvents() {
    document.addEventListener("inkling:open-panel", (e) => {
      if (e.detail?.panelId === "monthView") this.open();
    });
    document.addEventListener("inkling:close-all-panels", () => this.close());
    document.addEventListener("timelineUpdated", () => {
      if (this.isOpen()) this.render();
    });
    const refreshAlerts = () => {
      if (this.isOpen()) this.render();
    };
    onBus("eventUpdated", refreshAlerts);
    onBus("eventDeleted", refreshAlerts);
    onBus("alertTriggered", refreshAlerts);
    onBus("navigateTo", (p) => {
      if (p?.level !== "month") return;
      if (p.date) {
        const d = parseIsoDate(p.date);
        if (!Number.isNaN(d.getTime())) {
          this.year = d.getFullYear();
          this.month = d.getMonth() + 1;
        }
      }
      if (!this.isOpen()) this.open();
      else this.render();
    });
  }

  ensurePanel() {
    if (this.el) return;
    const panel = document.createElement("section");
    panel.id = "month-view-panel";
    panel.className = "month-view-panel inkling-view-panel hidden";
    panel.setAttribute("aria-label", "Month view");
    panel.innerHTML = `
      <header class="inkling-view-panel__header">
        <button type="button" class="month-view-nav-btn" data-month-delta="-1" aria-label="Previous month">‹</button>
        <h2 class="inkling-view-panel__title" id="month-view-title">Month</h2>
        <button type="button" class="month-view-nav-btn" data-month-delta="1" aria-label="Next month">›</button>
        <button type="button" class="inkling-view-panel__close" aria-label="Close month view">×</button>
      </header>
      <div class="month-grid-wrap">
        <div class="month-weekday-row" aria-hidden="true">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span>
          <span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="month-grid" id="month-view-grid"></div>
      </div>
    `;
    document.getElementById("ui-overlay")?.appendChild(panel);
    this.el = panel;
    this.gridEl = panel.querySelector("#month-view-grid");
    this.titleEl = panel.querySelector("#month-view-title");

    panel.querySelector(".inkling-view-panel__close")?.addEventListener("click", () => this.close());
    panel.querySelectorAll("[data-month-delta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let m = this.month + Number(btn.getAttribute("data-month-delta"));
        let y = this.year;
        while (m < 1) {
          m += 12;
          y -= 1;
        }
        while (m > 12) {
          m -= 12;
          y += 1;
        }
        this.month = m;
        this.year = y;
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
    document.body.classList.add("inkling-month-view-open");
    this.render();
  }

  close() {
    this.el?.classList.add("hidden");
    this.el && (this.el.style.display = "none");
    document.body.classList.remove("inkling-month-view-open");
  }

  render() {
    if (!this.gridEl || !this.titleEl) return;

    const monthEvents = getEventsForMonth(this.year, this.month);
    this.titleEl.textContent = new Date(this.year, this.month - 1, 1).toLocaleDateString(
      undefined,
      { month: "long", year: "numeric" }
    );

    const alertEntryIds = new Set(
      loadAlerts()
        .filter((a) => !a.dismissed && a.timelineEntryId)
        .map((a) => a.timelineEntryId)
    );

    const first = new Date(this.year, this.month - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

    this.gridEl.innerHTML = "";

    for (let cell = 0; cell < totalCells; cell++) {
      const dayNum = cell - startPad + 1;
      const cellEl = document.createElement("button");
      cellEl.type = "button";
      cellEl.className = "month-cell";

      if (dayNum < 1 || dayNum > daysInMonth) {
        cellEl.classList.add("month-cell--pad");
        cellEl.disabled = true;
        this.gridEl.appendChild(cellEl);
        continue;
      }

      const iso = `${this.year}-${String(this.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      cellEl.dataset.date = iso;
      const dayEvents = monthEvents.filter((e) => e.date === iso);

      const cats = [...new Set(dayEvents.map((e) => (e.category === "errand" ? "errands" : e.category)))];
      const hasAlert = dayEvents.some((e) => e.alertId || alertEntryIds.has(e.id));

      cellEl.innerHTML = `
        <span class="month-cell__num">${dayNum}</span>
        <span class="month-cell__dots"></span>
        ${hasAlert ? '<span class="month-cell__alert" title="Alert">⏰</span>' : ""}
      `;
      const dots = cellEl.querySelector(".month-cell__dots");
      for (const cat of cats.slice(0, 5)) {
        const dot = document.createElement("span");
        dot.className = "category-dot";
        dot.style.backgroundColor = CategoryColors[cat] ?? CategoryColors.default;
        dots?.appendChild(dot);
      }

      cellEl.addEventListener("click", () => {
        const wv = getWeekView();
        wv.weekStart = getWeekStartMonday(parseIsoDate(iso));
        document.dispatchEvent(
          new CustomEvent("inkling:open-panel", { detail: { panelId: "weekView", date: iso } })
        );
        wv.open();
        this.close();
      });

      this.gridEl.appendChild(cellEl);
    }
  }
}

/**
 * @returns {MonthView}
 */
export function getMonthView() {
  if (!instance) instance = new MonthView();
  return instance;
}

if (typeof document !== "undefined") {
  getMonthView();
}
