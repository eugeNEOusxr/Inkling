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
import { deleteEvent } from "./timelineModel.js";
import { NoteAddBar } from "./NoteAddBar.js";

const OFFSETS_KEY = "ww3d-note-offsets"; // per-event {x,y,z} nudges from the gizmo

function injectStyles() {
  if (document.getElementById("ww3d-editor-styles")) return;
  const s = document.createElement("style");
  s.id = "ww3d-editor-styles";
  // Floating ✕ that deletes the tapped note. Above the surfaces, below Inkling.
  s.textContent = `
    .ww3d-del {
      position: fixed; z-index: 11205; width: 34px; height: 34px; border-radius: 50%;
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
    this._selectedId = null;
    this._tmpVec = new THREE.Vector3();
    this._gizmo = null;       // TransformControls (X/Y/Z move arrows), lazy
    this._selCard = null;     // the card group the gizmo is attached to
    this._offsets = this._loadOffsets(); // per-event nudges, survive rebuilds
    this._saveTimer = null;
    this._build();
  }

  _build() {
    injectStyles();

    // Shared add-note bar (text + time wheel). On add, rebuild the day so the
    // new note appears.
    this._addBar = new NoteAddBar({
      onAdded: (date) => { this._clearSelection(); this.host?.enterDayViewIso?.(date); }
    });

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

  // ---- tap-a-note-to-delete ----

  /**
   * Called from the host's day-level pointerdown. Tapping a note selects it
   * (✕ to delete + X/Y/Z arrows to move); tapping the SAME note again clears it.
   * Empty taps do nothing — clearing there would fight the gizmo handles.
   * @returns {boolean} hit a note (host only swallows the event when true)
   */
  handleDayTap(event) {
    // Don't steal pointerdowns aimed at the move gizmo.
    if (this._gizmo && (this._gizmo.dragging || this._gizmo.axis)) return false;
    const item = this._pickNote(event);
    if (!item) return false;
    const id = item.event?.id ?? null;
    if (id == null) return false;
    if (id === this._selectedId) { this._clearSelection(); return true; }

    this._selectedId = id;
    this._selCard = item.mesh.parent || item.mesh;
    this._positionDelBadge(item.mesh);

    const tc = this._ensureGizmo();
    if (tc && this._selCard) {
      if (!this._selCard.userData._wwBase) this._selCard.userData._wwBase = this._selCard.position.clone();
      tc.attach(this._selCard);
    }
    return true;
  }

  // ---- X/Y/Z move gizmo ----

  _ensureGizmo() {
    if (this._gizmo) return this._gizmo;
    const host = this.host;
    if (!host?.camera || !host?.canvas || !host?.scene) return null;
    const tc = new TransformControls(host.camera, host.canvas);
    tc.setMode("translate");
    tc.setSize(0.8);
    // OrbitControls must not pan while you're dragging an arrow.
    tc.addEventListener("dragging-changed", (e) => {
      if (host.controls) host.controls.enabled = !e.value;
    });
    tc.addEventListener("objectChange", () => this._onGizmoChange());
    host.scene.add(tc);
    this._gizmo = tc;
    return tc;
  }

  _onGizmoChange() {
    const card = this._selCard;
    const base = card?.userData?._wwBase;
    if (!card || base == null || this._selectedId == null) return;
    this._offsets[this._selectedId] = {
      x: +(card.position.x - base.x).toFixed(3),
      y: +(card.position.y - base.y).toFixed(3),
      z: +(card.position.z - base.z).toFixed(3)
    };
    this._saveOffsets();
  }

  _loadOffsets() {
    try { return JSON.parse(localStorage.getItem(OFFSETS_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  _saveOffsets() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try { localStorage.setItem(OFFSETS_KEY, JSON.stringify(this._offsets)); } catch { /* ignore */ }
    }, 250);
  }

  /** Re-apply saved gizmo nudges to the freshly-built day cards. */
  _applyOffsets() {
    const items = this.host?._dayView?.items;
    if (!items) return;
    for (const it of items) {
      const card = it.mesh?.parent;
      if (!card) continue;
      if (!card.userData._wwBase) card.userData._wwBase = card.position.clone();
      const off = this._offsets[it.event?.id];
      if (off) {
        const b = card.userData._wwBase;
        card.position.set(b.x + off.x, b.y + off.y, b.z + off.z);
      }
    }
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
    if (this._offsets[id]) { delete this._offsets[id]; this._saveOffsets(); }
    this._clearSelection();
    const date = this._dayIso || this.host?._dayIso;
    if (date) this.host?.enterDayViewIso?.(date);
  }

  _clearSelection() {
    this._selectedId = null;
    this._selCard = null;
    this.delBadge?.classList.add("hidden");
    this._gizmo?.detach();
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
    this._addBar?.show(dayIso);
    this._applyOffsets();
  }

  /**
   * Show ONLY the quick-add note bar (e.g. at month level, with no day focused),
   * targeting the given day (today by default). Doesn't set _dayIso, so day-level
   * note selection/stepping stays inert.
   */
  showAddForToday(iso) {
    this._clearSelection();
    this._addBar?.show(iso);
    this._applyOffsets();
  }

  hide() {
    this._clearSelection();
    this._addBar?.hide();
  }

  dispose() {
    if (this._gizmo) {
      this._gizmo.detach();
      this.host?.scene?.remove(this._gizmo);
      this._gizmo.dispose?.();
      this._gizmo = null;
    }
    this._addBar?.dispose();
    this.delBadge?.remove();
  }
}
