/**
 * GoalsPanel — a slide-in surface to capture + review goals. Stored via goalsModel
 * so Inkling can later draw comparative links between goals and logged activity.
 */
import { loadGoals, addGoal, setGoalStatus, removeGoal } from "../goals/goalsModel.js";
import { getCategoryColor } from "../../wordweaver/timelineModel.js";

const CATS = [
  ["health", "Health"], ["work", "Work"], ["study", "Study"],
  ["personal", "Personal"], ["creative", "Creative"], ["finance", "Finance"]
];

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class GoalsPanel {
  constructor() {
    this._panel = null;
    this._body = null;
  }

  _build() {
    if (this._panel) return;
    const panel = document.createElement("div");
    panel.id = "inkling-goals-panel";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);z-index:11085;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.97);backdrop-filter:blur(12px);" +
      "border-left:1px solid rgba(52,211,153,0.45);color:#e2e8f0;font:600 12px system-ui;" +
      "box-shadow:-14px 0 44px rgba(0,0,0,0.55)";

    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 15px 11px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const title = document.createElement("div");
    title.textContent = "🎯 Goals";
    title.style.cssText = "font:800 17px system-ui;letter-spacing:.3px;color:#a7f3d0";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px";
    close.addEventListener("click", () => this.hide());
    head.append(title, close);

    // Add-a-goal row.
    const addWrap = document.createElement("div");
    addWrap.style.cssText = "display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08)";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "What do you want to work toward?";
    input.style.cssText =
      "width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);" +
      "border-radius:8px;padding:9px 11px;color:#e2e8f0;font:600 13px system-ui;outline:none";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:center";
    const catSel = document.createElement("select");
    catSel.style.cssText = "flex:1;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:7px 8px;font:600 12px system-ui";
    for (const [v, l] of CATS) { const o = document.createElement("option"); o.value = v; o.textContent = l; catSel.appendChild(o); }
    const horizonSel = document.createElement("select");
    horizonSel.style.cssText = catSel.style.cssText;
    for (const [v, l] of [["short", "Short-term"], ["long", "Long-term"]]) { const o = document.createElement("option"); o.value = v; o.textContent = l; horizonSel.appendChild(o); }
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add";
    addBtn.style.cssText = "flex:0 0 auto;background:#059669;color:#fff;border:0;border-radius:8px;padding:7px 14px;font:800 12px system-ui;cursor:pointer";
    const doAdd = () => {
      const text = input.value.trim();
      if (!text) return;
      addGoal({ text, category: catSel.value, horizon: horizonSel.value });
      input.value = "";
      this._render();
      input.focus();
    };
    addBtn.addEventListener("click", doAdd);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doAdd(); });
    row.append(catSel, horizonSel, addBtn);
    addWrap.append(input, row);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:12px 14px";

    panel.append(head, addWrap, body);
    document.body.appendChild(panel);
    this._panel = panel;
    this._body = body;
  }

  _render() {
    if (!this._body) return;
    const goals = loadGoals();
    this._body.textContent = "";
    if (!goals.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#94a3b8;font-size:13px;padding:8px 2px;line-height:1.5";
      empty.innerHTML = "No goals yet.<br><span style='opacity:.7'>Add one above — Inkling will start linking your daily notes to it.</span>";
      this._body.appendChild(empty);
      return;
    }
    const active = goals.filter((g) => g.status === "active");
    const achieved = goals.filter((g) => g.status === "achieved");
    const section = (label, color) => {
      const h = document.createElement("div");
      h.textContent = label;
      h.style.cssText = `font:800 11px system-ui;letter-spacing:.5px;text-transform:uppercase;color:${color};margin:10px 2px 7px`;
      return h;
    };
    if (active.length) {
      this._body.appendChild(section(`Active · ${active.length}`, "#a7f3d0"));
      for (const g of active) this._body.appendChild(this._row(g, false));
    }
    if (achieved.length) {
      this._body.appendChild(section("Achieved", "#64748b"));
      for (const g of achieved) this._body.appendChild(this._row(g, true));
    }
  }

  _row(g, done) {
    const color = getCategoryColor(g.category) || "#94a3b8";
    const row = document.createElement("div");
    row.style.cssText =
      `display:flex;align-items:flex-start;gap:9px;padding:9px 10px;margin-bottom:7px;border-radius:9px;` +
      `border-left:4px solid ${color};background:rgba(255,255,255,${done ? "0.03" : "0.05"})` + (done ? ";opacity:.7" : "");
    const check = document.createElement("button");
    check.textContent = done ? "✓" : "○";
    check.title = done ? "Mark active" : "Mark achieved";
    check.style.cssText = `flex:0 0 auto;background:${done ? "#16a34a" : "#1e293b"};color:#fff;border:0;border-radius:7px;width:28px;height:28px;cursor:pointer;font:800 14px system-ui`;
    check.addEventListener("click", () => { setGoalStatus(g.id, done ? "active" : "achieved"); this._render(); });
    const mid = document.createElement("div");
    mid.style.cssText = "flex:1;min-width:0";
    mid.innerHTML =
      `<div style="font:700 13px system-ui;color:#f1f5f9;${done ? "text-decoration:line-through" : ""};white-space:normal;word-break:break-word">${esc(g.text)}</div>` +
      `<div style="font-size:11px;color:${color};margin-top:3px;font-weight:700">${esc(g.category)} · ${g.horizon === "long" ? "long-term" : "short-term"}</div>`;
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Delete goal";
    del.style.cssText = "flex:0 0 auto;background:transparent;color:#64748b;border:0;cursor:pointer;font:800 13px system-ui";
    del.addEventListener("click", () => { removeGoal(g.id); this._render(); });
    row.append(check, mid, del);
    return row;
  }

  show(opts = {}) {
    this._build();
    this._render();
    this._panel.style.display = "flex";
    this._onClose = opts.onClose || null;
  }

  hide(opts = {}) {
    if (this._panel) this._panel.style.display = "none";
    const cb = this._onClose;
    this._onClose = null;
    if (!opts.silent) cb?.();
  }

  toggle() {
    this._build();
    if (this._panel.style.display === "none" || !this._panel.style.display) this.show();
    else this.hide();
  }
}
