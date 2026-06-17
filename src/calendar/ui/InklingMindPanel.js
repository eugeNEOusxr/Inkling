/**
 * InklingMindPanel — a slide-in surface that shows what WordWeaver has learned:
 * the live on-device knowledge graph (concepts as nodes, connections as edges)
 * plus Inkling's plain-language read on it. Reads the real persisted graph via
 * the Mind store; grows as you chat. No network, no LLM key.
 */
import { mindGraph, mindInsights, syncSources } from "../../inkling/mind/index.js";

const STATE_COLOR = { open: "#f5a623", closed: "#39d98a", emergent: "#a06bff" };
const GOAL_COLOR = "#f0c64b";
const nodeColor = (n) => (n.type === "goal" ? GOAL_COLOR : (STATE_COLOR[n.state] || STATE_COLOR.open));
const shortLabel = (s) => (s && s.length > 18 ? s.slice(0, 17) + "…" : s || "");

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class InklingMindPanel {
  constructor() {
    this._panel = null;
    this._canvas = null;
    this._insights = null;
    this._running = false;
    this._pos = new Map();
    this._nodes = [];
    this._edges = [];
    // View transform for zoom/pan.
    this._scale = 1; this._ox = 0; this._oy = 0;
    this._pointers = new Map(); this._pinchBase = null;
    this._focusIds = new Set(); this._focusUntil = 0; this._focusLabels = null;
  }

  _build() {
    if (this._panel) return;
    const panel = document.createElement("div");
    panel.id = "inkling-mind-panel";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(420px,94vw);z-index:11086;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.97);backdrop-filter:blur(12px);" +
      "border-left:1px solid rgba(88,166,255,0.45);color:#e6edf3;font:600 12px system-ui;" +
      "box-shadow:-14px 0 44px rgba(0,0,0,0.55)";

    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 15px 11px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const title = document.createElement("div");
    title.innerHTML = "🧠 Mind <span style='font:600 11px system-ui;color:#8b949e'>· what Inkling is noticing</span>";
    title.style.cssText = "font:800 17px system-ui;letter-spacing:.3px;color:#9ecbff";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:#1e293b;color:#e6edf3;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px";
    close.addEventListener("click", () => this.hide());
    head.append(title, close);

    const canvasWrap = document.createElement("div");
    canvasWrap.style.cssText = "position:relative;height:280px;border-bottom:1px solid rgba(255,255,255,0.08);background:radial-gradient(circle at 50% 40%,rgba(88,166,255,0.06),transparent 70%)";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    canvasWrap.appendChild(canvas);

    const legend = document.createElement("div");
    legend.style.cssText = "display:flex;gap:13px;padding:8px 15px;border-bottom:1px solid rgba(255,255,255,0.08);color:#8b949e;font-size:11px";
    const dot = (c) => `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:5px"></i>`;
    legend.innerHTML =
      `<span>${dot(STATE_COLOR.closed)}Known</span>` +
      `<span>${dot(STATE_COLOR.open)}Forming</span>` +
      `<span>${dot(GOAL_COLOR)}Goal</span>` +
      `<span>${dot("#ff5c6c")}Tension</span>`;

    const insights = document.createElement("div");
    insights.style.cssText = "flex:1;overflow:auto;padding:13px 15px";

    panel.append(head, canvasWrap, legend, insights);
    document.body.appendChild(panel);
    this._panel = panel;
    this._canvas = canvas;
    this._insights = insights;
    this._bindGestures(canvas);
  }

  /** Wheel zoom, drag to pan, pinch to zoom, double-click to reset. */
  _bindGestures(canvas) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });
    canvas.addEventListener("dblclick", () => { this._scale = 1; this._ox = 0; this._oy = 0; });
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this._pinchBase = null;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const prev = this._pointers.get(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const pts = [...this._pointers.values()];
      if (pts.length >= 2) {
        const [a, b] = pts;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (this._pinchBase && this._pinchBase.dist > 0) this._zoomAt(mid.x, mid.y, dist / this._pinchBase.dist);
        this._pinchBase = { dist, mid };
      } else {
        this._ox += e.offsetX - prev.x;
        this._oy += e.offsetY - prev.y;
      }
    });
    const release = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchBase = null;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  /** Scale around a screen point (CSS px), keeping that point fixed. */
  _zoomAt(cx, cy, factor) {
    const s = Math.max(0.3, Math.min(4, this._scale * factor));
    const f = s / this._scale;
    this._ox = cx - (cx - this._ox) * f;
    this._oy = cy - (cy - this._oy) * f;
    this._scale = s;
  }

  _sizeCanvas() {
    const c = this._canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    this._W = r.width; this._H = r.height;
    c.width = this._W * dpr; c.height = this._H * dpr;
    c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async _render() {
    const [g, ins] = await Promise.all([mindGraph(), mindInsights()]);
    this._nodes = g.nodes;
    this._edges = g.edges;
    // seed positions for new nodes near center
    for (const n of this._nodes) {
      if (!this._pos.has(n.id)) {
        this._pos.set(n.id, { x: this._W / 2 + (Math.random() - 0.5) * 60, y: this._H / 2 + (Math.random() - 0.5) * 60, vx: 0, vy: 0 });
      }
    }
    // insights
    if (!this._nodes.length) {
      this._insights.innerHTML =
        "<div style='color:#8b949e;line-height:1.6;font-size:13px'>Your mind-map is empty.<br>" +
        "<span style='opacity:.8'>Chat with Inkling and it’ll start mapping the concepts you talk about — they’ll appear here and connect over time.</span></div>";
    } else {
      this._insights.innerHTML =
        "<div style='font:800 11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin:0 0 10px'>Inkling’s read</div>" +
        ins.lines.map((l) =>
          `<div style="background:#0d1117;border:1px solid #30363d;border-radius:9px;padding:9px 11px;margin-bottom:8px;font:600 13px system-ui;line-height:1.45">${esc(l)}</div>`
        ).join("") +
        `<div style="color:#8b949e;font-size:11px;margin:10px 0 4px">${this._nodes.length} concepts · ${this._edges.length} connections</div>`;
      this._renderClusterList();
    }
  }

  /** A clickable index of everything in the graph, grouped by cluster. */
  _renderClusterList() {
    const head = document.createElement("div");
    head.style.cssText = "font:800 11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8b949e;margin:14px 0 8px";
    head.textContent = "Everything in your Mind · tap to find it";
    this._insights.appendChild(head);

    const clusters = this._clusters();
    clusters.forEach((ids, i) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)";
      if (clusters.length > 1) {
        const tag = document.createElement("span");
        tag.textContent = `Cluster ${i + 1}`;
        tag.style.cssText = "font:700 10px system-ui;color:#6b7280;margin-right:2px";
        row.appendChild(tag);
      }
      const byImp = ids.map((id) => this._nodes.find((n) => n.id === id)).filter(Boolean)
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));
      for (const n of byImp) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = n.label;
        chip.style.cssText =
          `background:rgba(255,255,255,0.04);border:1px solid ${nodeColor(n)};color:#e6edf3;` +
          "border-radius:999px;padding:4px 10px;font:600 12px system-ui;cursor:pointer;max-width:100%;text-align:left";
        chip.addEventListener("click", () => this._focusNode(n.id));
        row.appendChild(chip);
      }
      this._insights.appendChild(row);
    });
  }

  /** Connected components (ignoring tension edges), biggest first. */
  _clusters() {
    const adj = new Map();
    this._nodes.forEach((n) => adj.set(n.id, []));
    for (const e of this._edges) {
      if (e.rel === "CONTRADICTS") continue;
      if (adj.has(e.from) && adj.has(e.to)) { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); }
    }
    const seen = new Set(); const comps = [];
    for (const n of this._nodes) {
      if (seen.has(n.id)) continue;
      const stack = [n.id]; const comp = []; seen.add(n.id);
      while (stack.length) {
        const id = stack.pop(); comp.push(id);
        for (const nb of adj.get(id) || []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
      comps.push(comp);
    }
    return comps.sort((a, b) => b.length - a.length);
  }

  /** Center + zoom the graph on a single node and pulse it (from the list). */
  _focusNode(id) {
    const p = this._pos.get(id);
    if (!p) return;
    this._scale = 1.7;
    this._ox = this._W / 2 - p.x * this._scale;
    this._oy = this._H / 2 - p.y * this._scale;
    this._focusIds = new Set([id]);
    this._focusUntil = Date.now() + 1800;
  }

  /**
   * Land on the concepts from a specific message: fit + ring them all. Resolves
   * by label (case-insensitive) so it works for both local and Haiku concepts.
   */
  _focusNodes(labels) {
    const want = new Set((labels || []).map((l) => String(l).toLowerCase()));
    const nodes = this._nodes.filter((n) => want.has(n.label.toLowerCase()));
    const pts = nodes.map((n) => this._pos.get(n.id)).filter(Boolean);
    if (!pts.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const bw = Math.max(60, maxX - minX), bh = Math.max(60, maxY - minY);
    const s = Math.max(0.8, Math.min(2.0, Math.min(this._W / (bw + 150), this._H / (bh + 150))));
    this._scale = s;
    this._ox = this._W / 2 - cx * s;
    this._oy = this._H / 2 - cy * s;
    this._focusIds = new Set(nodes.map((n) => n.id));
    this._focusUntil = Date.now() + 3500;
  }

  _tick() {
    if (!this._running) return;
    const nodes = this._nodes, edges = this._edges, pos = this._pos;
    const W = this._W, H = this._H;
    for (let i = 0; i < nodes.length; i++) {
      const pi = pos.get(nodes[i].id); if (!pi) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const pj = pos.get(nodes[j].id); if (!pj) continue;
        let dx = pi.x - pj.x, dy = pi.y - pj.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = 1400 / d2, d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        pi.vx += fx; pi.vy += fy; pj.vx -= fx; pj.vy -= fy;
      }
    }
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = e.rel === "CONTRADICTS" ? 130 : 56;
      const k = 0.0011 * (e.rel === "CONTRADICTS" ? 0.4 : 1 + (e.weight || 1) * 0.2);
      const f = (d - rest) * k, fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      const p = pos.get(n.id); if (!p) continue;
      p.vx += (W / 2 - p.x) * 0.002; p.vy += (H / 2 - p.y) * 0.002;
      p.vx *= 0.85; p.vy *= 0.85; p.x += p.vx; p.y += p.vy;
    }
    this._draw();
    requestAnimationFrame(() => this._tick());
  }

  _draw() {
    const ctx = this._canvas.getContext("2d");
    const pos = this._pos;
    ctx.clearRect(0, 0, this._W, this._H);
    ctx.save();
    ctx.translate(this._ox, this._oy);
    ctx.scale(this._scale, this._scale);
    for (const e of this._edges) {
      const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) continue;
      if (e.rel === "CONTRADICTS") { ctx.strokeStyle = "#ff5c6c"; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); }
      else { ctx.strokeStyle = `rgba(139,148,158,${Math.min(0.6, 0.14 + (e.weight || 1) * 0.1)})`; ctx.lineWidth = Math.min(3, 0.6 + (e.weight || 1) * 0.4); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    const now = Date.now();
    for (const n of this._nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const rad = 5 + (n.importance || 0) * 14;
      // Focus ring(s): a list click, or the concepts from a message you pressed View on.
      if (this._focusIds?.has(n.id) && now < (this._focusUntil || 0)) {
        ctx.beginPath(); ctx.arc(p.x, p.y, rad + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#9ecbff"; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(n); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.stroke();
      if (n.type === "goal" || (n.importance || 0) > 0.34 || rad > 11) {
        ctx.fillStyle = "#e6edf3"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
        ctx.fillText(shortLabel(n.label), p.x, p.y - rad - 3);
      }
    }
    ctx.restore();
  }

  async show(opts = {}) {
    this._build();
    this._panel.style.display = "flex";
    this._onClose = opts.onClose || null;
    this._scale = 1; this._ox = 0; this._oy = 0; // reset zoom/pan each open
    this._focusIds = new Set(); this._focusUntil = 0;
    this._focusLabels = Array.isArray(opts.focus) ? opts.focus.filter(Boolean) : null;
    this._sizeCanvas();
    try { await syncSources(); } catch { /* ignore */ } // pull calendar notes + goals in
    await this._render();
    if (!this._running) { this._running = true; this._tick(); }
    // Let the force layout settle a beat, then land on the message's concepts.
    if (this._focusLabels?.length) {
      setTimeout(() => { if (this.isOpen()) this._focusNodes(this._focusLabels); }, 950);
    }
  }

  isOpen() {
    return !!this._panel && this._panel.style.display !== "none" && this._panel.style.display !== "";
  }

  hide(opts = {}) {
    this._running = false;
    if (this._panel) this._panel.style.display = "none";
    const cb = this._onClose; this._onClose = null;
    if (!opts.silent) cb?.();
  }

  toggle() {
    this._build();
    if (this._panel.style.display === "none" || !this._panel.style.display) this.show();
    else this.hide();
  }
}
