/**
 * Phase 5 REDESIGN M1 — single-month wall-calendar sphere grid (flat, face-on).
 * Reads only from timelineModel; deterministic layout; InstancedMesh tiers.
 */

import * as THREE from "three";
import { getYearTopology, getEventsForDate } from "./timelineModel.js";
import {
  computeMonthGridLayout,
  computeYearGridLayout,
  clusterBackboardFrame,
  MONTH_NAMES,
  GRID_RADIUS,
  YEAR_GRID_RADIUS
} from "./WordWeaverMonthGridLayout.js";

export {
  computeMonthGridLayout,
  computeYearGridLayout,
  clusterBackboardFrame,
  MONTH_NAMES
} from "./WordWeaverMonthGridLayout.js";

/** Scenic backdrop swap slot (public/) — per-month imagery can replace these URLs later. */
export const SCENIC_BACKDROP_URLS = {
  day: "/assets/backgrounds/beach-day.png",
  night: "/assets/backgrounds/beach-night.jpg"
};
const BACKDROP_MAX_WIDTH = 1920;
const BACKDROP_OVERLAY_ALPHA = 0.45;
const BACKDROP_BLUR_PX = 5;
/** Just behind day spheres (z ≈ 0.08) in the current-month cluster. */
const BACKBOARD_Z = -0.16;

/**
 * @param {import("../inkling-core/timelineNode.js").DaySegment | string} segment
 * @returns {string}
 */
export function scenicBackdropUrlForSegment(segment) {
  return segment === "night" ? SCENIC_BACKDROP_URLS.night : SCENIC_BACKDROP_URLS.day;
}

/**
 * Mute backboard image: ~50% desaturate, ~45% dark overlay, slight blur.
 * @param {CanvasImageSource} source
 * @returns {THREE.CanvasTexture}
 */
function buildMutedBackdropTexture(source) {
  const sw = /** @type {HTMLImageElement} */ (source).width || BACKDROP_MAX_WIDTH;
  const sh = /** @type {HTMLImageElement} */ (source).height || Math.round(sw * 0.5625);
  const w = Math.min(BACKDROP_MAX_WIDTH, sw);
  const h = Math.max(1, Math.round((w / sw) * sh));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0a1018";
    ctx.fillRect(0, 0, w, h);
    if (typeof ctx.filter === "string") {
      ctx.filter = `saturate(50%) blur(${BACKDROP_BLUR_PX}px)`;
    }
    ctx.drawImage(source, 0, 0, w, h);
    if (typeof ctx.filter === "string") ctx.filter = "none";
    ctx.fillStyle = `rgba(0, 0, 0, ${BACKDROP_OVERLAY_ALPHA})`;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const NOTE_CAP = 6;
const NOTE_STACK_STEP = 0.32;

const RADIUS = GRID_RADIUS;

/** Shared geometry + materials (perf seam for year grid). */
const sharedGeometry = {
  month: new THREE.SphereGeometry(RADIUS.month, 28, 28),
  day: new THREE.SphereGeometry(RADIUS.day, 22, 22),
  note: new THREE.SphereGeometry(RADIUS.note, 16, 16)
};

const yearSharedGeometry = {
  month: new THREE.SphereGeometry(YEAR_GRID_RADIUS.month, 28, 28),
  day: sharedGeometry.day,
  note: sharedGeometry.note
};

const sharedMaterial = {
  month: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.12,
    roughness: 0.38,
    emissive: new THREE.Color(0x334455),
    emissiveIntensity: 0.25
  }),
  day: new THREE.MeshStandardMaterial({
    color: 0xff8822,
    metalness: 0.08,
    roughness: 0.42,
    emissive: new THREE.Color(0x552200),
    emissiveIntensity: 0.18
  }),
  note: new THREE.MeshStandardMaterial({
    color: 0x3399ff,
    metalness: 0.1,
    roughness: 0.4,
    emissive: new THREE.Color(0x113366),
    emissiveIntensity: 0.35
  })
};

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

/**
 * @param {string} text
 * @param {{ fontSize?: number, fill?: string, width?: number, height?: number, planeW?: number, planeH?: number }} [opts]
 */
function createLabelSprite(text, opts = {}) {
  const canvas = document.createElement("canvas");
  const w = opts.width ?? 128;
  const h = opts.height ?? 128;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.font = opts.fontSize ?? "700 56px system-ui, sans-serif";
    ctx.fillStyle = opts.fill ?? "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.fillText(text, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(opts.planeW ?? 0.72, opts.planeH ?? 0.72),
    mat
  );
  mesh.renderOrder = 12;
  return { mesh, mat, tex };
}

/**
 * Single-month sphere grid (static M1 prototype).
 */
export class WordWeaverMonthGrid {
  /**
   * @param {THREE.Scene} scene
   * @param {{ year?: number, monthIndex?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    const now = new Date();
    this.year = opts.year ?? now.getFullYear();
    this.monthIndex = opts.monthIndex ?? now.getMonth();
    this.root = new THREE.Group();
    this.root.name = "ww-month-grid-m1";
    scene.add(this.root);

    /** @type {THREE.InstancedMesh[]} */
    this._instanced = [];
    /** @type {Array<{ mesh: THREE.Mesh, mat: THREE.Material, tex?: THREE.Texture }>} */
    this._labels = [];
    /** @type {THREE.LineSegments | null} */
    this._connectors = null;
    this._layout = null;
    this._monthLabel = null;
  }

  build() {
    this.disposeContent();
    this._layout = computeMonthGridLayout(this.year, this.monthIndex);
    const topology = getYearTopology(this.year);

    /** @type {Array<{ x: number, y: number, z: number }>} */
    const monthInstances = [{ ...this._layout.monthCenter }];
    /** @type {Array<{ x: number, y: number, z: number, iso: string, day: number }>} */
    const dayInstances = [];
    /** @type {Array<{ x: number, y: number, z: number, iso: string, dayIndex: number }>} */
    const noteInstances = [];
    /** @type {Array<{ from: THREE.Vector3, to: THREE.Vector3 }>} */
    const connectorPairs = [];

    for (const cell of this._layout.cells) {
      dayInstances.push({ x: cell.x, y: cell.y, z: 0.08, iso: cell.iso, day: cell.day });
      const count = topology.dayCounts[cell.iso] ?? 0;
      if (count <= 0) continue;

      const events = getEventsForDate(cell.iso).slice(0, NOTE_CAP);
      events.forEach((ev, i) => {
        const noteY =
          cell.y + RADIUS.day + RADIUS.note + 0.06 + i * NOTE_STACK_STEP;
        const pos = { x: cell.x, y: noteY, z: 0.12, iso: cell.iso, dayIndex: cell.day };
        noteInstances.push(pos);
        connectorPairs.push({
          from: new THREE.Vector3(cell.x, cell.y + RADIUS.day * 0.85, 0.1),
          to: new THREE.Vector3(cell.x, noteY - RADIUS.note, 0.11)
        });
      });
    }

    this._addInstancedTier("month", monthInstances);
    this._addInstancedTier("day", dayInstances);
    this._addInstancedTier("note", noteInstances);

    const monthName = MONTH_NAMES[this.monthIndex] ?? "Month";
    const monthLabel = createLabelSprite(monthName, {
      fontSize: "700 44px system-ui, sans-serif",
      fill: "#f8fafc",
      width: 512,
      height: 128,
      planeW: 2.8,
      planeH: 0.72
    });
    monthLabel.mesh.position.set(
      this._layout.monthCenter.x,
      this._layout.monthCenter.y + RADIUS.month + 0.55,
      0.25
    );
    this.root.add(monthLabel.mesh);
    this._monthLabel = monthLabel;
    this._labels.push(monthLabel);

    for (const cell of this._layout.cells) {
      const label = createLabelSprite(String(cell.day), {
        fontSize: "700 48px system-ui, sans-serif",
        fill: "#fff7ed",
        width: 96,
        height: 96,
        planeW: 0.52,
        planeH: 0.52
      });
      label.mesh.position.set(cell.x, cell.y, RADIUS.day + 0.22);
      this.root.add(label.mesh);
      this._labels.push(label);
    }

    if (connectorPairs.length) {
      const positions = new Float32Array(connectorPairs.length * 6);
      connectorPairs.forEach((pair, i) => {
        const o = i * 6;
        positions[o] = pair.from.x;
        positions[o + 1] = pair.from.y;
        positions[o + 2] = pair.from.z;
        positions[o + 3] = pair.to.x;
        positions[o + 4] = pair.to.y;
        positions[o + 5] = pair.to.z;
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x66bbff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      this._connectors = new THREE.LineSegments(geom, mat);
      this._connectors.renderOrder = 5;
      this.root.add(this._connectors);
    }

    this.root.layers.set(1);
    this.root.traverse((obj) => obj.layers.set(1));
  }

  /**
   * @param {"month"|"day"|"note"} tier
   * @param {Array<{ x: number, y: number, z: number }>} instances
   */
  _addInstancedTier(tier, instances) {
    addInstancedTier(this.root, this._instanced, sharedGeometry, tier, instances, "ww-month-grid");
  }

  /**
   * Frame camera for face-on month view.
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
   */
  frameCamera(camera, controls) {
    const b = this._layout?.bounds ?? { width: 12, height: 11 };
    const span = Math.max(b.width, b.height);
    controls.maxDistance = 120;
    controls.minDistance = span * 0.35;
    controls.target.set(0, -span * 0.12, 0);
    camera.position.set(0, -span * 0.08, span * 1.05 + 6);
    controls.update();
  }

  /**
   * @param {number} _delta
   * @param {number} elapsed
   */
  update(_delta, elapsed) {
    if (this._monthLabel?.mesh) {
      this._monthLabel.mesh.position.y =
        (this._layout?.monthCenter.y ?? 0) + RADIUS.month + 0.55 + Math.sin(elapsed * 1.1) * 0.06;
    }
  }

  disposeContent() {
    for (const mesh of this._instanced) {
      this.root.remove(mesh);
      mesh.dispose();
    }
    this._instanced = [];

    if (this._connectors) {
      this.root.remove(this._connectors);
      this._connectors.geometry.dispose();
      this._connectors.material.dispose();
      this._connectors = null;
    }

    for (const label of this._labels) {
      this.root.remove(label.mesh);
      label.mesh.geometry.dispose();
      label.mat.dispose();
      label.tex?.dispose();
    }
    this._labels = [];
    this._monthLabel = null;
  }

  dispose() {
    this.disposeContent();
    this.scene.remove(this.root);
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {{ year?: number, monthIndex?: number }} [opts]
 * @returns {WordWeaverMonthGrid}
 */
export function createMonthGrid(scene, opts = {}) {
  const grid = new WordWeaverMonthGrid(scene, opts);
  grid.build();
  return grid;
}

/**
 * @param {THREE.Group} root
 * @param {THREE.InstancedMesh[]} bucket
 * @param {Record<string, THREE.BufferGeometry>} geometry
 * @param {"month"|"day"|"note"} tier
 * @param {Array<{ x: number, y: number, z: number }>} instances
 * @param {string} namePrefix
 */
function addInstancedTier(root, bucket, geometry, tier, instances, namePrefix) {
  if (!instances.length) return;
  const mesh = new THREE.InstancedMesh(
    geometry[tier],
    sharedMaterial[tier],
    instances.length
  );
  mesh.name = `${namePrefix}-${tier}-instances`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  instances.forEach((inst, i) => {
    _position.set(inst.x, inst.y, inst.z);
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(i, _matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  bucket.push(mesh);
}

/**
 * All-12-months year panel (4×3 grid) — static overview, aggregated instancing.
 */
export class WordWeaverYearGrid {
  /**
   * @param {THREE.Scene} scene
   * @param {{ year?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    const now = new Date();
    this.year = opts.year ?? now.getFullYear();
    this._currentMonthIndex = opts.currentMonthIndex ?? now.getMonth();
    this.root = new THREE.Group();
    this.root.name = "ww-year-grid-panel";
    scene.add(this.root);

    /** @type {THREE.InstancedMesh[]} */
    this._instanced = [];
    /** @type {Array<{ mesh: THREE.Mesh, mat: THREE.Material, tex?: THREE.Texture }>} */
    this._labels = [];
    this._layout = null;
    /** @type {THREE.Mesh | null} */
    this._backboardMesh = null;
    /** @type {THREE.CanvasTexture | null} */
    this._backboardTexture = null;
    /** @type {string | null} */
    this._backboardUrl = null;
  }

  build() {
    this.disposeContent();
    this._layout = computeYearGridLayout(this.year);
    const topology = getYearTopology(this.year);

    this._mountBackboard();

    /** @type {Array<{ x: number, y: number, z: number }>} */
    const monthInstances = [];
    /** @type {Array<{ x: number, y: number, z: number }>} */
    const dayInstances = [];
    /** @type {Array<{ x: number, y: number, z: number }>} */
    const noteInstances = [];

    for (const cluster of this._layout.clusters) {
      const { origin, monthLayout, monthCenter } = cluster;
      monthInstances.push({ ...monthCenter });

      for (const cell of monthLayout.cells) {
        const x = origin.x + cell.x;
        const y = origin.y + cell.y;
        dayInstances.push({ x, y, z: 0.08 });
        const count = topology.dayCounts[cell.iso] ?? 0;
        if (count <= 0) continue;

        const events = getEventsForDate(cell.iso).slice(0, NOTE_CAP);
        events.forEach((ev, i) => {
          const noteY =
            y + GRID_RADIUS.day + GRID_RADIUS.note + 0.06 + i * NOTE_STACK_STEP;
          noteInstances.push({ x, y: noteY, z: 0.12 });
        });
      }

      const monthName = MONTH_NAMES[cluster.monthIndex] ?? "Month";
      const monthLabel = createLabelSprite(monthName, {
        fontSize: "700 176px system-ui, sans-serif",
        fill: "#f8fafc",
        width: 1024,
        height: 256,
        planeW: 11.2,
        planeH: 2.88
      });
      monthLabel.mesh.position.set(
        monthCenter.x,
        monthCenter.y + YEAR_GRID_RADIUS.month + 1.1,
        0.25
      );
      this.root.add(monthLabel.mesh);
      this._labels.push(monthLabel);
    }

    addInstancedTier(this.root, this._instanced, yearSharedGeometry, "month", monthInstances, "ww-year-grid");
    addInstancedTier(this.root, this._instanced, yearSharedGeometry, "day", dayInstances, "ww-year-grid");
    addInstancedTier(this.root, this._instanced, yearSharedGeometry, "note", noteInstances, "ww-year-grid");

    this.root.layers.set(1);
    this.root.traverse((obj) => obj.layers.set(1));
  }

  /**
   * Frame camera for face-on year overview (all 12 months visible).
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
   */
  frameCamera(camera, controls) {
    const b = this._layout?.bounds ?? { width: 72, height: 58, minX: -36, maxX: 36, minY: -29, maxY: 29 };
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const span = Math.max(b.width, b.height);
    controls.maxDistance = 240;
    controls.minDistance = span * 0.15;
    controls.target.set(cx, cy, 0);
    camera.position.set(cx, cy + span * 0.02, span * 1.08 + 10);
    camera.far = Math.max(camera.far, span * 2.5 + 48);
    camera.updateProjectionMatrix();
    controls.update();
  }

  /**
   * @param {number} _delta
   * @param {number} _elapsed
   */
  update(_delta, _elapsed) {}

  /** Poster plane behind today's month cluster (parallel to the grid). */
  _mountBackboard() {
    const cluster = this._layout?.clusters.find(
      (c) => c.monthIndex === this._currentMonthIndex
    );
    if (!cluster) {
      this._removeBackboard();
      return;
    }
    const frame = clusterBackboardFrame(cluster);
    if (!this._backboardMesh) {
      const geom = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: true,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = "ww-month-backboard";
      mesh.renderOrder = -8;
      this._backboardMesh = mesh;
      this.root.add(mesh);
    }
    this._backboardMesh.scale.set(frame.w, frame.h, 1);
    this._backboardMesh.position.set(frame.cx, frame.cy, BACKBOARD_Z);
  }

  _removeBackboard() {
    if (!this._backboardMesh) return;
    this.root.remove(this._backboardMesh);
    this._backboardMesh.geometry.dispose();
    if (this._backboardMesh.material instanceof THREE.Material) {
      this._backboardMesh.material.dispose();
    }
    this._backboardMesh = null;
  }

  _disposeBackboardTexture() {
    if (this._backboardTexture) {
      this._backboardTexture.dispose();
      this._backboardTexture = null;
    }
    if (this._backboardMesh?.material instanceof THREE.MeshBasicMaterial) {
      this._backboardMesh.material.map = null;
    }
  }

  /**
   * Single swap-in slot for scenic backboard imagery (per-month art replaces this URL later).
   * @param {string} url
   */
  setScenicBackdropImage(url) {
    if (!url || url === this._backboardUrl) return;
    this._backboardUrl = url;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this._backboardUrl !== url) return;
      this._disposeBackboardTexture();
      const tex = buildMutedBackdropTexture(img);
      this._backboardTexture = tex;
      if (this._backboardMesh?.material instanceof THREE.MeshBasicMaterial) {
        this._backboardMesh.material.map = tex;
        this._backboardMesh.material.color.set(0xffffff);
        this._backboardMesh.material.needsUpdate = true;
      }
    };
    img.onerror = () => {
      console.warn("[WordWeaverYearGrid] scenic backboard failed to load:", url);
      if (this._backboardUrl === url) this._backboardUrl = null;
    };
    img.src = url;
  }

  /**
   * Time-of-day scenic backboard from WordWeaver day segment (Morning/Afternoon/Night toggle).
   * @param {import("../inkling-core/timelineNode.js").DaySegment | string} segment
   */
  setScenicBackdropForSegment(segment) {
    this.setScenicBackdropImage(scenicBackdropUrlForSegment(segment));
  }

  disposeContent() {
    this._disposeBackboardTexture();
    this._backboardUrl = null;
    this._removeBackboard();

    for (const mesh of this._instanced) {
      this.root.remove(mesh);
      mesh.dispose();
    }
    this._instanced = [];

    for (const label of this._labels) {
      this.root.remove(label.mesh);
      label.mesh.geometry.dispose();
      label.mat.dispose();
      label.tex?.dispose();
    }
    this._labels = [];
  }

  dispose() {
    this.disposeContent();
    this.scene.remove(this.root);
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {{ year?: number }} [opts]
 * @returns {WordWeaverYearGrid}
 */
export function createYearGrid(scene, opts = {}) {
  const grid = new WordWeaverYearGrid(scene, opts);
  grid.build();
  return grid;
}
