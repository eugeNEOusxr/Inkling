/**
 * FlashcardsPanel — its own little app: decks of Q&A cards (Haiku-generated per
 * topic/section). Tap a card to flip; mark "Got it" or "Review". Decks can be
 * made standalone here or jumped to from a Study Map section.
 */
import { loadFlashcardSets, getFlashcardSet, generateFlashcards, deleteFlashcardSet, setCardStatus, setProgress } from "../../inkling/study/flashcardsModel.js";

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export class FlashcardsPanel {
  constructor() { this._panel = null; this._body = null; this._openId = null; }

  _build() {
    if (this._panel) return;
    const panel = document.createElement("div");
    panel.id = "inkling-flashcards-panel";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(440px,95vw);z-index:11088;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.98);backdrop-filter:blur(12px);" +
      "border-left:1px solid rgba(240,171,252,0.45);color:#e6edf3;font:600 12px system-ui;" +
      "box-shadow:-14px 0 44px rgba(0,0,0,0.55)";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 15px 11px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const title = document.createElement("div");
    title.innerHTML = "📇 Flashcards <span style='font:600 11px system-ui;color:#8b949e'>· test yourself</span>";
    title.style.cssText = "font:800 17px system-ui;color:#f0abfc";
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
    this._body.innerHTML = "";
    const gen = document.createElement("div");
    gen.style.cssText = "display:flex;gap:7px;margin-bottom:14px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Make cards for… e.g. Domain and Range";
    input.style.cssText = "flex:1;min-width:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;color:#e6edf3;font:600 12px system-ui;outline:none";
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doGen(); });
    const btn = document.createElement("button");
    btn.textContent = "Make";
    btn.style.cssText = "flex:0 0 auto;background:#a21caf;color:#fff;border:0;border-radius:8px;padding:9px 15px;font:800 12px system-ui;cursor:pointer";
    const note = document.createElement("div");
    note.style.cssText = "display:none;color:#fca5a5;font-size:12px;margin:-8px 0 12px";
    const doGen = async () => {
      const topic = input.value.trim();
      if (!topic) return;
      btn.textContent = "Making…"; btn.disabled = true; input.disabled = true;
      const r = await generateFlashcards({ topic });
      if (r.ok) return this._renderSet(r.set.id);
      btn.textContent = "Make"; btn.disabled = false; input.disabled = false;
      note.textContent = { signin: "Sign in to make flashcards.", capped: "Daily flashcard limit reached.", offline: "Couldn't reach the server.", empty: "Couldn't make cards — try a clearer topic." }[r.reason] || "Couldn't make cards.";
      note.style.display = "block";
    };
    btn.addEventListener("click", doGen);
    gen.append(input, btn);
    this._body.append(gen, note);

    const sets = loadFlashcardSets();
    if (!sets.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#8b949e;line-height:1.6;font-size:13px";
      empty.innerHTML = "No decks yet.<br><span style='opacity:.8'>Make one above, or open a Study Map section and tap “📇 Cards”.</span>";
      this._body.appendChild(empty);
      return;
    }
    for (const s of sets) {
      const p = setProgress(s);
      const card = document.createElement("button");
      card.type = "button";
      card.style.cssText = "display:block;width:100%;text-align:left;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:11px;padding:12px 13px;margin-bottom:10px;cursor:pointer;color:#e6edf3";
      card.innerHTML =
        `<div style="font:800 14px system-ui">${esc(s.section || s.topic)}</div>` +
        (s.section ? `<div style="font-size:11px;color:#8b949e">${esc(s.topic)}</div>` : "") +
        `<div style="height:6px;border-radius:99px;background:rgba(255,255,255,0.1);margin:8px 0 5px;overflow:hidden"><div style="height:100%;width:${p.pct}%;background:#f0abfc"></div></div>` +
        `<div style="font-size:11px;color:#8b949e">${p.known}/${p.total} known</div>`;
      card.addEventListener("click", () => this._renderSet(s.id));
      this._body.appendChild(card);
    }
  }

  _renderSet(id) {
    const set = getFlashcardSet(id);
    if (!set) return this._renderList();
    this._openId = id;
    this._idx = 0; this._flipped = false;
    this._body.innerHTML = "";

    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px";
    const back = document.createElement("button");
    back.textContent = "‹ All decks";
    back.style.cssText = "background:transparent;color:#f0abfc;border:0;font:700 12px system-ui;cursor:pointer;padding:0";
    back.addEventListener("click", () => this._renderList());
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.style.cssText = "background:transparent;color:#64748b;border:0;font:600 11px system-ui;cursor:pointer";
    del.addEventListener("click", () => { if (confirm("Delete this deck?")) { deleteFlashcardSet(id); this._renderList(); } });
    top.append(back, del);
    this._body.appendChild(top);

    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font:800 16px system-ui;margin-bottom:2px";
    titleEl.textContent = set.section || set.topic;
    this._body.appendChild(titleEl);

    this._counter = document.createElement("div");
    this._counter.style.cssText = "font-size:11px;color:#8b949e;margin-bottom:12px";
    this._body.appendChild(this._counter);

    this._cardEl = document.createElement("button");
    this._cardEl.type = "button";
    this._cardEl.style.cssText = "display:flex;align-items:center;justify-content:center;text-align:center;width:100%;min-height:180px;padding:22px 18px;border-radius:14px;border:1px solid rgba(240,171,252,0.4);background:rgba(240,171,252,0.07);color:#e6edf3;font:600 16px system-ui;line-height:1.5;cursor:pointer";
    this._cardEl.addEventListener("click", () => { this._flipped = !this._flipped; this._paintCard(); });
    this._body.appendChild(this._cardEl);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:9px;margin-top:14px";
    const again = document.createElement("button");
    again.textContent = "↻ Review";
    again.style.cssText = "flex:1;background:#3a2230;color:#fda4af;border:1px solid #be185d;border-radius:10px;padding:11px;font:800 13px system-ui;cursor:pointer";
    again.addEventListener("click", () => this._grade(1));
    const got = document.createElement("button");
    got.textContent = "✓ Got it";
    got.style.cssText = "flex:1;background:#16351f;color:#86efac;border:1px solid #15803d;border-radius:10px;padding:11px;font:800 13px system-ui;cursor:pointer";
    got.addEventListener("click", () => this._grade(2));
    actions.append(again, got);
    this._body.appendChild(actions);

    const hint = document.createElement("div");
    hint.style.cssText = "text-align:center;color:#8b949e;font-size:11px;margin-top:10px";
    hint.textContent = "Tap the card to flip";
    this._body.appendChild(hint);

    this._paintCard();
  }

  _paintCard() {
    const set = getFlashcardSet(this._openId);
    if (!set || !set.cards.length) return;
    if (this._idx >= set.cards.length) {
      const p = setProgress(set);
      this._cardEl.textContent = `Deck complete — ${p.known}/${p.total} known. Tap a card to review again.`;
      this._counter.textContent = "Done";
      this._idx = 0; this._flipped = false;
      return;
    }
    const card = set.cards[this._idx];
    const kind = card.type === "problem" ? " · 🧮 Problem" : " · 💡 Concept";
    this._counter.textContent = `Card ${this._idx + 1} of ${set.cards.length}${kind}`;
    this._cardEl.textContent = this._flipped ? card.a : card.q;
    this._cardEl.style.background = this._flipped ? "rgba(57,217,138,0.08)" : "rgba(240,171,252,0.07)";
  }

  _grade(status) {
    const set = getFlashcardSet(this._openId);
    if (!set) return;
    const card = set.cards[this._idx];
    if (card) setCardStatus(this._openId, card.id, status);
    this._idx += 1; this._flipped = false;
    this._paintCard();
  }

  show(setId) { this._build(); this._panel.style.display = "flex"; if (setId) this._renderSet(setId); else if (this._openId) this._renderSet(this._openId); else this._renderList(); }
  hide() { if (this._panel) this._panel.style.display = "none"; }
  toggle() { this._build(); (this._panel.style.display === "none" || !this._panel.style.display) ? this.show() : this.hide(); }
}
