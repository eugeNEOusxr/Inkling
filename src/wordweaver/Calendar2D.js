import { getEventsForMonth, getEventsForDate, CategoryColors } from "./timelineModel.js";
import { MonthGrid2D } from "./MonthGrid2D.js";
import { WeekGrid2D, weekStartForDate } from "./WeekGrid2D.js";
import { getCalendarMode, setCalendarMode } from "./calendarMode.js";
import { onTimelineDataChange, on as onBus } from "../utils/EventBus.js";
import { parseIsoDate } from "./timelineModel.js";

const STYLE_ID = "ww-calendar-2d-styles";

const pad2 = (n) => String(n).padStart(2, "0");

function injectCalendar2DStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = `
.ww-calendar-2d {
  position: absolute;
  inset: 0;
  /* Above the floating paint/3D-mode chrome (~10250) so the back/nav header is
     clickable — it used to sit buried at z:5. Below the bottom nav (10300). */
  z-index: 10260;
  display: flex;
  flex-direction: column;
  background: rgba(6, 10, 20, 0.97);
  overflow: hidden;
  pointer-events: auto;
}
.ww-calendar-2d.is-hidden { display: none !important; }
.ww-calendar-2d__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(78, 230, 230, 0.25);
}
.ww-calendar-2d__back {
  border: 1px solid rgba(78, 230, 230, 0.35);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.ww-calendar-2d__title {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
  color: #f0fdff;
  text-align: center;
}
.ww-calendar-2d__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px;
}
.ww-year-view-2d {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  max-width: 960px;
  margin: 0 auto;
}
@media (max-width: 720px) {
  .ww-year-view-2d { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px) {
  .ww-year-view-2d { grid-template-columns: 1fr; }
}
.ww-year-month-block {
  border-radius: 12px;
  border: 1px solid rgba(78, 230, 230, 0.28);
  background: rgba(0, 0, 0, 0.35);
  padding: 8px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
}
.ww-year-month-block:hover {
  border-color: rgba(212, 175, 55, 0.55);
  background: rgba(20, 40, 60, 0.5);
}
.ww-year-month-block__name {
  font-weight: 700;
  font-size: 13px;
  color: #a8f6ff;
  margin-bottom: 6px;
}
.ww-month-grid-2d--compact .ww-month-grid-2d__cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.ww-month-grid-2d__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  font-size: 8px;
  color: #64748b;
  text-align: center;
  margin-bottom: 2px;
}
.ww-month-grid-2d__cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.ww-day-cell-2d {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 4px 2px;
  border-radius: 6px;
  border: 1px solid rgba(51, 65, 85, 0.6);
  background: rgba(8, 14, 28, 0.75);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 11px;
}
.ww-day-cell-2d--compact { min-height: 22px; padding: 2px 1px; font-size: 9px; }
.ww-day-cell-2d--pad { visibility: hidden; pointer-events: none; border: none; }
.ww-day-cell-2d.is-today { box-shadow: 0 0 0 1px rgba(78, 230, 230, 0.7); }
.ww-day-cell-2d__dots { display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; }
.ww-day-cell-2d .category-dot { width: 6px; height: 6px; border-radius: 50%; }
.ww-day-cell-2d--compact .category-dot { width: 4px; height: 4px; }
.ww-week-grid-2d {
  display: flex;
  flex-direction: row;
  gap: 10px;
  overflow-x: auto;
  min-height: 200px;
}
.ww-week-grid-2d__col {
  min-width: 200px;
  flex-shrink: 0;
  background: rgba(0,0,0,0.4);
  border-radius: 10px;
  padding: 8px;
}
.ww-week-grid-2d__col-header {
  width: 100%;
  border: none;
  background: transparent;
  color: #f0fdff;
  font-weight: 700;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  margin-bottom: 8px;
}
.ww-week-grid-2d__event {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 6px;
  color: #fff;
  cursor: pointer;
  font: inherit;
}
.ww-day-view-2d__list { display: flex; flex-direction: column; gap: 8px; max-width: 520px; margin: 0 auto; }
.ww-day-view-2d__item {
  border-radius: 10px;
  padding: 10px 12px;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.15);
}
`;
  document.head.appendChild(tag);
}

/**
 * Year grid — 12 month mini-blocks (3×4).
 */
export class YearView {
  /**
   * @param {number} year
   * @param {{
   *   onMonthSelect: (year: number, month: number) => void,
   *   onDaySelect: (dateIso: string) => void
   * }} callbacks
   */
  constructor(year, callbacks) {
    this.year = year;
    this.onMonthSelect = callbacks.onMonthSelect;
    this.onDaySelect = callbacks.onDaySelect;
    this.root = document.createElement("div");
    this.root.className = "ww-year-view-2d";
  }

  render() {
    this.root.replaceChildren();
    for (let month = 1; month <= 12; month++) {
      const block = document.createElement("button");
      block.type = "button";
      block.className = "ww-year-month-block";

      const name = document.createElement("div");
      name.className = "ww-year-month-block__name";
      name.textContent = new Date(this.year, month - 1, 1).toLocaleDateString(undefined, {
        month: "long"
      });

      const grid = new MonthGrid2D({
        year: this.year,
        month,
        compact: true,
        showWeekdayRow: false,
        onDaySelect: (iso) => this.onDaySelect(iso)
      });

      const monthEvents = getEventsForMonth(this.year, month);
      const cats = [
        ...new Set(monthEvents.map((e) => (e.category === "errand" ? "errands" : e.category)))
      ];
      if (cats[0]) {
        const c = CategoryColors[cats[0]] ?? CategoryColors.default;
        block.style.borderColor = `${c}55`;
      }

      block.append(name, grid.render());
      block.addEventListener("click", (e) => {
        if (e.target.closest(".ww-day-cell-2d:not(.ww-day-cell-2d--pad)")) return;
        this.onMonthSelect(this.year, month);
      });
      this.root.appendChild(block);
    }
    return this.root;
  }
}

/**
 * Full month view inside WordWeaver 2D.
 */
export class MonthView2D {
  /**
   * @param {number} year
   * @param {number} month
   * @param {{ onDaySelect: (dateIso: string) => void }} callbacks
   */
  constructor(year, month, callbacks) {
    this.year = year;
    this.month = month;
    this.onDaySelect = callbacks.onDaySelect;
    this.root = document.createElement("div");
    this.root.className = "ww-month-view-2d";
  }

  render() {
    this.root.replaceChildren();
    const grid = new MonthGrid2D({
      year: this.year,
      month: this.month,
      compact: false,
      showWeekdayRow: true,
      onDaySelect: (iso) => this.onDaySelect(iso)
    });
    this.root.appendChild(grid.render());
    return this.root;
  }
}

/**
 * Single-day event list.
 */
export class DayView2D {
  /**
   * @param {string} dateIso
   * @param {import("./timelineModel.js").CalendarEventRecord[]} events
   */
  constructor(dateIso, events) {
    this.dateIso = dateIso;
    this.events = events;
    this.root = document.createElement("div");
    this.root.className = "ww-day-view-2d";
  }

  render() {
    const list = document.createElement("div");
    list.className = "ww-day-view-2d__list";

    const d = new Date(this.dateIso + "T12:00:00");
    const title = document.createElement("p");
    title.style.cssText = "color:#94a3b8;font-size:12px;margin:0 0 10px;text-align:center;";
    title.textContent = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    this.root.replaceChildren(title, list);

    if (!this.events.length) {
      const empty = document.createElement("p");
      empty.style.color = "#64748b";
      empty.textContent = "No events this day.";
      list.appendChild(empty);
      return this.root;
    }

    for (const ev of this.events) {
      const item = document.createElement("div");
      item.className = "ww-day-view-2d__item";
      const cat = ev.category === "errand" ? "errands" : ev.category;
      item.style.backgroundColor = CategoryColors[cat] ?? CategoryColors.default;
      item.textContent = `${ev.time ? ev.time + " — " : ""}${ev.text}`;
      list.appendChild(item);
    }

    const weekWrap = document.createElement("div");
    weekWrap.style.marginTop = "16px";
    const week = new WeekGrid2D({
      weekStartIso: weekStartForDate(this.dateIso),
      onDaySelect: () => {}
    });
    weekWrap.appendChild(week.render());
    this.root.appendChild(weekWrap);

    return this.root;
  }
}

/**
 * WordWeaver 2D calendar shell (year → month → day).
 */
export class Calendar2D {
  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;
    /** @type {"year" | "month" | "week" | "day"} */
    this.view = "month";
    const iso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    this.anchorIso = iso; // source of truth the arrows step through
    this.selectedDate = iso;
    this.el = null;
    this.bodyEl = null;
    this.titleEl = null;
    this.backBtn = null;
    this._navToggleBtns = [];
  }

  _todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /** Keep year/month/selectedDate consistent with the anchor date. */
  _syncFromAnchor() {
    const [y, m] = this.anchorIso.split("-").map(Number);
    this.year = y;
    this.month = m;
    this.selectedDate = this.anchorIso;
  }

  /** Step the anchor by one unit of the active view (day/week/month/year). */
  _shift(delta) {
    const [y, m, d] = this.anchorIso.split("-").map(Number);
    let dt;
    if (this.view === "day") dt = new Date(y, m - 1, d + delta);
    else if (this.view === "week") dt = new Date(y, m - 1, d + 7 * delta);
    else if (this.view === "month") dt = new Date(y, m - 1 + delta, Math.min(d, 28));
    else dt = new Date(y + delta, m - 1, Math.min(d, 28));
    this.anchorIso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    this._syncFromAnchor();
    this._render();
  }

  /** Jump the anchor to today, keeping the active view. */
  _goToday() {
    this.anchorIso = this._todayIso();
    this._syncFromAnchor();
    this._render();
  }

  /** Switch view level (day/week/month/year) keeping the anchor date. */
  _setLevel(view) {
    this.view = view;
    this._syncFromAnchor();
    this._render();
  }

  /**
   * @param {HTMLElement} container
   */
  mount(container) {
    if (!container || container.querySelector(".ww-calendar-2d")) return;

    injectCalendar2DStyles();

    const root = document.createElement("div");
    root.className = "ww-calendar-2d";
    root.classList.toggle("is-hidden", getCalendarMode() !== "2d");
    root.setAttribute("aria-label", "2D calendar");

    const header = document.createElement("header");
    header.className = "ww-calendar-2d__header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "ww-calendar-2d__back";
    backBtn.textContent = "← Back";
    backBtn.hidden = true;

    const title = document.createElement("h2");
    title.className = "ww-calendar-2d__title";

    // Always-available escape to the 3D map (the external 3D toggle can be
    // covered by this overlay, so the 2D header carries its own).
    const to3dBtn = document.createElement("button");
    to3dBtn.type = "button";
    to3dBtn.className = "ww-calendar-2d__back";
    to3dBtn.textContent = "🧊 3D";
    to3dBtn.title = "Back to the 3D map";
    // Bigger + top-LEFT so it's obvious how to get back to the 3D world.
    to3dBtn.style.fontSize = "14px";
    to3dBtn.style.padding = "7px 14px";
    to3dBtn.style.fontWeight = "700";
    to3dBtn.style.color = "#7df3ff";
    to3dBtn.style.borderColor = "rgba(78,230,230,0.6)";
    to3dBtn.addEventListener("click", () => setCalendarMode("3d"));

    header.append(to3dBtn, backBtn, title);

    // Date nav: ‹ Today › + Day/Week/Month/Year toggle. The arrows step by the
    // ACTIVE view (day→day, week→week, month→month, year→year).
    const nav = document.createElement("div");
    nav.className = "ww-calendar-2d__nav";
    nav.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:7px 12px;flex-shrink:0;flex-wrap:wrap;" +
      "border-bottom:1px solid rgba(78,230,230,0.15)";
    const mkNavBtn = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "border:1px solid rgba(78,230,230,0.35);background:rgba(15,23,42,0.9);color:#e2e8f0;" +
        "border-radius:8px;padding:6px 11px;font:700 12px system-ui;cursor:pointer";
      b.addEventListener("click", fn);
      return b;
    };
    const cluster = document.createElement("div");
    cluster.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto";
    cluster.append(
      mkNavBtn("‹", () => this._shift(-1)),
      mkNavBtn("Today", () => this._goToday()),
      mkNavBtn("›", () => this._shift(1))
    );
    const spacer = document.createElement("div");
    spacer.style.cssText = "flex:1 1 auto";
    const toggle = document.createElement("div");
    toggle.style.cssText = "display:flex;gap:4px;flex:0 0 auto";
    this._navToggleBtns = [];
    for (const [lvl, lbl] of [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]]) {
      const b = mkNavBtn(lbl, () => this._setLevel(lvl));
      b.dataset.level = lvl;
      this._navToggleBtns.push(b);
      toggle.appendChild(b);
    }
    nav.append(cluster, spacer, toggle);

    const body = document.createElement("div");
    body.className = "ww-calendar-2d__body";

    root.append(header, nav, body);
    container.appendChild(root);

    this.el = root;
    this.bodyEl = body;
    this.titleEl = title;
    this.backBtn = backBtn;

    backBtn.addEventListener("click", () => this._goBack());

    onTimelineDataChange(() => {
      if (getCalendarMode() === "2d") this._render();
    });
    const refreshAlerts = () => {
      if (getCalendarMode() === "2d") this._render();
    };
    onBus("eventUpdated", refreshAlerts);
    onBus("eventDeleted", refreshAlerts);
    onBus("alertTriggered", refreshAlerts);

    onBus("modeChanged", (p) => {
      const mode = p?.mode;
      if (mode === "2d") this.show();
      else if (mode === "3d") this.hide();
    });

    onBus("navigateTo", (payload) => this._onNavigateTo(payload));

    this._render();
  }

  /**
   * @param {{ date?: string, level?: string }} payload
   */
  _onNavigateTo(payload) {
    const date = payload?.date;
    const level = payload?.level;
    if (!date || !level) return;
    const parsed = parseIsoDate(date);
    if (!parsed || Number.isNaN(parsed.getTime())) return;
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    if (level === "year") {
      this.year = year;
      this.view = "year";
      this.show();
      this._render();
      return;
    }
    if (level === "month") {
      this.openMonth(year, month);
      this.show();
      return;
    }
    if (level === "day") {
      this.openDay(date);
      this.show();
      return;
    }
    if (level === "week") {
      this.openMonth(year, month);
      this.show();
    }
  }

  show() {
    this.el?.classList.remove("is-hidden");
  }

  hide() {
    this.el?.classList.add("is-hidden");
  }

  _goBack() {
    if (this.view === "day" || this.view === "week") this.view = "month";
    else if (this.view === "month") this.view = "year";
    this._render();
  }

  _updateNavToggle() {
    for (const b of this._navToggleBtns || []) {
      const active = b.dataset.level === this.view;
      b.style.background = active ? "rgba(78,230,230,0.25)" : "rgba(15,23,42,0.9)";
      b.style.color = active ? "#7df3ff" : "#e2e8f0";
      b.style.borderColor = active ? "rgba(78,230,230,0.7)" : "rgba(78,230,230,0.35)";
    }
  }

  /**
   * @param {number} year
   * @param {number} month
   */
  openMonth(year, month) {
    this.year = year;
    this.month = month;
    this.anchorIso = `${year}-${pad2(month)}-01`;
    this.view = "month";
    this._render();
  }

  /**
   * @param {string} dateIso
   */
  openDay(dateIso) {
    this.selectedDate = dateIso;
    this.anchorIso = dateIso;
    this.view = "day";
    this._dayEvents = getEventsForDate(dateIso);
    this._render();
  }

  _render() {
    if (!this.bodyEl || !this.titleEl || !this.backBtn) return;

    this.backBtn.hidden = this.view === "year";
    // Label the back button with where it goes (Year ← Month ← Week/Day).
    this.backBtn.textContent = this.view === "month" ? "← Year" : "← Month";
    this._updateNavToggle();

    if (this.view === "week") {
      const ws = weekStartForDate(this.anchorIso);
      const wsD = new Date(ws + "T12:00:00");
      this.titleEl.textContent = "Week of " + wsD.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const wk = new WeekGrid2D({ weekStartIso: ws, onDaySelect: (iso) => this.openDay(iso) });
      this.bodyEl.replaceChildren(wk.render());
      return;
    }

    if (this.view === "year") {
      this.titleEl.textContent = String(this.year);
      const yv = new YearView(this.year, {
        onMonthSelect: (y, m) => this.openMonth(y, m),
        onDaySelect: (iso) => this.openDay(iso)
      });
      this.bodyEl.replaceChildren(yv.render());
      return;
    }

    if (this.view === "month") {
      this.titleEl.textContent = new Date(this.year, this.month - 1, 1).toLocaleDateString(
        undefined,
        { month: "long", year: "numeric" }
      );
      const mv = new MonthView2D(this.year, this.month, {
        onDaySelect: (iso) => void this.openDay(iso)
      });
      this.bodyEl.replaceChildren(mv.render());
      return;
    }

    if (this.view === "day" && this.selectedDate) {
      const d = new Date(this.selectedDate + "T12:00:00");
      this.titleEl.textContent = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
      const dv = new DayView2D(this.selectedDate, this._dayEvents ?? []);
      this.bodyEl.replaceChildren(dv.render());
    }
  }
}

/** @type {Calendar2D | null} */
let instance = null;

/**
 * @returns {Calendar2D}
 */
export function getCalendar2D() {
  if (!instance) instance = new Calendar2D();
  return instance;
}
