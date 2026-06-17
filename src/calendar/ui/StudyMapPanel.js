/**
 * StudyMapPanel — a slide-in surface for universal study maps. Name any topic,
 * Haiku builds the hierarchy (Topic → branches → leaves), and you tap each leaf
 * to cycle its mastery (Not yet → Learning → Confident → Mastered). The not-yet
 * leaves are your study nudges.
 */
import { loadStudyMaps, getStudyMap, generateStudyMap, deleteStudyMap, cycleMastery, mapProgress, MASTERY, MASTERY_COLOR } from "../../inkling/study/studyMapModel.js";
import { findSetFor, generateFlashcards } from "../../inkling/study/flashcardsModel.js";

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export class StudyMapPanel {
  constructor() { this._panel = null; this._body = null; this._openId = null; }

  _build() {
    if (this._panel) return;
    const panel = document.createElement("div");
    panel.id = "inkling-study-panel";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(440px,95vw);z-index:11087;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.98);backdrop-filter:blur(12px);" +
      "border-left:1px solid rgba(88,166,255,0.45);color:#e6edf3;font:600 12px system-ui;" +
      "box-shadow:-14px 0 44px rgba(0,0,0,0.55)";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 15px 11px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const title = document.createElement("div");
    title.innerHTML = "📚 Study Maps <span style='font:600 11px system-ui;color:#8b949e'>· know it or look it up</span>";
    title.style.cssText = "font:800 17px system-ui;color:#9ecbff";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:#1e293b;color:#e6edf3;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px";
    close.addEventListener("click", () => this.hide());
    head.append(title, close);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:13px 15px";

    panel.append(head, body);
    document.body.appendChild(panel);
    this._panel = panel; this._body = body;
  }

  _renderList() {
    this._openId = null;
    const maps = loadStudyMaps();
    this._body.innerHTML = "";

    // New-map row
    const gen = document.createElement("div");
    gen.style.cssText = "display:flex;gap:7px;margin-bottom:14px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Study anything — e.g. OpenStax Precalculus, writing fantasy…";
    input.style.cssText = "flex:1;min-width:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;color:#e6edf3;font:600 12px system-ui;outline:none";
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doGen(); });
    const btn = document.createElement("button");
    btn.textContent = "Build";
    btn.style.cssText = "flex:0 0 auto;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 15px;font:800 12px system-ui;cursor:pointer";
    const doGen = async () => {
      const topic = input.value.trim();
      if (!topic) return;
      btn.textContent = "Building…"; btn.disabled = true; input.disabled = true;
      const r = await generateStudyMap(topic);
      if (r.ok) { this._renderMap(r.map.id); return; }
      btn.textContent = "Build"; btn.disabled = false; input.disabled = false;
      const msg = { signin: "Sign in to build study maps.", capped: "Daily study-map limit reached — try tomorrow.", offline: "Couldn't reach the server. Try again.", empty: "Couldn't build that one — try a more specific topic." }[r.reason] || "Couldn't build that.";
      note.textContent = msg; note.style.display = "block";
    };
    btn.addEventListener("click", doGen);
    gen.append(input, btn);
    this._body.appendChild(gen);

    const note = document.createElement("div");
    note.style.cssText = "display:none;color:#fca5a5;font-size:12px;margin:-8px 0 12px";
    this._body.appendChild(note);

    if (!maps.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#8b949e;line-height:1.6;font-size:13px";
      empty.innerHTML = "No study maps yet.<br><span style='opacity:.8'>Name a subject above and Inkling breaks it into branches and checkable terms you can mark as you learn.</span>";
      this._body.appendChild(empty);
      return;
    }
    for (const m of maps) {
      const p = mapProgress(m);
      const card = document.createElement("button");
      card.type = "button";
      card.style.cssText = "display:block;width:100%;text-align:left;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:11px;padding:12px 13px;margin-bottom:10px;cursor:pointer;color:#e6edf3";
      card.innerHTML =
        `<div style="font:800 15px system-ui">${esc(m.topic)}</div>` +
        `<div style="height:6px;border-radius:99px;background:rgba(255,255,255,0.1);margin:8px 0 5px;overflow:hidden"><div style="height:100%;width:${p.pct}%;background:#39d98a"></div></div>` +
        `<div style="font-size:11px;color:#8b949e">${m.branches.length} sections · ${p.total} terms · ${p.pct}% mastered</div>`;
      card.addEventListener("click", () => this._renderMap(m.id));
      this._body.appendChild(card);
    }
  }

  _renderMap(id) {
    const map = getStudyMap(id);
    if (!map) return this._renderList();
    this._openId = id;
    this._body.innerHTML = "";

    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px";
    const back = document.createElement("button");
    back.textContent = "‹ All maps";
    back.style.cssText = "background:transparent;color:#9ecbff;border:0;font:700 12px system-ui;cursor:pointer;padding:0";
    back.addEventListener("click", () => this._renderList());
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.style.cssText = "background:transparent;color:#64748b;border:0;font:600 11px system-ui;cursor:pointer";
    del.addEventListener("click", () => { if (confirm(`Delete the "${map.topic}" study map?`)) { deleteStudyMap(id); this._renderList(); } });
    top.append(back, del);
    this._body.appendChild(top);

    const p = mapProgress(map);
    const h = document.createElement("div");
    h.innerHTML = `<div style="font:800 18px system-ui;color:#e6edf3">${esc(map.topic)}</div>` +
      `<div style="font-size:11px;color:#8b949e;margin:3px 0 4px">${p.pct}% mastered · tap a term to update</div>`;
    this._body.appendChild(h);

    // Legend
    const legend = document.createElement("div");
    legend.style.cssText = "display:flex;gap:12px;margin:6px 0 12px;font-size:10px;color:#8b949e;flex-wrap:wrap";
    legend.innerHTML = MASTERY.map((m2, i) => `<span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MASTERY_COLOR[i]};margin-right:4px"></i>${m2}</span>`).join("");
    this._body.appendChild(legend);

    for (const br of map.branches) {
      const sec = document.createElement("div");
      sec.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0 7px";
      const lab = document.createElement("div");
      lab.style.cssText = "font:800 12px system-ui;color:#cbd5e1";
      lab.textContent = br.label;
      const cards = document.createElement("button");
      cards.type = "button";
      cards.textContent = findSetFor(map.id, br.id) ? "📇 Cards" : "📇 Make cards";
      cards.style.cssText = "flex:0 0 auto;background:rgba(240,171,252,0.12);color:#f0abfc;border:1px solid rgba(240,171,252,0.4);border-radius:999px;padding:4px 10px;font:700 11px system-ui;cursor:pointer";
      cards.addEventListener("click", async () => {
        const existing = findSetFor(map.id, br.id);
        if (existing) { document.dispatchEvent(new CustomEvent("inkling:open-flashcards", { detail: { setId: existing.id } })); return; }
        cards.textContent = "Making…"; cards.disabled = true;
        const r = await generateFlashcards({
          topic: map.topic, section: br.label,
          terms: br.leaves.map((l) => l.label), mapId: map.id, branchId: br.id
        });
        cards.disabled = false;
        if (r.ok) { document.dispatchEvent(new CustomEvent("inkling:open-flashcards", { detail: { setId: r.set.id } })); }
        else { cards.textContent = r.reason === "signin" ? "Sign in" : r.reason === "capped" ? "Limit hit" : "Retry"; setTimeout(() => { cards.textContent = "📇 Make cards"; }, 2000); }
      });
      sec.append(lab, cards);
      this._body.appendChild(sec);
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:7px";
      for (const leaf of br.leaves) {
        const chip = document.createElement("button");
        chip.type = "button";
        const paint = () => {
          const c = MASTERY_COLOR[leaf.mastery || 0];
          chip.style.cssText = `background:${c}22;border:1px solid ${c};color:#e6edf3;border-radius:999px;padding:6px 11px;font:600 12px system-ui;cursor:pointer`;
          chip.title = MASTERY[leaf.mastery || 0];
        };
        chip.textContent = leaf.label;
        paint();
        chip.addEventListener("click", () => { cycleMastery(id, leaf.id); leaf.mastery = ((leaf.mastery || 0) + 1) % 4; paint(); this._refreshHeader(map, h); });
        wrap.appendChild(chip);
      }
      this._body.appendChild(wrap);
    }
  }

  _refreshHeader(map, h) {
    const fresh = getStudyMap(map.id) || map;
    const p = mapProgress(fresh);
    h.querySelector("div:last-child").textContent = `${p.pct}% mastered · tap a term to update`;
  }

  show() { this._build(); this._panel.style.display = "flex"; if (this._openId) this._renderMap(this._openId); else this._renderList(); }
  hide() { if (this._panel) this._panel.style.display = "none"; }
  toggle() { this._build(); (this._panel.style.display === "none" || !this._panel.style.display) ? this.show() : this.hide(); }
}
