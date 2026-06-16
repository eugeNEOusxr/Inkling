/**
 * Calendar2DDay — a Google-Calendar-style 2D day view + editor.
 *
 * White base, color-coded by category, vertical time-of-day grid (00:00→24:00).
 * Default 30-min blocks; a zoom control switches 15 / 30 / 60. Events are read
 * from and written through the timeline model (startTime/endTime/title/body/
 * category) — so this is a real editing surface, not a mock.
 *
 * Slice 1+2: render the day's events as blocks, tap an empty slot to create,
 * tap a block to edit/delete, zoom granularity, now-line. (Location/conference
 * fields, week/month views, and drag-resize come next.)
 */
import {
  getEventsForDate,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  buildStartTimeIso,
  getCategoryColor,
  classifyText,
  getEventsForYear,
  getEventsForMonth,
  todayIsoDate
} from "../../wordweaver/timelineModel.js";
import { NoteAddBar } from "../../wordweaver/NoteAddBar.js";
import { openTextStylePicker, textStyleCss, getTextStyleRaw, getTextAnim, textAnimCss } from "./TextStylePicker.js";
import { createAlert, addAlert, removeAlertsForEntry, AlertPriority } from "../alerts/alertsModel.js";
import { recomputeSchedule } from "../alerts/alertsScheduler.js";

const SLOT_PX = { 15: 30, 30: 42, 60: 66 }; // row height per slot size (taller so 15-min rows don't cram)
const DAY_MIN = 24 * 60;
const GUTTER = 64; // left time-label column width (px)

/** Friendly category set for the editor (value → label). */
const CATEGORIES = [
  ["work", "Work"], ["personal", "Personal"], ["health", "Health"],
  ["study", "Study"], ["creative", "Creative"], ["errands", "Errands"],
  ["appointment", "Appointment"], ["reminder", "Reminder"]
];

/** Quick title prompts + autocomplete seeds (merged with the user's own past events). */
const COMMON_TITLES = [
  "Team meeting", "Lunch with ", "Workout", "Gym session", "Doctor appointment",
  "Dentist", "Call with ", "Coffee with ", "Project deadline", "Grocery run",
  "Pick up ", "Birthday", "Dinner with ", "Study session", "Standup",
  "1:1 with ", "Pay rent", "Flight to ", "Date night", "Reminder to "
];
/** Title chips always offered as quick prompts. */
const TITLE_PROMPTS = ["Meeting", "Lunch", "Workout", "Call", "Errand", "Reminder"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n) {
  return String(n).padStart(2, "0");
}

/** ISO datetime → minutes since local midnight. */
function minutesOf(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

/** minutes → "H:MM AM/PM". */
function clockLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/** minutes → "HH:MM" (24h, for the model). */
function hhmm(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// --- color helpers (vivid, high-contrast blocks on a white base) ---
function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
/** Darken a hex by fraction f (0..1). */
function darken(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - f), g * (1 - f), b * (1 - f));
}
/** A saturated diagonal gradient for an event block; light hues are deepened so
 *  white text always reads. */
function blockFill(hex) {
  const base = luminance(hex) > 0.6 ? darken(hex, 0.42) : hex;
  return `linear-gradient(135deg, ${base}, ${darken(base, 0.28)})`;
}

// Layered text-shadow "extrusions" → clean CSS 2.5D text inside the 2D grid.
const HEADER_3D =
  "0 1px 0 #cbd5e1,0 2px 0 #bcc6d6,0 3px 0 #aab6c8,0 4px 8px rgba(15,23,42,0.28)";
const BLOCK_TITLE_3D = "0 1px 0 rgba(0,0,0,0.45),0 2px 4px rgba(0,0,0,0.35)";
// Crisp dark outline (a 1px "stroke" around white text) — sharp/high-contrast,
// reads cleanly even when blocks sit close at 15-min granularity.
const BLOCK_TITLE_OUTLINE =
  "-1px -1px 0 rgba(0,0,0,0.92),1px -1px 0 rgba(0,0,0,0.92),-1px 1px 0 rgba(0,0,0,0.92),1px 1px 0 rgba(0,0,0,0.92)";
// Lighter 2.5D for the time-of-day labels (same family as the header, toned down).
const TIME_LABEL_3D = "0 1px 0 #e6eaf1,0 2px 2px rgba(15,23,42,0.14)";

export class Calendar2DDay {
  constructor() {
    this.iso = todayIsoDate();
    this.slot = 30;
    this.view = "day"; // "day" | "week" | "month"
    this.theme = (() => { try { return localStorage.getItem("cal2d-theme") || "dark"; } catch { return "dark"; } })();
    this.root = null;
    this._grid = null;
    this._editing = null; // event id being edited, or null for new
    this._nowTimer = null;
    this._addBar = null;  // shared quick-add note bar (day view only)
  }

  /** Show the shared add-note bar in day + week + month views. */
  _syncAddBar() {
    const open = this.root && this.root.style.display !== "none";
    if (open && (this.view === "day" || this.view === "week" || this.view === "month")) {
      if (!this._addBar) {
        // After adding, jump to that day's view so you land where the note went.
        this._addBar = new NoteAddBar({
          bottomPx: 78,
          onAdded: (date) => {
            if (date) this.iso = date;
            this.setView("day");
          }
        });
      }
      // Day view targets the open day; month view defaults to today. Either way
      // the bar's ‹ › day stepper lets you retarget any day before adding.
      this._addBar.show(this.view === "day" ? this.iso : todayIsoDate());
    } else {
      this._addBar?.hide();
    }
  }

  // --- lifecycle ---

  open(iso) {
    if (iso) this.iso = iso;
    this._build();
    this.root.style.display = "flex";
    this.setView(this.view);
    this._startNowTimer();
  }

  setView(view) {
    this.view = view;
    this._scrolled = false;
    if (this._viewToggle) {
      this._viewToggle.textContent = ({ day: "Day", week: "Week", month: "Month" }[view] || "View") + " ▾";
    }
    for (const el of this._zoomEls ?? []) el.style.display = view === "day" ? "" : "none";
    this.render();
  }

  close() {
    if (this.root) this.root.style.display = "none";
    if (this._nowTimer) { clearInterval(this._nowTimer); this._nowTimer = null; }
    this._addBar?.hide();
  }

  setDate(iso) { this.iso = iso; this.render(); }

  shiftDay(delta) {
    const [y, m, d] = this.iso.split("-").map(Number);
    // In month view the arrows page by month; in day view, by day.
    const dt = this.view === "month"
      ? new Date(y, m - 1 + delta, Math.min(d, 28))
      : new Date(y, m - 1, d + delta);
    this.iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    this.render();
  }

  setSlot(slot) {
    this.slot = slot;
    if (this._slotSel) this._slotSel.value = String(slot);
    this.render();
  }

  // --- build shell ---

  /** Theme palette (light = white "other apps" look, dark = cosmic). */
  _pal() {
    if (this.theme === "light") {
      return {
        bg: "#ffffff", text: "#1e293b",
        headBg: "#f8fafc", headBorder: "#e2e8f0",
        title: "#0f172a", titleShadow: HEADER_3D,
        btnBg: "#fff", btnBorder: "#cbd5e1", btnText: "#0f172a",
        gridHour: "#e2e8f0", gridMinor: "#eef2f7", hourLabel: "#334155", minorLabel: "#aab4c4",
        hourShadow: "0 1px 0 rgba(255,255,255,0.7)",
        cellIn: "#fff", cellOut: "#f8fafc", num: "#0f172a", numDim: "#94a3b8",
        legendBg: "#f8fafc", legendBorder: "#e2e8f0", legendText: "#475569", weekday: "#475569"
      };
    }
    return {
      bg: "radial-gradient(ellipse at 50% -10%, #1c2550 0%, #0c1226 52%, #05070f 100%)", text: "#e6ebff",
      headBg: "rgba(10,15,32,0.65)", headBorder: "rgba(255,255,255,0.1)",
      title: "#f1f5ff", titleShadow: "0 1px 2px rgba(0,0,0,0.6),0 0 16px rgba(129,140,248,0.45)",
      btnBg: "rgba(255,255,255,0.07)", btnBorder: "rgba(255,255,255,0.18)", btnText: "#e6ebff",
      gridHour: "rgba(255,255,255,0.16)", gridMinor: "rgba(255,255,255,0.05)", hourLabel: "#f4f7ff", minorLabel: "rgba(226,232,255,0.5)",
      hourShadow: "1px 1px 0 rgba(0,0,0,0.75),0 0 9px rgba(150,170,255,0.5)",
      cellIn: "rgba(255,255,255,0.05)", cellOut: "rgba(255,255,255,0.015)", num: "#e6ebff", numDim: "#6b7494",
      legendBg: "rgba(255,255,255,0.05)", legendBorder: "rgba(255,255,255,0.1)", legendText: "#c3cae6", weekday: "#a5b4fc"
    };
  }

  _toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("cal2d-theme", this.theme); } catch { /* ignore */ }
    // Rebuild the shell with the new palette, preserving open state + view.
    const wasOpen = this.root && this.root.style.display !== "none";
    this.root?.remove();
    this.root = null;
    this._scrolled = false;
    this._build();
    if (wasOpen) this.root.style.display = "flex";
    this.setView(this.view);
  }

  _build() {
    if (this.root) return;
    const P = this._pal();
    if (!document.getElementById("cal2d-style")) {
      const st = document.createElement("style");
      st.id = "cal2d-style";
      st.textContent =
        "@keyframes cal2d-shake{" +
        "0%{transform:translateX(0)}" +
        "12%{transform:translateX(-6px) rotate(-1.2deg)}" +
        "26%{transform:translateX(6px) rotate(1.2deg)}" +
        "40%{transform:translateX(-5px) rotate(-0.8deg)}" +
        "54%{transform:translateX(5px) rotate(0.8deg)}" +
        "68%{transform:translateX(-3px)}" +
        "82%{transform:translateX(3px)}" +
        "100%{transform:translateX(0)}}";
      document.head.appendChild(st);
    }
    const root = document.createElement("div");
    root.id = "cal2d-day";
    root.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:calc(62px + env(safe-area-inset-bottom,0px));" +
      "z-index:11000;display:none;flex-direction:column;" +
      `background:${P.bg};color:${P.text};font:500 14px system-ui,-apple-system,sans-serif`;

    // Header bar
    const head = document.createElement("div");
    head.style.cssText =
      "flex:0 0 auto;display:flex;flex-direction:column;gap:8px;padding:10px 12px;" +
      `border-bottom:1px solid ${P.headBorder};background:${P.headBg}`;
    const prev = this._navBtn("‹", () => this.shiftDay(-1));
    const next = this._navBtn("›", () => this.shiftDay(1));
    // Theme toggle — short label to save header space.
    const themeBtn = this._navBtn(this.theme === "dark" ? "🌙 Dark" : "☀️ Light", () => this._toggleTheme());
    themeBtn.style.width = "auto";
    themeBtn.style.padding = "0 12px";
    themeBtn.style.fontSize = "13px";
    // The current date — sits BETWEEN the ‹ › arrows so the user always knows
    // which day/month they're on (was off to the side / blank).
    const title = document.createElement("div");
    title.style.cssText =
      `flex:0 1 auto;min-width:120px;text-align:center;font-weight:800;font-size:17px;color:${P.title};` +
      `letter-spacing:0.2px;text-shadow:${P.titleShadow};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    this._title = title;

    const slotSel = document.createElement("select");
    slotSel.style.cssText =
      `border:1px solid ${P.btnBorder};border-radius:8px;padding:6px 8px;background:${P.btnBg};color:${P.btnText};font:600 13px system-ui`;
    for (const s of [15, 30, 60]) {
      const o = document.createElement("option");
      o.value = String(s); o.textContent = `${s} min`;
      if (s === this.slot) o.selected = true;
      slotSel.appendChild(o);
    }
    slotSel.addEventListener("change", () => this.setSlot(Number(slotSel.value)));
    this._slotSel = slotSel;
    const zoomLabel = document.createElement("span");
    zoomLabel.textContent = "Zoom";
    zoomLabel.style.cssText = `font-size:12px;color:${P.weekday}`;
    this._zoomEls = [zoomLabel, slotSel];

    // View dropdown: Today · Day · Week · Month (frees header room).
    const viewDd = document.createElement("div");
    viewDd.style.cssText = "position:relative;display:inline-block";
    const viewToggle = this._navBtn("Day ▾", () => {});
    viewToggle.style.width = "auto"; viewToggle.style.padding = "0 12px"; viewToggle.style.fontSize = "13px";
    const viewMenu = document.createElement("div");
    viewMenu.style.cssText =
      `position:absolute;left:0;top:calc(100% + 4px);min-width:128px;display:none;flex-direction:column;` +
      `z-index:20;border-radius:10px;overflow:hidden;border:1px solid ${P.legendBorder};background:${P.cellIn};` +
      `box-shadow:0 10px 26px rgba(0,0,0,0.45)`;
    const ddItems = [
      ["Today", () => { this.iso = todayIsoDate(); this.setView("day"); }],
      ["Day", () => this.setView("day")],
      ["Week", () => this.setView("week")],
      ["Month", () => this.setView("month")]
    ];
    for (const [label, fn] of ddItems) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText =
        `padding:11px 13px;border:0;border-bottom:1px solid ${P.legendBorder};background:transparent;` +
        `color:${P.num};text-align:left;cursor:pointer;font:600 13px system-ui`;
      b.addEventListener("click", (e) => { e.stopPropagation(); viewMenu.style.display = "none"; fn(); });
      viewMenu.appendChild(b);
    }
    viewToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMenu.style.display = viewMenu.style.display === "flex" ? "none" : "flex";
    });
    document.addEventListener("pointerdown", (e) => { if (!viewDd.contains(e.target)) viewMenu.style.display = "none"; });
    viewDd.append(viewToggle, viewMenu);
    this._viewToggle = viewToggle;

    // Jot-a-note button (the "paint/✎" affordance) — opens the editor for a new
    // entry, defaulting to now (today) or 9:00.
    const noteBtn = this._navBtn("✎", () => {
      const now = new Date();
      const startMin = this.iso === todayIsoDate()
        ? Math.floor((now.getHours() * 60 + now.getMinutes()) / this.slot) * this.slot
        : 9 * 60;
      this._openEditor(null, startMin);
    });
    noteBtn.title = "Jot a note";
    noteBtn.style.fontSize = "17px";
    // Paint-canvas button — pick the text style yourself.
    const paintBtn = this._navBtn("🎨", () => openTextStylePicker());
    paintBtn.title = "Text style";
    paintBtn.style.fontSize = "16px";
    const close = this._navBtn("✕", () => this.close());
    // Row 1: the date between the ‹ › arrows on its OWN line so it has room and
    // doesn't squeeze the buttons off-screen.
    title.style.flex = "1 1 auto";
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;align-items:center;justify-content:center;gap:10px;width:100%";
    row1.append(prev, title, next);
    // Row 2: action buttons — WRAP so every button (incl. theme) stays visible on
    // narrow screens instead of being cut off.
    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%";
    row2.append(viewDd, themeBtn, zoomLabel, slotSel, noteBtn, paintBtn, close);
    head.append(row1, row2);

    // Scrollable grid
    const scroll = document.createElement("div");
    scroll.style.cssText = "flex:1;overflow:auto;position:relative;background:transparent";
    const grid = document.createElement("div");
    grid.style.cssText = "position:relative;width:100%";
    scroll.appendChild(grid);
    this._scroll = scroll;
    this._grid = grid;

    root.append(head, scroll);
    document.body.appendChild(root);
    this.root = root;

    // Re-render when the user picks a new text style or animation (live update).
    // Bind once — _build can re-run on theme toggle.
    if (!this._evtBound) {
      const reRender = () => { if (this.root && this.root.style.display !== "none") this.render(); };
      window.addEventListener("inkling:text-style", reRender);
      window.addEventListener("inkling:text-anim", reRender);
      this._evtBound = true;
    }
  }

  /** Prompt for browser notification permission so timed alerts can fire. */
  _maybeAskNotify() {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const r = Notification.requestPermission();
        if (r && typeof r.catch === "function") r.catch(() => {});
      }
    } catch { /* ignore */ }
  }

  /** Palette-aware active/inactive styling for the Today / Month toggle. */
  _setViewBtnActive(btn, active) {
    const P = this._pal();
    btn.style.background = active ? "#6366f1" : P.btnBg;
    btn.style.color = active ? "#ffffff" : P.btnText;
    btn.style.borderColor = active ? "#6366f1" : P.btnBorder;
  }

  _navBtn(label, onClick) {
    const P = this._pal();
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      `height:34px;min-width:34px;border:1px solid ${P.btnBorder};border-radius:8px;background:${P.btnBg};` +
      `color:${P.btnText};font:700 15px system-ui;cursor:pointer;flex:0 0 auto`;
    b.addEventListener("click", onClick);
    return b;
  }

  // --- Month grid (2D), wired to the Day view ---

  _renderMonth() {
    if (this._scroll) this._scroll.style.overflow = "auto";
    const P = this._pal();
    const [y, m] = this.iso.split("-").map(Number);
    this._title.textContent = `${MONTHS[m - 1]} ${y}`;
    this._grid.style.height = "auto";
    this._grid.textContent = "";

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:12px 14px 28px";

    // Color legend up top.
    const legend = document.createElement("div");
    legend.style.cssText =
      "display:flex;flex-wrap:wrap;gap:9px 16px;margin-bottom:14px;padding:10px 12px;" +
      `background:${P.legendBg};border:1px solid ${P.legendBorder};border-radius:10px`;
    for (const [val, label] of CATEGORIES) {
      const item = document.createElement("span");
      item.style.cssText = `display:inline-flex;align-items:center;gap:6px;font:600 12px system-ui;color:${P.legendText}`;
      item.innerHTML =
        `<span style="width:12px;height:12px;border-radius:50%;background:${getCategoryColor(val)};box-shadow:0 1px 3px rgba(0,0,0,0.3)"></span>${label}`;
      legend.appendChild(item);
    }
    wrap.appendChild(legend);

    // Weekday header.
    const dow = document.createElement("div");
    dow.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px";
    for (const w of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      const c = document.createElement("div");
      c.textContent = w;
      c.style.cssText = `text-align:center;font:700 12px system-ui;color:${P.weekday}`;
      dow.appendChild(c);
    }
    wrap.appendChild(dow);

    // Day cells (6 weeks, with leading/trailing days from adjacent months).
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:6px";
    const first = new Date(y, m - 1, 1).getDay();
    const dim = new Date(y, m, 0).getDate();
    const prevDim = new Date(y, m - 1, 0).getDate();
    const todayIso = todayIsoDate();

    const byDate = {};
    try {
      for (const r of getEventsForMonth(y, m)) {
        (byDate[r.date] ||= []).push(getCategoryColor(r.category));
      }
    } catch { /* ignore */ }

    for (let i = 0; i < 42; i++) {
      let dayNum, monthDelta, inMonth;
      if (i < first) { dayNum = prevDim - first + 1 + i; monthDelta = -1; inMonth = false; }
      else if (i < first + dim) { dayNum = i - first + 1; monthDelta = 0; inMonth = true; }
      else { dayNum = i - first - dim + 1; monthDelta = 1; inMonth = false; }
      const dObj = new Date(y, m - 1 + monthDelta, dayNum);
      const iso = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
      const isToday = iso === todayIso;

      const cell = document.createElement("div");
      cell.style.cssText =
        `min-height:74px;border:1px solid ${P.legendBorder};border-radius:10px;padding:6px;cursor:pointer;` +
        `background:${inMonth ? P.cellIn : P.cellOut};` +
        (isToday ? "outline:2px solid #818cf8;outline-offset:-2px;" : "");
      const num = document.createElement("div");
      num.textContent = String(dayNum);
      num.style.cssText =
        `font:800 14px system-ui;color:${inMonth ? P.num : P.numDim}`;
      cell.appendChild(num);

      const colors = inMonth ? (byDate[iso] || []) : [];
      const bars = document.createElement("div");
      bars.style.cssText = "display:flex;flex-direction:column;gap:3px;margin-top:5px";
      for (const col of colors.slice(0, 3)) {
        const bar = document.createElement("div");
        bar.style.cssText = `height:5px;border-radius:3px;background:${col};box-shadow:0 1px 2px ${col}66`;
        bars.appendChild(bar);
      }
      if (colors.length > 3) {
        const more = document.createElement("div");
        more.textContent = `+${colors.length - 3} more`;
        more.style.cssText = "font:600 10px system-ui;color:#94a3b8;margin-top:1px";
        bars.appendChild(more);
      }
      cell.appendChild(bars);
      cell.addEventListener("click", () => { this.iso = iso; this.setView("day"); });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    this._grid.appendChild(wrap);
    if (this._scroll) this._scroll.scrollTop = 0;
  }

  /** Whole month as weekly sections, stacked vertically (Mon→Sun + notes). */
  _renderWeek() {
    if (this._scroll) this._scroll.style.overflow = "auto";
    const P = this._pal();
    const [y, m] = this.iso.split("-").map(Number);
    this._title.textContent = `${MONTHS[m - 1]} ${y} · Weeks`;
    this._grid.style.height = "auto";
    this._grid.textContent = "";

    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:12px 14px 96px;display:flex;flex-direction:column;gap:16px";

    const todayIso = todayIsoDate();
    const monthIdx = m - 1;
    const first = new Date(y, monthIdx, 1);
    const monOffset = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday-based
    const daysInMonth = new Date(y, m, 0).getDate();
    const weekCount = Math.ceil((monOffset + daysInMonth) / 7);
    const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    for (let w = 0; w < weekCount; w++) {
      const sec = document.createElement("div");
      sec.style.cssText = `border:1px solid ${P.legendBorder};border-radius:12px;overflow:hidden;background:${P.cellIn}`;
      const head = document.createElement("div");
      head.textContent = `Week ${w + 1}`;
      head.style.cssText = `padding:9px 12px;font:800 13px system-ui;color:${P.num};background:${P.legendBg};border-bottom:1px solid ${P.legendBorder}`;
      sec.appendChild(head);

      for (let d = 0; d < 7; d++) {
        const cellIndex = w * 7 + d;
        const dObj = new Date(y, monthIdx, cellIndex - monOffset + 1); // overflows into adjacent months
        const inMonth = dObj.getMonth() === monthIdx;
        // Weeks are bounded to THIS month — week 1 starts on the 1st, the last
        // week ends on the last day (shortened), no prev/next-month padding.
        if (!inMonth) continue;
        const iso = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
        const isToday = iso === todayIso;

        const row = document.createElement("div");
        row.style.cssText =
          `display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid ${P.legendBorder};cursor:pointer;` +
          (isToday ? "outline:2px solid #818cf8;outline-offset:-2px;" : "");
        row.addEventListener("click", () => { this.iso = iso; this.setView("day"); });

        const dayCol = document.createElement("div");
        dayCol.style.cssText = `flex:0 0 46px;text-align:center;color:${inMonth ? P.num : P.numDim}`;
        const wl = document.createElement("div");
        wl.textContent = WD[d];
        wl.style.cssText = "font:700 11px system-ui";
        const dn = document.createElement("div");
        dn.textContent = String(dObj.getDate());
        dn.style.cssText = "font:800 16px system-ui";
        dayCol.append(wl, dn);
        row.appendChild(dayCol);

        const notesCol = document.createElement("div");
        notesCol.style.cssText = "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center";
        let evs = [];
        try { evs = getEventsForDate(iso); } catch { /* ignore */ }
        if (!evs.length) {
          const empty = document.createElement("div");
          empty.textContent = inMonth ? "No notes" : "";
          empty.style.cssText = `font:500 12px system-ui;color:${P.numDim}`;
          notesCol.appendChild(empty);
        } else {
          for (const rec of evs.slice(0, 5)) {
            const full = getEventById(rec.id);
            const note = document.createElement("div");
            note.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
            const dot = document.createElement("span");
            dot.style.cssText = `flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:${getCategoryColor(rec.category || full?.category)}`;
            const time = document.createElement("span");
            time.textContent = full?.startTime ? clockLabel(minutesOf(full.startTime)) : "";
            time.style.cssText = `flex:0 0 auto;font:500 11px system-ui;color:${P.numDim}`;
            const txt = document.createElement("span");
            txt.textContent = full?.title || rec.title || "(note)";
            txt.style.cssText = `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 12px system-ui;color:${P.num}`;
            note.append(dot, time, txt);
            notesCol.appendChild(note);
          }
          if (evs.length > 5) {
            const more = document.createElement("div");
            more.textContent = `+${evs.length - 5} more`;
            more.style.cssText = `font:600 10px system-ui;color:${P.numDim}`;
            notesCol.appendChild(more);
          }
        }
        row.appendChild(notesCol);
        sec.appendChild(row);
      }
      wrap.appendChild(sec);
    }
    this._grid.appendChild(wrap);
    if (this._scroll) this._scroll.scrollTop = 0;
  }

  // --- render the grid + events ---

  render() {
    if (!this.root) return;
    this._syncAddBar();
    if (this.view === "month") { this._renderMonth(); return; }
    if (this.view === "week") { this._renderWeek(); return; }
    this._renderDay();
  }

  _renderDay() {
    if (this._scroll) this._scroll.style.overflow = "auto";
    const P = this._pal();
    const [y, m, d] = this.iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    this._title.textContent = `${WEEKDAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;

    const pxPerMin = SLOT_PX[this.slot] / this.slot;
    const gridH = DAY_MIN * pxPerMin;
    this._grid.style.height = `${gridH}px`;
    this._grid.textContent = "";

    // Time rail. Hours get a full-width subtle line + bold label. Minor slots
    // (:15/:30/:45) get only a short tick + a faint time label in the gutter —
    // NOT a full-width line — so the canvas stays clean (empty space where
    // nothing's scheduled) and the lines don't box in / clash with event blocks.
    for (let min = 0; min <= DAY_MIN; min += this.slot) {
      const isHour = min % 60 === 0;
      const yTop = min * pxPerMin;
      if (isHour) {
        const line = document.createElement("div");
        line.style.cssText =
          `position:absolute;left:${GUTTER}px;right:0;top:${yTop}px;height:0;border-top:1px solid ${P.gridHour}`;
        this._grid.appendChild(line);
        if (min < DAY_MIN) {
          const lab = document.createElement("div");
          lab.textContent = clockLabel(min);
          lab.style.cssText =
            `position:absolute;left:0;width:${GUTTER - 8}px;top:${yTop - 8}px;` +
            `text-align:right;font:800 12px system-ui;color:${P.hourLabel};letter-spacing:0.3px;text-shadow:${P.hourShadow}`;
          this._grid.appendChild(lab);
        }
      } else if (min < DAY_MIN) {
        // short gutter tick
        const tick = document.createElement("div");
        tick.style.cssText =
          `position:absolute;left:${GUTTER - 9}px;width:9px;top:${yTop}px;height:0;border-top:1px solid ${P.gridMinor}`;
        this._grid.appendChild(tick);
        // faint per-slot time label so each timeframe shows its time for context
        const mlab = document.createElement("div");
        mlab.textContent = clockLabel(min);
        mlab.style.cssText =
          `position:absolute;left:0;width:${GUTTER - 12}px;top:${yTop - 6}px;` +
          `text-align:right;font:700 9.5px system-ui;color:${P.minorLabel};letter-spacing:0.2px`;
        this._grid.appendChild(mlab);
      }
    }

    // Click-empty-to-create layer.
    const hit = document.createElement("div");
    hit.style.cssText = `position:absolute;left:${GUTTER}px;right:0;top:0;height:${gridH}px;cursor:pointer`;
    hit.addEventListener("click", (e) => {
      // rect.top already reflects the scroll offset (hit lives inside the scroll
      // container), so e.clientY - rect.top is the true y in grid coords — adding
      // scrollTop would double-count and register the wrong time.
      const rect = hit.getBoundingClientRect();
      const yPx = e.clientY - rect.top;
      let min = Math.round(yPx / pxPerMin / this.slot) * this.slot;
      min = Math.max(0, Math.min(DAY_MIN - this.slot, min));
      this._openEditor(null, min);
    });
    this._grid.appendChild(hit);

    // Events — lay overlapping ones side-by-side in columns so they never mesh.
    const evs = getEventsForDate(this.iso)
      .map((rec) => {
        const full = getEventById(rec.id);
        const startMin = full ? minutesOf(full.startTime) : 0;
        let endMin = full?.endTime ? minutesOf(full.endTime) : startMin + this.slot;
        if (endMin <= startMin) endMin = startMin + Math.max(15, this.slot);
        return { rec, full, startMin, endMin };
      })
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    // Cluster transitively-overlapping events, then greedily assign columns.
    const colOf = new Map();
    {
      let cluster = [];
      let clusterEnd = -1;
      const flush = () => {
        if (!cluster.length) return;
        const colsEnd = []; // last endMin per column
        for (const e of cluster) {
          let placed = colsEnd.findIndex((end) => e.startMin >= end);
          if (placed === -1) { placed = colsEnd.length; colsEnd.push(e.endMin); }
          else colsEnd[placed] = e.endMin;
          colOf.set(e, { col: placed });
        }
        for (const e of cluster) colOf.get(e).cols = colsEnd.length;
        cluster = [];
        clusterEnd = -1;
      };
      for (const e of evs) {
        if (cluster.length && e.startMin >= clusterEnd) flush();
        cluster.push(e);
        clusterEnd = Math.max(clusterEnd, e.endMin);
      }
      flush();
    }

    const leftBase = GUTTER + 6;
    const avail = Math.max(80, (this._grid.clientWidth || this._scroll?.clientWidth || 640) - leftBase - 10);

    for (const e of evs) {
      const { rec, full, startMin, endMin } = e;
      const { col, cols } = colOf.get(e) ?? { col: 0, cols: 1 };
      const colW = avail / cols;
      const left = leftBase + col * colW;
      const width = colW - (cols > 1 ? 5 : 0);
      const top = startMin * pxPerMin;
      const height = Math.max(20, (Math.max(endMin, startMin + 10) - startMin) * pxPerMin - 2);
      const color = getCategoryColor(rec.category);
      const block = document.createElement("div");
      block.style.cssText =
        `position:absolute;left:${left}px;width:${width}px;top:${top + 1}px;height:${Math.max(18, height - 2)}px;` +
        `background:${blockFill(color)};border:1px solid rgba(255,255,255,0.85);border-left:5px solid ${darken(color, 0.5)};` +
        "border-radius:8px;padding:3px 10px;overflow:hidden;cursor:pointer;box-sizing:border-box;color:#fff;" +
        `box-shadow:0 2px 8px ${color}55,0 0 0 1px rgba(0,0,0,0.15);transition:transform .12s ease`;
      const titleTxt = escapeHtml(rec.title || rec.text || "Untitled");
      const descTxt = rec.text && rec.text !== rec.title ? escapeHtml(rec.text) : "";
      const scrollLine = "overflow-x:auto;overflow-y:hidden;white-space:nowrap;scrollbar-width:none;-ms-overflow-style:none";
      // Apply the user's chosen text style (font/look) when they've picked one;
      // otherwise the default crisp white outline.
      const userStyle = getTextStyleRaw();
      const styleCss = userStyle ? textStyleCss(userStyle) : "";
      const animCss = textAnimCss(getTextAnim());
      const titleStyle = (styleCss || `text-shadow:${BLOCK_TITLE_OUTLINE}`) + (animCss ? `;${animCss}` : "");
      block.innerHTML =
        `<div style="${scrollLine};font-weight:800;font-size:12.5px;${titleStyle}"><span style="opacity:0.92">${clockLabel(startMin)}</span> · ${titleTxt}</div>` +
        (descTxt
          ? `<div style="${scrollLine};font-size:11px;font-weight:600;opacity:0.96;margin-top:1px;${styleCss || `text-shadow:${BLOCK_TITLE_OUTLINE}`}">${descTxt}</div>`
          : "");
      const ev = full ?? rec;
      block.addEventListener("mouseenter", () => { if (!block.style.animation) block.style.transform = "translateY(-1px) scale(1.006)"; });
      block.addEventListener("mouseleave", () => { block.style.transform = "none"; });
      block.addEventListener("click", (e) => {
        e.stopPropagation();
        // Playful shake feedback on tap, then open the editor.
        block.style.transform = "none";
        block.style.animation = "cal2d-shake 0.42s cubic-bezier(.36,.07,.19,.97)";
        setTimeout(() => { block.style.animation = ""; this._openEditor(ev, startMin); }, 380);
      });
      this._grid.appendChild(block);
    }

    this._renderNowLine(pxPerMin);

    // Scroll to ~8am on first render of a day.
    if (this._scroll && !this._scrolled) {
      this._scroll.scrollTop = 8 * 60 * pxPerMin;
      this._scrolled = true;
    }
  }

  _renderNowLine(pxPerMin) {
    if (this.iso !== todayIsoDate()) return;
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement("div");
    line.id = "cal2d-now";
    line.style.cssText =
      `position:absolute;left:${GUTTER}px;right:0;top:${min * pxPerMin}px;height:0;` +
      "border-top:2px solid #ef4444;z-index:5";
    const dot = document.createElement("div");
    dot.style.cssText =
      `position:absolute;left:${GUTTER - 4}px;top:${min * pxPerMin - 4}px;width:8px;height:8px;` +
      "border-radius:50%;background:#ef4444;z-index:5";
    this._grid.append(line, dot);
  }

  _startNowTimer() {
    if (this._nowTimer) clearInterval(this._nowTimer);
    this._nowTimer = setInterval(() => {
      if (this.root?.style.display !== "none") this.render();
    }, 60000);
  }

  // --- Inkling autosuggest (local, instant) ---

  /** Build the completion corpus from the user's own events + common phrases. */
  _buildCorpus() {
    const seen = new Set();
    const out = [];
    const add = (s) => {
      const t = String(s ?? "").trim();
      if (t && t.length <= 60 && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    };
    try {
      for (const r of getEventsForYear(new Date().getFullYear())) {
        add(r.title);
        if (r.text && r.text !== r.title) add(r.text);
      }
    } catch { /* ignore */ }
    for (const c of COMMON_TITLES) add(c);
    this._corpus = out;
  }

  /** Predict the rest of a phrase given what's typed so far. */
  _predict(typed) {
    if (!this._corpus || typed.length < 2) return "";
    const low = typed.toLowerCase();
    for (const phrase of this._corpus) {
      if (phrase.length > typed.length && phrase.toLowerCase().startsWith(low)) {
        return phrase.slice(typed.length);
      }
    }
    return "";
  }

  /** Inline ghost-completion: append the prediction as a selected suffix; Tab/→ accepts. */
  _attachTypeahead(input) {
    input.addEventListener("keydown", (e) => {
      const hasSuggestion = input.selectionStart !== input.selectionEnd && input.selectionEnd === input.value.length;
      if (hasSuggestion && (e.key === "Tab" || e.key === "ArrowRight")) {
        e.preventDefault();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
    input.addEventListener("input", (e) => {
      if (e.inputType && e.inputType.startsWith("delete")) return;
      // After a forward keystroke the selected suffix (if any) was replaced, so
      // value is the real typed text with a collapsed caret at the end.
      if (input.selectionStart !== input.value.length) return;
      const typed = input.value;
      const sug = this._predict(typed);
      if (sug) {
        input.value = typed + sug;
        input.setSelectionRange(typed.length, input.value.length);
      }
    });
  }

  // --- event editor ---

  _openEditor(ev, startMin) {
    if (!this._corpus) this._buildCorpus();
    const isEdit = ev && ev.id && getEventById(ev.id);
    const startMinutes = ev?.startTime ? minutesOf(ev.startTime) : startMin;
    const endMinutes = ev?.endTime ? minutesOf(ev.endTime) : Math.min(DAY_MIN, startMinutes + this.slot);

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:11010;background:rgba(15,23,42,0.45);display:flex;" +
      "align-items:center;justify-content:center;padding:16px";
    const card = document.createElement("div");
    card.style.cssText =
      "width:min(440px,94vw);background:#fff;border-radius:14px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,0.35)";

    const field = (labelText, el) => {
      const wrap = document.createElement("label");
      wrap.style.cssText = "display:block;margin-bottom:11px;font-size:12px;font-weight:600;color:#475569";
      wrap.textContent = labelText;
      el.style.cssText =
        "display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;" +
        "border:1px solid #cbd5e1;border-radius:8px;font:500 14px system-ui;color:#0f172a;background:#fff";
      wrap.appendChild(el);
      return wrap;
    };

    const titleInput = document.createElement("input");
    titleInput.type = "text"; titleInput.placeholder = "Title";
    titleInput.value = ev?.title ?? ev?.text ?? "";
    const descInput = document.createElement("textarea");
    descInput.rows = 2; descInput.placeholder = "Description";
    descInput.value = ev?.body ?? "";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = ev?.startTime
      ? (() => { const d = new Date(ev.startTime); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })()
      : this.iso;
    const startInput = document.createElement("input");
    startInput.type = "time"; startInput.value = hhmm(startMinutes);
    const endInput = document.createElement("input");
    endInput.type = "time"; endInput.value = hhmm(endMinutes);
    const catSel = document.createElement("select");
    for (const [val, label] of CATEGORIES) {
      const o = document.createElement("option");
      o.value = val; o.textContent = label;
      if (val === (ev?.category ?? "work")) o.selected = true;
      catSel.appendChild(o);
    }

    // Inkling autosuggest: ghost word-completion on title + description.
    this._attachTypeahead(titleInput);
    this._attachTypeahead(descInput);

    // Auto-category: Inkling reads the words and picks the color in the
    // background, unless the user manually chooses one.
    let catTouched = Boolean(isEdit);
    catSel.addEventListener("change", () => { catTouched = true; });
    const autoCat = () => {
      if (catTouched) return;
      const text = `${titleInput.value} ${descInput.value}`.trim();
      if (text.length < 3) return;
      let c = classifyText(text);
      if (c === "errand") c = "errands";
      if (c === "default") return;
      if ([...catSel.options].some((o) => o.value === c)) catSel.value = c;
    };
    titleInput.addEventListener("input", autoCat);
    descInput.addEventListener("input", autoCat);

    // Title prompt chips (quick fills): common prompts + the user's recent titles.
    const chips = document.createElement("div");
    chips.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px";
    const recent = (this._corpus || []).filter((s) => !s.endsWith(" ")).slice(0, 3);
    const promptSet = [...new Set([...TITLE_PROMPTS, ...recent])].slice(0, 7);
    for (const p of promptSet) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = p.trim();
      chip.style.cssText =
        "background:#eef2ff;color:#4338ca;border:0;border-radius:999px;padding:5px 11px;font:600 12px system-ui;cursor:pointer";
      chip.addEventListener("click", () => { titleInput.value = p; autoCat(); titleInput.focus(); });
      chips.appendChild(chip);
    }

    const heading = document.createElement("div");
    heading.textContent = isEdit ? "Edit event" : "New event";
    heading.style.cssText = "font-weight:700;font-size:17px;color:#0f172a;margin-bottom:14px";

    const times = document.createElement("div");
    times.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
    times.append(field("Date", dateInput), field("Start", startInput), field("End", endInput));

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;margin-top:6px";
    const save = document.createElement("button");
    save.textContent = isEdit ? "Save" : "Add";
    save.style.cssText =
      "flex:1;background:#2563eb;color:#fff;border:0;border-radius:9px;padding:10px;font:700 14px system-ui;cursor:pointer";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText =
      "background:#f1f5f9;color:#334155;border:0;border-radius:9px;padding:10px 14px;font:600 14px system-ui;cursor:pointer";
    const close = () => overlay.remove();
    cancel.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim() || "Untitled";
      const dateIso = dateInput.value || this.iso;
      const startHHMM = startInput.value || hhmm(startMinutes);
      const startISO = buildStartTimeIso(dateIso, startHHMM);
      const payload = {
        type: "appointment",
        title,
        body: descInput.value.trim(),
        startTime: startISO,
        endTime: buildStartTimeIso(dateIso, endInput.value || hhmm(endMinutes)),
        category: catSel.value,
        // Remind at the event's time so timed alerts can fire.
        alerts: [{ time: startISO, kind: "popup" }],
        _wwRender: { date: dateIso }
      };
      try {
        const saved = isEdit ? updateEvent(ev.id, payload) : createEvent(payload);
        // Bridge into the alerts store so the scheduler actually fires a
        // timed notification at the event's start time. Build it from the real
        // start time (the event's `.time` field is not derived from startTime).
        try {
          removeAlertsForEntry(saved.id); // clear any prior alert (time may have changed)
          addAlert(createAlert({
            time: startHHMM,
            date: dateIso,
            text: title,
            category: catSel.value,
            kind: "popup",
            // Fire ONCE at the set time — no 60/30/10-min pre-alerts (those made
            // a single reminder "go off twice").
            priority: AlertPriority.LOW,
            timelineEntryId: saved.id
          }));
          recomputeSchedule();
        } catch (e) { console.warn("[Calendar2DDay] alert bridge failed", e); }
        this._maybeAskNotify();
        close();
        // Jump to the chosen date so the new/edited event is visible.
        if (dateIso !== this.iso) { this.iso = dateIso; this.setView("day"); }
        else this.render();
      } catch (err) {
        console.warn("[Calendar2DDay] save failed", err);
        heading.textContent = "Couldn't save — check the times.";
      }
    });
    actions.append(save, cancel);
    if (isEdit) {
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.style.cssText =
        "background:#fef2f2;color:#dc2626;border:0;border-radius:9px;padding:10px 14px;font:600 14px system-ui;cursor:pointer";
      del.addEventListener("click", () => { deleteEvent(ev.id); close(); this.render(); });
      actions.append(del);
    }

    card.append(heading, field("Title", titleInput), chips, field("Description", descInput), times, field("Category", catSel), actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    titleInput.focus();
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
