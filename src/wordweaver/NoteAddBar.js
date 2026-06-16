/**
 * Reusable quick-add note bar — a text box, a time button that opens a compact
 * scrollable time wheel (12:00 AM … 11:30 PM), and an Add (+) button. Shared by
 * the 3D day view and the 2D day view.
 *
 * On add it routes through saveNoteToTimeline (auto-classifies the note by its
 * text and attaches an alert), then calls onAdded(dateIso) so the host can
 * refresh its view. No time chosen ⇒ an automatic "now" timestamp.
 *
 * z-index sits ABOVE the day-view surfaces but BELOW the Inkling orb/panel, so
 * the bar is always reachable yet Inkling can still open over it.
 */
import { saveNoteToTimeline } from "./timelineModel.js";

const STEP_MIN = 30;

const pad2 = (n) => String(n).padStart(2, "0");
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
/** Days between iso and today (local), negative = past. */
function dayDiffFromToday(iso) {
  const a = isoToDate(iso);
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - today) / 86400000);
}
/** "M/D/YY <Today|Tomorrow|Yesterday|Weekday>" — date first, relative word after. */
function relativeDayLabel(iso) {
  const dt = isoToDate(iso);
  const md = `${dt.getMonth() + 1}/${dt.getDate()}/${String(dt.getFullYear()).slice(-2)}`;
  const diff = dayDiffFromToday(iso);
  let rel;
  if (diff === 0) rel = "Today";
  else if (diff === 1) rel = "Tomorrow";
  else if (diff === -1) rel = "Yesterday";
  else rel = dt.toLocaleDateString(undefined, { weekday: "long" });
  return `${md} ${rel}`;
}

function injectStyles() {
  if (document.getElementById("note-addbar-styles")) return;
  const s = document.createElement("style");
  s.id = "note-addbar-styles";
  s.textContent = `
    .nab-bar {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--nab-bottom, 158px) + env(safe-area-inset-bottom, 0px));
      z-index: 11200; display: flex; flex-direction: column; align-items: stretch; gap: 8px;
      width: min(560px, calc(100vw - 24px));
      padding: 8px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(20,28,42,0.92), rgba(10,14,24,0.96));
      border: 1px solid rgba(78,230,230,0.30);
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
    }
    .nab-bar.hidden { display: none !important; }
    .nab-row { display: flex; align-items: center; gap: 8px; }
    .nab-date {
      display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .nab-date-arrow {
      flex: 0 0 auto; width: 34px; height: 32px; border-radius: 9px;
      border: 1px solid rgba(125,211,252,0.35); background: rgba(14,116,144,0.25);
      color: #e0fbff; font: 700 16px system-ui; cursor: pointer; line-height: 1;
    }
    .nab-date-label {
      flex: 0 0 auto; min-width: 168px; height: 32px; padding: 0 14px;
      border-radius: 9px; border: 1px solid rgba(125,211,252,0.4);
      background: rgba(34,211,238,0.16); color: #e0fffe;
      font: 700 13px system-ui; cursor: pointer; white-space: nowrap;
    }
    .nab-time {
      flex: 0 0 auto; min-width: 92px; height: 40px; padding: 0 12px;
      border-radius: 11px; border: 1px solid rgba(125,211,252,0.4);
      background: rgba(14,116,144,0.35); color: #e0fbff; font: 600 13px system-ui;
      cursor: pointer; white-space: nowrap;
    }
    .nab-text {
      flex: 1 1 auto; min-width: 0; height: 40px; padding: 0 12px;
      border-radius: 11px; border: 1px solid rgba(148,163,184,0.35);
      background: rgba(8,12,22,0.85); color: #f1f5f9; font: 500 14px system-ui;
    }
    .nab-text::placeholder { color: #7e93b0; }
    .nab-add {
      flex: 0 0 auto; width: 44px; height: 40px; border-radius: 11px; border: 0;
      background: linear-gradient(180deg, #22d3ee, #0891b2); color: #042027;
      font: 800 22px system-ui; cursor: pointer; line-height: 1;
      transition: transform .12s ease, background .25s ease;
    }
    .nab-add:active { transform: scale(0.92); }
    .nab-add.ok { background: linear-gradient(180deg, #34d399, #059669); }

    .nab-wheel {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(var(--nab-bottom, 158px) + 64px + env(safe-area-inset-bottom, 0px));
      z-index: 11220;
      width: min(560px, calc(100vw - 24px)); max-height: 50vh;
      display: flex; flex-direction: column; overflow: hidden;
      background: linear-gradient(180deg, rgba(20,28,42,0.97), rgba(10,14,24,0.98));
      border: 1px solid rgba(78,230,230,0.30); border-radius: 16px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.6); backdrop-filter: blur(10px);
    }
    .nab-wheel.hidden { display: none !important; }
    .nab-wheel-head {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 10px; color: #e2e8f0; font: 800 17px system-ui;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .nab-wheel-head span { flex: 1 1 auto; }
    .nab-wheel-now, .nab-wheel-close {
      flex: 0 0 auto; height: 36px; padding: 0 14px; border-radius: 10px;
      border: 1px solid rgba(78,230,230,0.4); background: rgba(14,116,144,0.3);
      color: #e0fbff; font: 700 13px system-ui; cursor: pointer;
    }
    .nab-wheel-close { width: 38px; padding: 0; }
    .nab-wheel-list {
      flex: 1 1 auto; overflow-y: auto; padding: 10px 12px 14px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px;
      align-content: start;
    }
    .nab-wheel-item {
      height: 48px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(20,28,42,0.7); color: #cbd5e1; font: 700 15px system-ui; cursor: pointer;
    }
    .nab-wheel-item.is-active {
      border-color: rgba(34,211,238,0.8); background: rgba(34,211,238,0.18); color: #e0fffe;
      box-shadow: 0 0 14px rgba(34,211,238,0.25);
    }
  `;
  document.head.appendChild(s);
}

export class NoteAddBar {
  /** @param {{ onAdded?: (dateIso: string) => void, bottomPx?: number }} [opts] */
  constructor(opts = {}) {
    this._onAdded = typeof opts.onAdded === "function" ? opts.onAdded : null;
    this._bottomPx = opts.bottomPx ?? 158;
    this._dayIso = null;
    this._time = null; // chosen "HH:MM" or null → "now"
    this._build();
  }

  _build() {
    injectStyles();

    const bar = document.createElement("div");
    bar.className = "nab-bar hidden";
    bar.style.setProperty("--nab-bottom", `${this._bottomPx}px`);
    bar.innerHTML = `
      <div class="nab-date">
        <button class="nab-date-arrow nab-date-prev" type="button" aria-label="Previous day">‹</button>
        <button class="nab-date-label" type="button" title="Tap to reset to today">Today</button>
        <button class="nab-date-arrow nab-date-next" type="button" aria-label="Next day">›</button>
      </div>
      <div class="nab-row">
        <button class="nab-time" type="button" title="Pick a time">🕐 Now</button>
        <input class="nab-text" type="text" placeholder="Add a note…" maxlength="240" />
        <button class="nab-add" type="button" aria-label="Add note">＋</button>
      </div>`;
    document.body.appendChild(bar);
    this.bar = bar;
    this.timeBtn = bar.querySelector(".nab-time");
    this.textInput = bar.querySelector(".nab-text");
    this.addBtn = bar.querySelector(".nab-add");
    this.dateLabel = bar.querySelector(".nab-date-label");
    this.timeBtn.addEventListener("click", () => this._openWheel());
    this.addBtn.addEventListener("click", () => this._commitAdd());
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this._commitAdd(); }
    });
    bar.querySelector(".nab-date-prev").addEventListener("click", () => this._shiftDay(-1));
    bar.querySelector(".nab-date-next").addEventListener("click", () => this._shiftDay(1));
    this.dateLabel.addEventListener("click", () => { this._dayIso = todayIso(); this._updateDateLabel(); });

    const wheel = document.createElement("div");
    wheel.className = "nab-wheel hidden";
    wheel.style.setProperty("--nab-bottom", `${this._bottomPx}px`);
    wheel.innerHTML = `
      <div class="nab-wheel-head">
        <span>Pick a time</span>
        <button class="nab-wheel-now" type="button">Now</button>
        <button class="nab-wheel-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="nab-wheel-list"></div>`;
    document.body.appendChild(wheel);
    this.wheel = wheel;
    this.wheelList = wheel.querySelector(".nab-wheel-list");
    wheel.querySelector(".nab-wheel-close").addEventListener("click", () => this._closeWheel());
    wheel.querySelector(".nab-wheel-now").addEventListener("click", () => { this._setTime(null); this._closeWheel(); });
    this._fillWheel();
  }

  _fmt12(h, m) {
    const ap = h >= 12 ? "PM" : "AM";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
  }

  _fillWheel() {
    const frag = document.createDocumentFragment();
    for (let mins = 0; mins < 24 * 60; mins += STEP_MIN) {
      const h = Math.floor(mins / 60), m = mins % 60;
      const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nab-wheel-item";
      b.dataset.time = hhmm;
      b.textContent = this._fmt12(h, m);
      b.addEventListener("click", () => { this._setTime(hhmm); this._closeWheel(); });
      frag.appendChild(b);
    }
    this.wheelList.appendChild(frag);
  }

  _setTime(hhmm) {
    this._time = hhmm;
    if (hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      this.timeBtn.textContent = `🕐 ${this._fmt12(h, m)}`;
    } else {
      this.timeBtn.textContent = "🕐 Now";
    }
  }

  _openWheel() {
    this.wheel.classList.remove("hidden");
    let active = null;
    this.wheelList.querySelectorAll(".nab-wheel-item").forEach((b) => {
      const on = b.dataset.time === this._time;
      b.classList.toggle("is-active", on);
      if (on) active = b;
    });
    if (active) active.scrollIntoView({ block: "center" });
  }

  _closeWheel() { this.wheel.classList.add("hidden"); }

  _nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /** Step the target day by ±1 and refresh the label. */
  _shiftDay(delta) {
    const base = this._dayIso ? isoToDate(this._dayIso) : new Date();
    base.setDate(base.getDate() + delta);
    this._dayIso = dateToIso(base);
    this._updateDateLabel();
  }

  _updateDateLabel() {
    if (!this.dateLabel) return;
    const iso = this._dayIso || todayIso();
    this.dateLabel.textContent = relativeDayLabel(iso);
    this.dateLabel.title = `${iso} — tap to reset to today`;
  }

  _commitAdd() {
    const text = (this.textInput.value || "").trim();
    if (!text) { this.textInput.focus(); return; }
    const date = this._dayIso;
    if (!date) return;
    const time = this._time || this._nowHHMM();
    try {
      saveNoteToTimeline({ text, time, date });
    } catch (err) {
      console.warn("[NoteAddBar] add failed", err);
      return;
    }
    this.textInput.value = "";
    this._setTime(null);
    this.addBtn.classList.add("ok");
    setTimeout(() => this.addBtn.classList.remove("ok"), 600);
    this._onAdded?.(date);
  }

  /**
   * Show the bar, defaulting its day target to dateIso (the open day, or today).
   * The user can re-pick the day with the ‹ › stepper before adding.
   * @param {string} dateIso
   * @param {{ placeholder?: string }} [opts]
   */
  show(dateIso, opts = {}) {
    this._dayIso = dateIso || this._dayIso || todayIso();
    if (this.textInput) {
      this.textInput.placeholder = opts.placeholder || "Add a note…";
    }
    this._updateDateLabel();
    this.bar.classList.remove("hidden");
  }

  hide() {
    this._closeWheel();
    this.bar?.classList.add("hidden");
  }

  dispose() {
    this.bar?.remove();
    this.wheel?.remove();
  }
}
