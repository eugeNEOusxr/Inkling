/**
 * In-scene editor for the 3D day view: a bottom add-bar (text + a full-screen
 * time wheel + an Add button) for dropping new notes onto the focused day, and
 * tap-a-note-to-delete (a floating ✕ over the tapped card).
 *
 * Data goes through the timeline model — saveNoteToTimeline() auto-classifies the
 * note by its text ("save by context") and auto-attaches an alert; deleteEvent()
 * removes it. After either, the host re-enters the day view so the change shows.
 *
 * The host (WordWeaverScene) provides: camera, canvas, _raycaster, _dayView
 * (with .items = [{ mesh, event }]), _dayIso, and enterDayViewIso(iso).
 */
import * as THREE from "three";
import { saveNoteToTimeline, deleteEvent } from "./timelineModel.js";

const STEP_MIN = 30; // time wheel granularity → 12:00 AM … 11:30 PM

function injectStyles() {
  if (document.getElementById("ww3d-editor-styles")) return;
  const s = document.createElement("style");
  s.id = "ww3d-editor-styles";
  s.textContent = `
    .ww3d-addbar {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(158px + env(safe-area-inset-bottom, 0px));
      z-index: 9000; display: flex; align-items: center; gap: 8px;
      width: min(560px, calc(100vw - 24px));
      padding: 8px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(20,28,42,0.92), rgba(10,14,24,0.96));
      border: 1px solid rgba(78,230,230,0.30);
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
    }
    .ww3d-addbar.hidden { display: none !important; }
    .ww3d-time {
      flex: 0 0 auto; min-width: 92px; height: 40px; padding: 0 12px;
      border-radius: 11px; border: 1px solid rgba(125,211,252,0.4);
      background: rgba(14,116,144,0.35); color: #e0fbff; font: 600 13px system-ui;
      cursor: pointer; white-space: nowrap;
    }
    .ww3d-text {
      flex: 1 1 auto; min-width: 0; height: 40px; padding: 0 12px;
      border-radius: 11px; border: 1px solid rgba(148,163,184,0.35);
      background: rgba(8,12,22,0.85); color: #f1f5f9; font: 500 14px system-ui;
    }
    .ww3d-text::placeholder { color: #7e93b0; }
    .ww3d-add {
      flex: 0 0 auto; width: 44px; height: 40px; border-radius: 11px; border: 0;
      background: linear-gradient(180deg, #22d3ee, #0891b2); color: #042027;
      font: 800 22px system-ui; cursor: pointer; line-height: 1;
      transition: transform .12s ease, background .25s ease;
    }
    .ww3d-add:active { transform: scale(0.92); }
    .ww3d-add.ok { background: linear-gradient(180deg, #34d399, #059669); }

    .ww3d-timewheel {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: calc(222px + env(safe-area-inset-bottom, 0px));
      z-index: 10600;
      width: min(560px, calc(100vw - 24px)); max-height: 50vh;
      display: flex; flex-direction: column; overflow: hidden;
      background: linear-gradient(180deg, rgba(20,28,42,0.97), rgba(10,14,24,0.98));
      border: 1px solid rgba(78,230,230,0.30); border-radius: 16px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.6); backdrop-filter: blur(10px);
    }
    .ww3d-timewheel.hidden { display: none !important; }
    .ww3d-wheel-head {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 18px calc(10px); color: #e2e8f0; font: 800 18px system-ui;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .ww3d-wheel-head span { flex: 1 1 auto; }
    .ww3d-wheel-now, .ww3d-wheel-close {
      flex: 0 0 auto; height: 36px; padding: 0 14px; border-radius: 10px;
      border: 1px solid rgba(78,230,230,0.4); background: rgba(14,116,144,0.3);
      color: #e0fbff; font: 700 13px system-ui; cursor: pointer;
    }
    .ww3d-wheel-close { width: 38px; padding: 0; }
    .ww3d-wheel-list {
      flex: 1 1 auto; overflow-y: auto; padding: 10px 12px 14px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px;
      align-content: start;
    }
    .ww3d-wheel-item {
      height: 48px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(20,28,42,0.7); color: #cbd5e1; font: 700 15px system-ui; cursor: pointer;
    }
    .ww3d-wheel-item.is-active {
      border-color: rgba(34,211,238,0.8); background: rgba(34,211,238,0.18); color: #e0fffe;
      box-shadow: 0 0 14px rgba(34,211,238,0.25);
    }

    .ww3d-del {
      position: fixed; z-index: 9001; width: 34px; height: 34px; border-radius: 50%;
      border: 2px solid #fff; background: #ef4444; color: #fff;
      font: 800 16px system-ui; line-height: 1; cursor: pointer; padding: 0;
      transform: translate(-50%, -50%); box-shadow: 0 4px 16px rgba(0,0,0,0.55);
    }
    .ww3d-del.hidden { display: none !important; }
  `;
  document.head.appendChild(s);
}

export class WordWeaver3DEditor {
  /** @param {any} host WordWeaverScene */
  constructor(host) {
    this.host = host;
    this._dayIso = null;
    this._time = null; // "HH:MM" chosen, or null → automatic "now" timestamp
    this._selectedId = null;
    this._tmpVec = new THREE.Vector3();
    this._build();
  }

  _build() {
    injectStyles();

    const bar = document.createElement("div");
    bar.id = "ww3d-addbar";
    bar.className = "ww3d-addbar hidden";
    bar.innerHTML = `
      <button class="ww3d-time" type="button" title="Pick a time">🕐 Now</button>
      <input class="ww3d-text" type="text" placeholder="Add a note to this day…" maxlength="240" />
      <button class="ww3d-add" type="button" aria-label="Add note">＋</button>`;
    document.body.appendChild(bar);
    this.bar = bar;
    this.timeBtn = bar.querySelector(".ww3d-time");
    this.textInput = bar.querySelector(".ww3d-text");
    this.addBtn = bar.querySelector(".ww3d-add");
    this.timeBtn.addEventListener("click", () => this._openWheel());
    this.addBtn.addEventListener("click", () => this._commitAdd());
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this._commitAdd(); }
    });

    const wheel = document.createElement("div");
    wheel.id = "ww3d-timewheel";
    wheel.className = "ww3d-timewheel hidden";
    wheel.innerHTML = `
      <div class="ww3d-wheel-head">
        <span>Pick a time</span>
        <button class="ww3d-wheel-now" type="button">Now</button>
        <button class="ww3d-wheel-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ww3d-wheel-list"></div>`;
    document.body.appendChild(wheel);
    this.wheel = wheel;
    this.wheelList = wheel.querySelector(".ww3d-wheel-list");
    wheel.querySelector(".ww3d-wheel-close").addEventListener("click", () => this._closeWheel());
    wheel.querySelector(".ww3d-wheel-now").addEventListener("click", () => { this._setTime(null); this._closeWheel(); });
    this._fillWheel();

    const del = document.createElement("button");
    del.id = "ww3d-del";
    del.className = "ww3d-del hidden";
    del.type = "button";
    del.textContent = "✕";
    del.title = "Delete this note";
    del.addEventListener("click", (e) => { e.stopPropagation(); this._deleteSelected(); });
    document.body.appendChild(del);
    this.delBadge = del;
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
      b.className = "ww3d-wheel-item";
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
    const cur = this._time;
    let activeBtn = null;
    this.wheelList.querySelectorAll(".ww3d-wheel-item").forEach((b) => {
      const on = b.dataset.time === cur;
      b.classList.toggle("is-active", on);
      if (on) activeBtn = b;
    });
    if (activeBtn) activeBtn.scrollIntoView({ block: "center" });
  }

  _closeWheel() { this.wheel.classList.add("hidden"); }

  _nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  _commitAdd() {
    const text = (this.textInput.value || "").trim();
    if (!text) { this.textInput.focus(); return; }
    const date = this._dayIso || this.host?._dayIso;
    if (!date) return;
    const time = this._time || this._nowHHMM(); // automated timestamp when none chosen
    try {
      saveNoteToTimeline({ text, time, date }); // auto-classifies by text + attaches an alert
    } catch (err) {
      console.warn("[ww3d-editor] add failed", err);
      return;
    }
    this.textInput.value = "";
    this._setTime(null);
    this.addBtn.classList.add("ok");
    setTimeout(() => this.addBtn.classList.remove("ok"), 600);
    this._clearSelection();
    this.host?.enterDayViewIso?.(date); // rebuild so the note appears
  }

  // ---- tap-a-note-to-delete ----

  /** Called from the host's day-level pointerdown. @returns {boolean} hit a note */
  handleDayTap(event) {
    const item = this._pickNote(event);
    if (!item) { this._clearSelection(); return false; }
    this._selectedId = item.event?.id ?? null;
    if (this._selectedId == null) { this._clearSelection(); return false; }
    this._positionDelBadge(item.mesh);
    return true;
  }

  _pickNote(event) {
    const host = this.host;
    const dv = host?._dayView;
    if (!dv?.items?.length || !host?.camera || !host?.canvas) return null;
    const rect = host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = host._raycaster || new THREE.Raycaster();
    ray.setFromCamera(ndc, host.camera);
    const meshes = dv.items.map((it) => it.mesh).filter(Boolean);
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o) {
      const found = dv.items.find((it) => it.mesh === o);
      if (found) return found;
      o = o.parent;
    }
    return null;
  }

  _positionDelBadge(mesh) {
    const host = this.host;
    if (!mesh || !host?.camera || !host?.canvas) return;
    mesh.getWorldPosition(this._tmpVec);
    this._tmpVec.project(host.camera);
    const rect = host.canvas.getBoundingClientRect();
    const x = rect.left + (this._tmpVec.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-this._tmpVec.y * 0.5 + 0.5) * rect.height;
    this.delBadge.style.left = `${x}px`;
    this.delBadge.style.top = `${y - 26}px`;
    this.delBadge.classList.remove("hidden");
  }

  _deleteSelected() {
    const id = this._selectedId;
    if (id == null) return;
    try { deleteEvent(id); } catch (err) { console.warn("[ww3d-editor] delete failed", err); }
    this._clearSelection();
    const date = this._dayIso || this.host?._dayIso;
    if (date) this.host?.enterDayViewIso?.(date);
  }

  _clearSelection() {
    this._selectedId = null;
    this.delBadge?.classList.add("hidden");
  }

  /** Keep the ✕ badge stuck to its (gently bobbing) card. Cheap; call per frame. */
  tick() {
    if (this._selectedId == null) return;
    const item = this.host?._dayView?.items?.find((it) => it.event?.id === this._selectedId);
    if (item?.mesh) this._positionDelBadge(item.mesh);
    else this._clearSelection();
  }

  // ---- visibility ----

  /** Enter/refresh the add-bar for a focused day. */
  setDay(dayIso) {
    this._dayIso = dayIso;
    this._clearSelection();
    this.bar.classList.remove("hidden");
  }

  hide() {
    this._clearSelection();
    this._closeWheel();
    this.bar?.classList.add("hidden");
  }

  dispose() {
    this.bar?.remove();
    this.wheel?.remove();
    this.delBadge?.remove();
  }
}
