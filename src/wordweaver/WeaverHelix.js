/**
 * WordWeaver — Notes Constellation, step 1: the helix skeleton.
 *
 * A year of days spirals up a vertical axis (Jan at bottom → Dec at top), one
 * coil-turn per month. Days with notes show as larger, brighter beads; empty
 * days are dim. Month labels ("Jan" … "Dec") + a big year label anchor it.
 *
 * Self-contained: renders into the shared scene via the shared camera/controls
 * (the app's main render loop draws it). Save/restore the camera so leaving the
 * constellation never strands the other 3D views.
 *
 * Later steps (per docs/WORDWEAVER_VISION.md): LOD bloom into note atoms,
 * per-category color ribbons, color isolation, Inkling semantic links.
 */
import * as THREE from "three";
import { getYearTopology } from "./timelineModel.js";

const TWO_PI = Math.PI * 2;
const RADIUS = 14;
const HEIGHT = 64;
const DAYS_PER_TURN = 30.4;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** Canvas-texture text sprite (self-contained — no external label dep). */
function makeLabel(text, { px = 120, w = 512, h = 160, color = "#f1f5f9", planeW = 6, planeH = 1.9 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `700 ${px}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(text, w / 2 + 3, h / 2 + 3);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(planeW, planeH, 1);
  return { sprite, tex, mat };
}

function isoFor(year, dayIndex) {
  const d = new Date(year, 0, 1 + dayIndex);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayOfYearForMonth(year, monthIndex) {
  const jan1 = new Date(year, 0, 1);
  const first = new Date(year, monthIndex, 1);
  return Math.round((first - jan1) / 86400000);
}

export class WeaverHelix {
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

    this.root = new THREE.Group();
    this.root.name = "weaver-helix";
    this.root.visible = false;
    scene.add(this.root);

    /** @type {Array<{ mat: THREE.Material, tex: THREE.Texture }>} */
    this._labels = [];
    this._beads = null;
    this._built = false;
    this._active = false;
    this._t0 = 0;
    this._savedCam = null;
  }

  _build() {
    if (this._built) return;
    const topology = getYearTopology(this.year);
    const dayCounts = topology?.dayCounts ?? {};

    const leap = new Date(this.year, 1, 29).getMonth() === 1;
    const daysInYear = leap ? 366 : 365;
    const yStep = HEIGHT / (daysInYear - 1);

    const geom = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false });
    const beads = new THREE.InstancedMesh(geom, mat, daysInYear);
    beads.name = "weaver-helix-days";

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const litColor = new THREE.Color("#8be9ff");
    const dimColor = new THREE.Color("#46597e");
    const pathPts = new Float32Array(daysInYear * 3);

    for (let i = 0; i < daysInYear; i++) {
      const angle = i * (TWO_PI / DAYS_PER_TURN);
      const y = -HEIGHT / 2 + i * yStep;
      pos.set(Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS);
      pathPts[i * 3] = pos.x;
      pathPts[i * 3 + 1] = pos.y;
      pathPts[i * 3 + 2] = pos.z;
      const count = dayCounts[isoFor(this.year, i)] ?? 0;
      const r = count > 0 ? 0.6 + Math.min(count, 5) * 0.22 : 0.26;
      scl.set(r, r, r);
      m.compose(pos, quat, scl);
      beads.setMatrixAt(i, m);
      beads.setColorAt(i, count > 0 ? litColor : dimColor);
    }
    beads.instanceMatrix.needsUpdate = true;
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
    this.root.add(beads);
    this._beads = beads;

    // Continuous coil line through every day so the helix shape reads clearly.
    const pathGeom = new THREE.BufferGeometry();
    pathGeom.setAttribute("position", new THREE.BufferAttribute(pathPts, 3));
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x5b7bb4,
      transparent: true,
      opacity: 0.55,
      toneMapped: false
    });
    this._spiral = new THREE.Line(pathGeom, pathMat);
    this.root.add(this._spiral);

    // Month labels at the start of each month's coil turn.
    for (let mo = 0; mo < 12; mo++) {
      const dayIndex = dayOfYearForMonth(this.year, mo);
      const angle = dayIndex * (TWO_PI / DAYS_PER_TURN);
      const y = -HEIGHT / 2 + dayIndex * yStep;
      const { sprite, tex, mat: lm } = makeLabel(MONTHS[mo], { planeW: 5, planeH: 1.6 });
      sprite.position.set(Math.cos(angle) * (RADIUS + 3.4), y, Math.sin(angle) * (RADIUS + 3.4));
      this.root.add(sprite);
      this._labels.push({ mat: lm, tex });
    }

    // Year label, anchored above the top of the coil.
    const yearLbl = makeLabel(String(this.year), { px: 160, w: 768, h: 256, planeW: 12, planeH: 4 });
    yearLbl.sprite.position.set(0, HEIGHT / 2 + 6, 0);
    this.root.add(yearLbl.sprite);
    this._labels.push({ mat: yearLbl.mat, tex: yearLbl.tex });

    this._built = true;
  }

  _frameCamera() {
    // Save current camera/controls so hide() can restore the other views.
    this._savedCam = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      near: this.camera.near,
      far: this.camera.far,
      minD: this.controls.minDistance,
      maxD: this.controls.maxDistance
    };
    this.controls.minDistance = 10;
    this.controls.maxDistance = 260;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 6, 96);
    this.camera.near = 0.1;
    this.camera.far = Math.max(this.camera.far, 600);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  show() {
    this._build();
    this.root.visible = true;
    this._active = true;
    this._t0 = performance.now();
    this._frameCamera();
  }

  hide() {
    this.root.visible = false;
    this._active = false;
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

  /** Gentle auto-spin so it feels alive; user orbit overrides momentarily. */
  update() {
    if (!this._active || !this.root.visible) return;
    this.root.rotation.y += 0.0012;
  }

  dispose() {
    if (this._spiral) {
      this._spiral.geometry.dispose();
      this._spiral.material.dispose();
      this._spiral = null;
    }
    if (this._beads) {
      this._beads.geometry.dispose();
      this._beads.material.dispose();
      this._beads.dispose?.();
    }
    for (const l of this._labels) {
      l.mat.dispose();
      l.tex.dispose();
    }
    this._labels = [];
    this.scene.remove(this.root);
    this._built = false;
  }
}
