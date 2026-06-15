/**
 * WordWeaver — note-node layouts. Renders every note in the year as a
 * category-colored sphere and lets you switch how they're arranged from a
 * dropdown, so you can feel how colors separate vs combine.
 *
 * Layouts: helix (year coil), towers (one column per category — max
 * separation), galaxy (same colors clump — max combination), river (one
 * colored lane per category along a time axis — best for tracing one color).
 *
 * Self-contained: renders into the shared scene via the shared camera/controls.
 */
import * as THREE from "three";
import { getYearTopology, getEventsForDate, classifyText, CategoryColors } from "./timelineModel.js";

const TWO_PI = Math.PI * 2;
const CAT_ORDER = ["health", "study", "work", "personal", "creative", "errand", "default"];
const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work", personal: "Personal",
  creative: "Creative", errand: "Errands", default: "Other"
};

function colorFor(cat) {
  return CategoryColors[cat] ?? CategoryColors.errand ?? CategoryColors.default ?? "#94A3B8";
}

function catOf(text) {
  const c = classifyText(text);
  if (c === "errands") return "errand";
  return CAT_ORDER.includes(c) ? c : "default";
}

function isoFor(year, dayIndex) {
  const d = new Date(year, 0, 1 + dayIndex);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Stable pseudo-random in [-1,1] from an integer seed. */
function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function collectYearNotes(year) {
  const topo = getYearTopology(year);
  const counts = topo?.dayCounts ?? {};
  const leap = new Date(year, 1, 29).getMonth() === 1;
  const days = leap ? 366 : 365;
  /** @type {Array<{ dayIndex:number, minutes:number, cat:string }>} */
  const notes = [];
  for (let i = 0; i < days; i++) {
    const iso = isoFor(year, i);
    if (!counts[iso]) continue;
    for (const ev of getEventsForDate(iso)) {
      const text = ev?.text ?? ev?.title ?? ev?.body ?? "";
      const [h, m] = String(ev?.time ?? "0:0").split(":").map(Number);
      notes.push({
        dayIndex: i,
        minutes: (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0),
        cat: catOf(text)
      });
    }
  }
  return notes;
}

export class WeaverLayouts {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
   */
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.year = new Date().getFullYear();
    this.mode = "towers";
    this.root = new THREE.Group();
    this.root.name = "weaver-layouts";
    this.root.visible = false;
    scene.add(this.root);
    this._mesh = null;
    this._notes = [];
    this._positions = [];
    this._built = false;
    this._active = false;
    this._savedCam = null;
    this._ui = null;
  }

  _build() {
    if (this._built) return;
    this._notes = collectYearNotes(this.year);
    const n = Math.max(1, this._notes.length);
    const geom = new THREE.SphereGeometry(1, 14, 14);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const mesh = new THREE.InstancedMesh(geom, mat, n);
    mesh.name = "weaver-layouts-notes";
    const col = new THREE.Color();
    for (let i = 0; i < this._notes.length; i++) {
      col.set(colorFor(this._notes[i].cat));
      mesh.setColorAt(i, col);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.root.add(mesh);
    this._mesh = mesh;
    this._applyLayout(this.mode);
    this._built = true;
  }

  /** Compute a world position for note i under the given layout. */
  _layoutPos(note, i, mode, out, ctx) {
    const days = ctx.days;
    if (mode === "helix") {
      const a = note.dayIndex * (TWO_PI / 30.4);
      out.set(Math.cos(a) * 14, -32 + note.dayIndex * (64 / days), Math.sin(a) * 14);
    } else if (mode === "towers") {
      const slot = CAT_ORDER.indexOf(note.cat);
      const x = (slot - (CAT_ORDER.length - 1) / 2) * 9;
      const stack = ctx.stack[note.cat]++;
      out.set(x, stack * 1.7 - 16, 0);
    } else if (mode === "galaxy") {
      const slot = CAT_ORDER.indexOf(note.cat);
      const aA = (slot / CAT_ORDER.length) * TWO_PI;
      const aR = 20;
      out.set(
        Math.cos(aA) * aR + rand(i + 1) * 7,
        rand(i + 13) * 9,
        Math.sin(aA) * aR + rand(i + 29) * 7
      );
    } else {
      // river: x = time across year, y = one lane per category
      const slot = CAT_ORDER.indexOf(note.cat);
      out.set(
        (note.dayIndex / days) * 64 - 32,
        (slot - (CAT_ORDER.length - 1) / 2) * 5,
        (note.minutes / 1439) * 4 - 2
      );
    }
    return out;
  }

  _applyLayout(mode) {
    if (!this._mesh) return;
    this.mode = mode;
    const leap = new Date(this.year, 1, 29).getMonth() === 1;
    const ctx = { days: leap ? 366 : 365, stack: {} };
    for (const c of CAT_ORDER) ctx.stack[c] = 0;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(0.5, 0.5, 0.5);
    const box = new THREE.Box3();
    for (let i = 0; i < this._notes.length; i++) {
      this._layoutPos(this._notes[i], i, mode, pos, ctx);
      m.compose(pos, quat, scl);
      this._mesh.setMatrixAt(i, m);
      box.expandByPoint(pos);
    }
    this._mesh.instanceMatrix.needsUpdate = true;
    this._bounds = box;
    this._frameCamera();
  }

  setLayout(mode) {
    this._build();
    this._applyLayout(mode);
  }

  _frameCamera() {
    const box = this._bounds && !this._bounds.isEmpty() ? this._bounds : null;
    const center = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const size = box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(40, 40, 40);
    const span = Math.max(size.x, size.y, size.z, 20);
    if (!this._savedCam) {
      this._savedCam = {
        pos: this.camera.position.clone(),
        target: this.controls.target.clone(),
        near: this.camera.near, far: this.camera.far,
        minD: this.controls.minDistance, maxD: this.controls.maxDistance
      };
    }
    this.controls.minDistance = 8;
    this.controls.maxDistance = span * 4 + 100;
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + span * 0.1, center.z + span * 1.3 + 20);
    this.camera.far = Math.max(this.camera.far, span * 6 + 400);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _buildUi() {
    if (this._ui) return;
    const wrap = document.createElement("div");
    wrap.id = "weaver-layout-ui";
    wrap.style.cssText =
      "position:fixed;top:calc(56px + env(safe-area-inset-top,0px));left:12px;z-index:10260;" +
      "display:flex;gap:8px;align-items:center;background:rgba(8,12,22,0.8);" +
      "border:1px solid rgba(99,102,241,0.4);border-radius:10px;padding:6px 10px;color:#e2e8f0;font:600 13px system-ui";
    const select = document.createElement("select");
    select.style.cssText =
      "background:#0f1726;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:6px 8px;font:inherit";
    for (const [val, label] of [
      ["towers", "Category Towers"], ["galaxy", "Galaxy Cloud"],
      ["river", "River Lanes"], ["helix", "Year Helix"]
    ]) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      if (val === this.mode) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", () => this.setLayout(select.value));
    const legend = document.createElement("div");
    legend.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center";
    for (const c of CAT_ORDER) {
      const chip = document.createElement("span");
      chip.style.cssText = "display:inline-flex;gap:4px;align-items:center;font-size:11px;color:#cbd5e1";
      chip.innerHTML =
        `<span style="width:10px;height:10px;border-radius:50%;background:${colorFor(c)};display:inline-block"></span>${CAT_LABEL[c]}`;
      legend.appendChild(chip);
    }
    wrap.append(select, legend);
    document.body.appendChild(wrap);
    this._ui = wrap;
  }

  show() {
    this._build();
    this.root.visible = true;
    this._active = true;
    this._buildUi();
    if (this._ui) this._ui.style.display = "flex";
    this._frameCamera();
  }

  hide() {
    this.root.visible = false;
    this._active = false;
    if (this._ui) this._ui.style.display = "none";
    if (this._savedCam) {
      this.camera.position.copy(this._savedCam.pos);
      this.controls.target.copy(this._savedCam.target);
      this.camera.near = this._savedCam.near;
      this.camera.far = this._savedCam.far;
      this.controls.minDistance = this._savedCam.minD;
      this.controls.maxDistance = this._savedCam.maxD;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this._savedCam = null;
    }
  }

  update() {
    if (!this._active || !this.root.visible) return;
    this.root.rotation.y += this.mode === "galaxy" ? 0.0016 : 0.0006;
  }

  dispose() {
    if (this._mesh) {
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh.dispose?.();
    }
    this._ui?.remove();
    this._ui = null;
    this.scene.remove(this.root);
    this._built = false;
  }
}
