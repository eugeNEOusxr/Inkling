/**
 * Connections2D — the 2D node map of your calendar (configure here, then mirror
 * to 3D). Category hubs sized by activity, notes orbiting each, and people linked
 * across categories by red connection lines. Driven ONLY by what's already in the
 * calendar (commitments + time) — no extra tracking. See
 * docs/WORDWEAVER_CONNECTIONS_DESIGN.md.
 */
import { getEventsForMonth, CategoryColors, classifyText } from "../../wordweaver/timelineModel.js";

const NS = "http://www.w3.org/2000/svg";
const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work", personal: "Personal",
  creative: "Creative", errands: "Errands", finance: "Finance",
  appointment: "Appointments", deadline: "Deadlines", reminder: "Reminders",
  social: "Social", default: "Other"
};
const CAT_COLOR_OVERRIDE = { health: "#ef4444" };
const PERSON_RE = /\b(?:with|w\/|meet(?:ing)?(?:\s+with)?|call|see|saw|visit|lunch with|dinner with|coffee with|catch up with)\s+([A-Z][a-z]+)\b/g;
const NOT_NAMES = new Set(["the", "me", "my", "team", "today", "tomorrow", "work", "lunch", "dinner", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function catColor(cat) {
  const k = cat === "errand" ? "errands" : cat;
  return CAT_COLOR_OVERRIDE[k] ?? CategoryColors[k] ?? CategoryColors.default ?? "#94a3b8";
}
function catOf(ev) {
  let c = String(ev.category || "").toLowerCase().trim();
  if (!c || c === "default") { try { c = classifyText(ev.text || "") || "default"; } catch { c = "default"; } }
  return c === "errand" ? "errands" : c;
}
function el(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

export class Connections2D {
  constructor() {
    this._root = null;
    this._svg = null;
    this._list = null;
    this.scope = "month"; // "week" | "month"
  }

  _build() {
    if (this._root) return;
    const root = document.createElement("div");
    root.id = "ww-connections-2d";
    root.style.cssText =
      "position:fixed;inset:0;z-index:11086;display:none;flex-direction:column;" +
      "background:radial-gradient(ellipse at 50% -10%,#141b34 0%,#0a0e1c 60%,#05070f 100%);color:#e2e8f0;font:600 12px system-ui";

    const head = document.createElement("div");
    head.style.cssText = "flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.1);flex-wrap:wrap";
    const title = document.createElement("div");
    title.innerHTML = "🕸 <b>Connections</b>";
    title.style.cssText = "font:800 16px system-ui;color:#c7d2fe";
    const mkScope = (key, label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.dataset.scope = key;
      b.style.cssText = "border:1px solid rgba(129,140,248,.4);border-radius:999px;padding:6px 12px;font:700 12px system-ui;cursor:pointer;background:#1e293b;color:#e2e8f0";
      b.addEventListener("click", () => { this.scope = key; this._render(); });
      return b;
    };
    this._scopeBtns = [mkScope("week", "This week"), mkScope("month", "This month")];
    const spacer = document.createElement("div");
    spacer.style.cssText = "flex:1 1 auto";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px";
    close.addEventListener("click", () => this.hide());
    head.append(title, this._scopeBtns[0], this._scopeBtns[1], spacer, close);

    const hint = document.createElement("div");
    hint.id = "ww-c2d-hint";
    hint.style.cssText = "flex:0 0 auto;padding:8px 14px;color:#a5b4fc;font:600 12px system-ui";

    const svgWrap = document.createElement("div");
    svgWrap.style.cssText = "flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center";
    const svg = el("svg", { viewBox: "0 0 900 640", width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet" });
    svg.style.cssText = "max-width:100%;max-height:100%";
    svgWrap.appendChild(svg);

    const list = document.createElement("div");
    list.id = "ww-c2d-list";
    list.style.cssText = "flex:0 0 auto;max-height:34vh;overflow:auto;padding:8px 14px 16px;border-top:1px solid rgba(255,255,255,0.08)";

    root.append(head, hint, svgWrap, list);
    document.body.appendChild(root);
    this._root = root;
    this._svg = svg;
    this._hint = hint;
    this._list = list;
  }

  _gather() {
    const now = new Date();
    const events = [];
    try {
      // Always pull the month; filter to the current week when scoped.
      for (const e of getEventsForMonth(now.getFullYear(), now.getMonth() + 1) || []) events.push(e);
    } catch { /* ignore */ }
    if (this.scope === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      return events.filter((e) => { const d = new Date(`${e.date}T12:00:00`); return d >= start && d < end; });
    }
    return events;
  }

  _peopleIn(text) {
    const out = [];
    PERSON_RE.lastIndex = 0;
    let m;
    while ((m = PERSON_RE.exec(text || ""))) {
      const name = m[1];
      if (!NOT_NAMES.has(name.toLowerCase())) out.push(name);
    }
    return out;
  }

  _render() {
    this._build();
    for (const b of this._scopeBtns) {
      const on = b.dataset.scope === this.scope;
      b.style.background = on ? "#4338ca" : "#1e293b";
      b.style.borderColor = on ? "#818cf8" : "rgba(129,140,248,.4)";
    }
    const svg = this._svg;
    svg.replaceChildren();
    this._list.replaceChildren();

    const events = this._gather();
    const cx = 450, cy = 320, R1 = 165, R2 = 285;

    if (!events.length) {
      this._hint.textContent = "Nothing logged in this window yet — jot a few entries and the map fills in.";
      const t = el("text", { x: cx, y: cy, fill: "#64748b", "font-size": "18", "text-anchor": "middle" });
      t.textContent = "No connections yet";
      svg.appendChild(t);
      return;
    }

    // Group by category + collect people.
    const byCat = new Map();
    for (const ev of events) {
      const c = catOf(ev);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(ev);
    }
    const cats = [...byCat.keys()].sort((a, b) => byCat.get(b).length - byCat.get(a).length);
    const peopleSet = new Map(); // name -> count
    for (const ev of events) for (const p of this._peopleIn(`${ev.text || ""} ${ev.title || ""}`)) peopleSet.set(p, (peopleSet.get(p) || 0) + 1);
    const people = [...peopleSet.keys()].sort((a, b) => peopleSet.get(b) - peopleSet.get(a)).slice(0, 8);

    this._hint.innerHTML =
      `✦ <b>${events.length}</b> entries · <b>${cats.length}</b> categories` +
      (people.length ? ` · <b>${people.length}</b> people` : "") +
      " — tap a hub or a person to break it down.";

    // Defs: a soft glow.
    const noteDots = []; // { x,y,text,cat,people:[] }

    // Center "you" node.
    svg.appendChild(el("circle", { cx, cy, r: 26, fill: "#1e293b", stroke: "#818cf8", "stroke-width": "2" }));
    const youT = el("text", { x: cx, y: cy + 5, fill: "#c7d2fe", "font-size": "13", "font-weight": "800", "text-anchor": "middle" });
    youT.textContent = this.scope === "week" ? "Week" : "Month";
    svg.appendChild(youT);

    // Category hubs around the inner ring.
    const hubPos = {};
    cats.forEach((cat, i) => {
      const ang = (-90 + (i * 360) / cats.length) * Math.PI / 180;
      const hx = cx + R1 * Math.cos(ang), hy = cy + R1 * Math.sin(ang);
      hubPos[cat] = { x: hx, y: hy };
      const items = byCat.get(cat);
      const color = catColor(cat);
      // faint spoke to center
      svg.appendChild(el("line", { x1: cx, y1: cy, x2: hx, y2: hy, stroke: "rgba(255,255,255,0.08)", "stroke-width": "1" }));
      // notes orbiting this hub
      const shown = items.slice(0, 8);
      shown.forEach((ev, j) => {
        const a2 = (j * 360 / Math.max(1, shown.length)) * Math.PI / 180;
        const nx = hx + 52 * Math.cos(a2), ny = hy + 52 * Math.sin(a2);
        svg.appendChild(el("line", { x1: hx, y1: hy, x2: nx, y2: ny, stroke: color, "stroke-width": "1", opacity: "0.5" }));
        const dot = el("circle", { cx: nx, cy: ny, r: 5, fill: color, opacity: "0.9" });
        svg.appendChild(dot);
        noteDots.push({ x: nx, y: ny, text: (ev.text || ev.title || "Note").trim(), cat, people: this._peopleIn(`${ev.text || ""} ${ev.title || ""}`), time: ev.time, date: ev.date });
      });
      // hub circle (sized by count)
      const r = Math.max(20, Math.min(46, 18 + items.length * 3));
      const hub = el("circle", { cx: hx, cy: hy, r, fill: color, opacity: "0.92", stroke: "rgba(255,255,255,0.5)", "stroke-width": "1.5", cursor: "pointer" });
      hub.addEventListener("click", () => this._showList(CAT_LABEL[cat] ?? cat, items, color));
      svg.appendChild(hub);
      const cnt = el("text", { x: hx, y: hy + 5, fill: "#0b1020", "font-size": "15", "font-weight": "900", "text-anchor": "middle", "pointer-events": "none" });
      cnt.textContent = String(items.length);
      svg.appendChild(cnt);
      const lab = el("text", { x: hx, y: hy + r + 15, fill: color, "font-size": "13", "font-weight": "800", "text-anchor": "middle", "pointer-events": "none" });
      lab.textContent = CAT_LABEL[cat] ?? cat;
      svg.appendChild(lab);
    });

    // People on the outer ring — RED connection lines to the notes mentioning them.
    people.forEach((person, i) => {
      const ang = (-90 + (i * 360) / people.length) * Math.PI / 180;
      const px = cx + R2 * Math.cos(ang), py = cy + R2 * Math.sin(ang);
      const mine = noteDots.filter((d) => d.people.includes(person));
      for (const d of mine) svg.appendChild(el("line", { x1: px, y1: py, x2: d.x, y2: d.y, stroke: "#ff4d4d", "stroke-width": "1.4", "stroke-dasharray": "4 3", opacity: "0.8" }));
      const node = el("circle", { cx: px, cy: py, r: 16, fill: "#0f172a", stroke: "#ff8da3", "stroke-width": "2", cursor: "pointer" });
      node.addEventListener("click", () => {
        const evs = events.filter((e) => this._peopleIn(`${e.text || ""} ${e.title || ""}`).includes(person));
        this._showList(`👤 ${person}`, evs, "#ff8da3");
      });
      svg.appendChild(node);
      const t = el("text", { x: px, y: py + 5, fill: "#fbcfe8", "font-size": "11", "font-weight": "800", "text-anchor": "middle", "pointer-events": "none" });
      t.textContent = person.slice(0, 6);
      svg.appendChild(t);
    });
  }

  _showList(title, items, color) {
    if (!this._list) return;
    this._list.replaceChildren();
    const h = document.createElement("div");
    h.innerHTML = `<b style="color:${color}">${title}</b> · ${items.length}`;
    h.style.cssText = "font:800 13px system-ui;margin-bottom:6px";
    this._list.appendChild(h);
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
    for (const ev of sorted.slice(0, 40)) {
      const row = document.createElement("div");
      row.style.cssText = `padding:6px 9px;margin-bottom:4px;border-left:3px solid ${color};background:rgba(255,255,255,0.04);border-radius:6px`;
      const when = `${ev.date || ""}${ev.time ? " · " + ev.time : ""}`;
      row.innerHTML = `<span style="color:#94a3b8;font-size:11px">${when}</span><br>${(ev.text || ev.title || "Note").replace(/</g, "&lt;")}`;
      this._list.appendChild(row);
    }
  }

  show(opts = {}) { this._build(); this._render(); this._root.style.display = "flex"; this._onClose = opts.onClose || null; }
  hide(opts = {}) {
    if (this._root) this._root.style.display = "none";
    const cb = this._onClose;
    this._onClose = null;
    if (!opts.silent) cb?.();
  }
  toggle() { this._build(); (this._root.style.display === "none" || !this._root.style.display) ? this.show() : this.hide(); }
}
