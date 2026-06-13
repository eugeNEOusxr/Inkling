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
  todayIsoDate
} from "../../wordweaver/timelineModel.js";

const SLOT_PX = { 15: 20, 30: 34, 60: 58 }; // row height per slot size
const DAY_MIN = 24 * 60;
const GUTTER = 64; // left time-label column width (px)

/** Friendly category set for the editor (value → label). */
const CATEGORIES = [
  ["work", "Work"], ["personal", "Personal"], ["health", "Health"],
  ["study", "Study"], ["creative", "Creative"], ["errands", "Errands"],
  ["appointment", "Appointment"], ["reminder", "Reminder"]
];

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

export class Calendar2DDay {
  constructor() {
    this.iso = todayIsoDate();
    this.slot = 30;
    this.root = null;
    this._grid = null;
    this._editing = null; // event id being edited, or null for new
    this._nowTimer = null;
  }

  // --- lifecycle ---

  open(iso) {
    if (iso) this.iso = iso;
    this._build();
    this.root.style.display = "flex";
    this.render();
    this._startNowTimer();
  }

  close() {
    if (this.root) this.root.style.display = "none";
    if (this._nowTimer) { clearInterval(this._nowTimer); this._nowTimer = null; }
  }

  setDate(iso) { this.iso = iso; this.render(); }

  shiftDay(delta) {
    const [y, m, d] = this.iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    this.iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    this.render();
  }

  setSlot(slot) {
    this.slot = slot;
    if (this._slotSel) this._slotSel.value = String(slot);
    this.render();
  }

  // --- build shell ---

  _build() {
    if (this.root) return;
    const root = document.createElement("div");
    root.id = "cal2d-day";
    root.style.cssText =
      "position:fixed;inset:0;z-index:11000;display:none;flex-direction:column;" +
      "background:#ffffff;color:#1e293b;font:500 14px system-ui,-apple-system,sans-serif";

    // Header bar
    const head = document.createElement("div");
    head.style.cssText =
      "flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 14px;" +
      "border-bottom:1px solid #e2e8f0;background:#f8fafc";
    const prev = this._navBtn("‹", () => this.shiftDay(-1));
    const next = this._navBtn("›", () => this.shiftDay(1));
    const today = this._navBtn("Today", () => this.setDate(todayIsoDate()));
    today.style.width = "auto";
    today.style.padding = "0 12px";
    const title = document.createElement("div");
    title.style.cssText = "flex:1;font-weight:700;font-size:17px;color:#0f172a";
    this._title = title;

    const slotSel = document.createElement("select");
    slotSel.style.cssText =
      "border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;background:#fff;color:#0f172a;font:600 13px system-ui";
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
    zoomLabel.style.cssText = "font-size:12px;color:#64748b";

    const close = this._navBtn("✕", () => this.close());
    head.append(prev, next, today, title, zoomLabel, slotSel, close);

    // Scrollable grid
    const scroll = document.createElement("div");
    scroll.style.cssText = "flex:1;overflow:auto;position:relative;background:#fff";
    const grid = document.createElement("div");
    grid.style.cssText = "position:relative;width:100%";
    scroll.appendChild(grid);
    this._scroll = scroll;
    this._grid = grid;

    root.append(head, scroll);
    document.body.appendChild(root);
    this.root = root;
  }

  _navBtn(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "height:34px;min-width:34px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;" +
      "color:#0f172a;font:700 15px system-ui;cursor:pointer;flex:0 0 auto";
    b.addEventListener("click", onClick);
    return b;
  }

  // --- render the grid + events ---

  render() {
    if (!this.root) return;
    const [y, m, d] = this.iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    this._title.textContent = `${WEEKDAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;

    const pxPerMin = SLOT_PX[this.slot] / this.slot;
    const gridH = DAY_MIN * pxPerMin;
    this._grid.style.height = `${gridH}px`;
    this._grid.textContent = "";

    // Hour lines + labels (+ minor slot lines).
    for (let min = 0; min <= DAY_MIN; min += this.slot) {
      const isHour = min % 60 === 0;
      const line = document.createElement("div");
      line.style.cssText =
        `position:absolute;left:${GUTTER}px;right:0;top:${min * pxPerMin}px;height:0;` +
        `border-top:1px solid ${isHour ? "#e2e8f0" : "#f1f5f9"}`;
      this._grid.appendChild(line);
      if (isHour && min < DAY_MIN) {
        const lab = document.createElement("div");
        lab.textContent = clockLabel(min);
        lab.style.cssText =
          `position:absolute;left:0;width:${GUTTER - 8}px;top:${min * pxPerMin - 7}px;` +
          "text-align:right;font-size:11px;color:#94a3b8";
        this._grid.appendChild(lab);
      }
    }

    // Click-empty-to-create layer.
    const hit = document.createElement("div");
    hit.style.cssText = `position:absolute;left:${GUTTER}px;right:0;top:0;height:${gridH}px;cursor:pointer`;
    hit.addEventListener("click", (e) => {
      const rect = hit.getBoundingClientRect();
      const yPx = e.clientY - rect.top + this._scroll.scrollTop - 0;
      let min = Math.round(yPx / pxPerMin / this.slot) * this.slot;
      min = Math.max(0, Math.min(DAY_MIN - this.slot, min));
      this._openEditor(null, min);
    });
    this._grid.appendChild(hit);

    // Events.
    for (const rec of getEventsForDate(this.iso)) {
      const full = getEventById(rec.id);
      const startMin = full ? minutesOf(full.startTime) : 0;
      const endMin = full?.endTime ? minutesOf(full.endTime) : startMin + this.slot;
      const top = startMin * pxPerMin;
      const height = Math.max(20, (Math.max(endMin, startMin + 10) - startMin) * pxPerMin - 2);
      const color = getCategoryColor(rec.category);
      const block = document.createElement("div");
      block.style.cssText =
        `position:absolute;left:${GUTTER + 6}px;right:10px;top:${top}px;height:${height}px;` +
        `background:${color}22;border-left:4px solid ${color};border-radius:6px;padding:3px 8px;` +
        "overflow:hidden;cursor:pointer;box-sizing:border-box";
      block.innerHTML =
        `<div style="font-weight:700;font-size:12px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(rec.title || rec.text || "Untitled")}</div>` +
        `<div style="font-size:11px;color:#475569">${clockLabel(startMin)}</div>`;
      block.addEventListener("click", (e) => { e.stopPropagation(); this._openEditor(full ?? rec, startMin); });
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

  // --- event editor ---

  _openEditor(ev, startMin) {
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

    const heading = document.createElement("div");
    heading.textContent = isEdit ? "Edit event" : "New event";
    heading.style.cssText = "font-weight:700;font-size:17px;color:#0f172a;margin-bottom:14px";

    const times = document.createElement("div");
    times.style.cssText = "display:flex;gap:10px";
    times.append(field("Start", startInput), field("End", endInput));

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
      const payload = {
        type: "appointment",
        title,
        body: descInput.value.trim(),
        startTime: buildStartTimeIso(this.iso, startInput.value || hhmm(startMinutes)),
        endTime: buildStartTimeIso(this.iso, endInput.value || hhmm(endMinutes)),
        category: catSel.value,
        _wwRender: { date: this.iso }
      };
      try {
        if (isEdit) updateEvent(ev.id, payload);
        else createEvent(payload);
        close();
        this.render();
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

    card.append(heading, field("Title", titleInput), field("Description", descInput), times, field("Category", catSel), actions);
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
