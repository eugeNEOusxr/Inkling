/**
 * Phase 5 REDESIGN M1 — single-month wall-calendar sphere grid (flat, face-on).
 * Reads only from timelineModel; deterministic layout; InstancedMesh tiers.
 */

import * as THREE from "three";
import { getYearTopology, getEventsForDate, classifyText, CategoryColors } from "./timelineModel.js";
import { createReal3DText, preloadReal3DFont } from "./Real3DText.js";
import { getTextStyle, text3dParams, getTextColor } from "../calendar/ui/TextStylePicker.js";
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

/** Default/fallback scenic pair (public/). */
export const SCENIC_BACKDROP_URLS = {
  day: "/assets/backgrounds/beach-day.png",
  night: "/assets/backgrounds/beach-night.jpg"
};

/**
 * Per-month day/night scene pairs (monthIndex 0-11). To give a month a backdrop:
 * drop the two images in public/assets/backgrounds/ and add ONE line here.
 * @type {Record<number, { day: string, night: string }>}
 */
export const MONTH_SCENES = {
  0: { day: "/assets/backgrounds/january-day.jpg", night: "/assets/backgrounds/january-night.jpg" }, // January — spacewalk
  1: { day: "/assets/backgrounds/balloon-day.jpg", night: "/assets/backgrounds/balloon-night.jpg" }, // February — hot air balloons
  2: { day: "/assets/backgrounds/march-day.jpg", night: "/assets/backgrounds/march-night.jpg" }, // March — cherry blossom
  3: { day: "/assets/backgrounds/april-day.jpg", night: "/assets/backgrounds/april-night.jpg" }, // April — tulips
  4: { day: "/assets/backgrounds/may-day.jpg", night: "/assets/backgrounds/may-night.jpg" }, // May — wildflower meadow
  5: { day: "/assets/backgrounds/beach-day.png", night: "/assets/backgrounds/beach-night.jpg" }, // June — beach
  6: { day: "/assets/backgrounds/waverunner-day.jpg", night: "/assets/backgrounds/waverunner-night.jpg" }, // July — waverunners
  7: { day: "/assets/backgrounds/august-day.jpg", night: "/assets/backgrounds/august-night.jpg" }, // August — lavender
  8: { day: "/assets/backgrounds/september-day.jpg", night: "/assets/backgrounds/september-night.jpg" }, // September — vineyard
  9: { day: "/assets/backgrounds/october-day.jpg", night: "/assets/backgrounds/october-night.jpg" }, // October — autumn forest
  10: { day: "/assets/backgrounds/november-day.jpg", night: "/assets/backgrounds/november-night.jpg" }, // November — misty mountains
  11: { day: "/assets/backgrounds/december-day.jpg", night: "/assets/backgrounds/december-night.jpg" } // December — winter day / aurora night
};

/**
 * @param {number} monthIndex 0-11
 * @param {string} segment
 * @returns {string | null}
 */
function monthSceneUrl(monthIndex, segment) {
  const scene = MONTH_SCENES[monthIndex];
  if (!scene) return null;
  return segment === "night" ? scene.night : scene.day;
}
const BACKDROP_MAX_WIDTH = 1920;
const BACKDROP_OVERLAY_ALPHA = 0.14;
const BACKDROP_BLUR_PX = 2;
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
      ctx.filter = `saturate(92%) blur(${BACKDROP_BLUR_PX}px)`;
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

// Cap + step tuned so a day's note stack never reaches the white month sphere
// (row 0) or the day sphere above it (lower rows) — fixes the June collision.
const NOTE_CAP = 3;
const NOTE_STACK_STEP = 0.28;
const DEFAULT_NOTE_COLOR = "#3399ff";

/** Coordinated note color from its text (category palette). */
function noteColorFor(text) {
  return CategoryColors[classifyText(text)] ?? DEFAULT_NOTE_COLOR;
}

const RADIUS = GRID_RADIUS;

/** Shared geometry + materials (perf seam for year grid). */
const sharedGeometry = {
  // Month markers are 3D BOXES (days stay spheres).
  month: new THREE.BoxGeometry(RADIUS.month * 1.7, RADIUS.month * 1.7, RADIUS.month * 1.7),
  day: new THREE.SphereGeometry(RADIUS.day, 22, 22),
  note: new THREE.SphereGeometry(RADIUS.note, 16, 16)
};

const yearSharedGeometry = {
  // The year view's 12 white month markers are boxes too.
  month: new THREE.BoxGeometry(YEAR_GRID_RADIUS.month * 1.7, YEAR_GRID_RADIUS.month * 1.7, YEAR_GRID_RADIUS.month * 1.7),
  day: sharedGeometry.day,
  note: sharedGeometry.note
};

const sharedMaterial = {
  month: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.2,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    emissive: new THREE.Color(0x334455),
    emissiveIntensity: 0.3
  }),
  day: new THREE.MeshPhysicalMaterial({
    color: 0xff8822,
    metalness: 0.28,
    roughness: 0.19,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    emissive: new THREE.Color(0x552200),
    emissiveIntensity: 0.22
  }),
  note: new THREE.MeshPhysicalMaterial({
    color: 0x3399ff,
    metalness: 0.28,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    emissive: new THREE.Color(0x113366),
    emissiveIntensity: 0.4
  })
};

/** White base so per-instance setColorAt() shows true category colors. */
const noteColorMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.28,
  roughness: 0.16,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  emissive: new THREE.Color(0x0a0a0a),
  emissiveIntensity: 0.12
});

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

/** Gentle "breathing" glow so the spheres feel alive (shared by both grids). */
function pulseSpheres(elapsed) {
  const t = (Math.sin(elapsed * 1.6) + 1) * 0.5; // 0..1
  sharedMaterial.month.emissiveIntensity = 0.26 + t * 0.12;
  sharedMaterial.day.emissiveIntensity = 0.18 + t * 0.18;
  sharedMaterial.note.emissiveIntensity = 0.32 + t * 0.28;
  noteColorMaterial.emissiveIntensity = 0.08 + t * 0.18;
}

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
    /** @type {THREE.Color[]} per-note colors, parallel to noteInstances */
    const noteColors = [];
    /** @type {Array<{ from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color }>} */
    const connectorSegs = [];

    for (const cell of this._layout.cells) {
      dayInstances.push({ x: cell.x, y: cell.y, z: 0.08, iso: cell.iso, day: cell.day });
      const count = topology.dayCounts[cell.iso] ?? 0;
      if (count <= 0) continue;

      const events = getEventsForDate(cell.iso).slice(0, NOTE_CAP);
      // Walk up the stack, drawing a colored line from each point to the next note.
      let prev = new THREE.Vector3(cell.x, cell.y + RADIUS.day * 0.85, 0.1);
      events.forEach((ev, i) => {
        const noteY = cell.y + RADIUS.day + RADIUS.note + 0.06 + i * NOTE_STACK_STEP;
        const color = new THREE.Color(noteColorFor(ev?.text ?? ev?.title ?? ev?.note ?? ""));
        noteInstances.push({ x: cell.x, y: noteY, z: 0.12, iso: cell.iso, dayIndex: cell.day });
        noteColors.push(color);
        const here = new THREE.Vector3(cell.x, noteY, 0.11);
        connectorSegs.push({ from: prev.clone(), to: here.clone(), color });
        prev = here;
      });
    }

    this._addInstancedTier("month", monthInstances);
    this._addInstancedTier("day", dayInstances);
    this._addInstancedTier("note", noteInstances);

    // Paint each note its coordinated category color.
    const noteMesh = noteInstances.length ? this._instanced[this._instanced.length - 1] : null;
    if (noteMesh) {
      noteMesh.material = noteColorMaterial;
      noteColors.forEach((c, i) => noteMesh.setColorAt(i, c));
      if (noteMesh.instanceColor) noteMesh.instanceColor.needsUpdate = true;
    }

    const monthName = MONTH_NAMES[this.monthIndex] ?? "Month";
    const monthLabel = createLabelSprite(monthName, {
      fontSize: "800 176px system-ui, sans-serif",
      fill: "#f8fafc",
      width: 2048,
      height: 512,
      planeW: 11.2,
      planeH: 2.88
    });
    monthLabel.mesh.position.set(
      this._layout.monthCenter.x,
      this._layout.monthCenter.y + RADIUS.month + 1.9,
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

    // Day CELLS as light 3D boxes with darker edge lines: gives the flat grid
    // real depth (reads as 3D from far away) while the number spheres + labels
    // stay on top so the date always shows. Walls are light/translucent, edges
    // darker than the walls. Gently animated in update().
    {
      const xs = this._layout.cells.map((c) => c.x).sort((a, b) => a - b);
      let pitch = Infinity;
      for (let i = 1; i < xs.length; i++) { const dx = xs[i] - xs[i - 1]; if (dx > 0.01) pitch = Math.min(pitch, dx); }
      if (!Number.isFinite(pitch)) pitch = RADIUS.day * 2.4;
      const s = pitch * 0.84;
      const depth = Math.max(0.5, RADIUS.day * 1.5);
      const backZ = -depth * 0.5 + 0.05;
      this._dayBoxGeo = new THREE.BoxGeometry(s, s, depth);
      this._dayBoxEdgesGeo = new THREE.EdgesGeometry(this._dayBoxGeo);
      this._dayBoxWallMat = new THREE.MeshBasicMaterial({ color: 0xe2e8ff, transparent: true, opacity: 0.18, depthWrite: false });
      this._dayBoxEdgeMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.85 });
      this._dayBoxes = [];
      for (const cell of this._layout.cells) {
        const box = new THREE.Mesh(this._dayBoxGeo, this._dayBoxWallMat);
        box.position.set(cell.x, cell.y, backZ);
        box.raycast = () => {}; // don't intercept day-cell clicks
        const edges = new THREE.LineSegments(this._dayBoxEdgesGeo, this._dayBoxEdgeMat);
        edges.position.copy(box.position);
        edges.raycast = () => {};
        edges.renderOrder = 2;
        this.root.add(box);
        this.root.add(edges);
        this._dayBoxes.push({ box, edges, baseZ: backZ, phase: Math.random() * Math.PI * 2 });
      }
    }

    // Weekday headers (Sun–Sat) slanted at 45° (the hypotenuse) above each column.
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const colX = {};
    let topY = -Infinity;
    for (const cell of this._layout.cells) {
      const [yy, mm, dd] = cell.iso.split("-").map(Number);
      const wd = new Date(yy, mm - 1, dd).getDay();
      if (colX[wd] === undefined) colX[wd] = cell.x;
      if (cell.y > topY) topY = cell.y;
    }
    const headerY = topY + RADIUS.day + 0.9;
    for (const key of Object.keys(colX)) {
      const wd = Number(key);
      const lab = createLabelSprite(WD[wd], {
        fontSize: "700 60px system-ui, sans-serif",
        fill: "#a5b4fc",
        width: 200,
        height: 96,
        planeW: 0.95,
        planeH: 0.46
      });
      lab.mesh.position.set(colX[wd], headerY, RADIUS.day + 0.22);
      lab.mesh.rotation.z = -Math.PI / 4; // 45° hypotenuse slant
      this.root.add(lab.mesh);
      this._labels.push(lab);
    }

    if (connectorSegs.length) {
      const positions = new Float32Array(connectorSegs.length * 6);
      const colors = new Float32Array(connectorSegs.length * 6);
      connectorSegs.forEach((seg, i) => {
        const o = i * 6;
        positions[o] = seg.from.x;
        positions[o + 1] = seg.from.y;
        positions[o + 2] = seg.from.z;
        positions[o + 3] = seg.to.x;
        positions[o + 4] = seg.to.y;
        positions[o + 5] = seg.to.z;
        colors[o] = seg.color.r;
        colors[o + 1] = seg.color.g;
        colors[o + 2] = seg.color.b;
        colors[o + 3] = seg.color.r;
        colors[o + 4] = seg.color.g;
        colors[o + 5] = seg.color.b;
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
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
    controls.minDistance = span * 0.3;
    controls.target.set(0, -span * 0.28, 0);
    camera.position.set(0, -span * 0.28, span * 1.15 + 8);
    // Reset orientation so a tilt carried over from flying the year view can't
    // leave us aimed at just the top sphere.
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  /**
   * @param {number} _delta
   * @param {number} elapsed
   */
  update(_delta, elapsed) {
    if (this._monthLabel?.mesh) {
      this._monthLabel.mesh.position.y =
        (this._layout?.monthCenter.y ?? 0) + RADIUS.month + 1.9 + Math.sin(elapsed * 1.1) * 0.06;
    }
    // Day boxes: a gentle per-cell depth bob + a shared edge-line shimmer.
    if (this._dayBoxes) {
      if (this._dayBoxEdgeMat) this._dayBoxEdgeMat.opacity = 0.62 + 0.2 * Math.sin(elapsed * 1.6);
      for (const d of this._dayBoxes) {
        const z = d.baseZ + Math.sin(elapsed * 0.9 + d.phase) * 0.06;
        d.box.position.z = z;
        d.edges.position.z = z;
      }
    }
    pulseSpheres(elapsed);
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

    if (this._dayBoxes) {
      for (const d of this._dayBoxes) { this.root.remove(d.box); this.root.remove(d.edges); }
      this._dayBoxes = null;
    }
    this._dayBoxGeo?.dispose(); this._dayBoxGeo = null;
    this._dayBoxEdgesGeo?.dispose(); this._dayBoxEdgesGeo = null;
    this._dayBoxWallMat?.dispose(); this._dayBoxWallMat = null;
    this._dayBoxEdgeMat?.dispose(); this._dayBoxEdgeMat = null;

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
    /** @type {Map<number, { mesh: THREE.Mesh, texture: THREE.CanvasTexture | null, url: string | null }>} */
    this._backboards = new Map();
    this._segment = "afternoon";
  }

  build() {
    this.disposeContent();
    this._layout = computeYearGridLayout(this.year);
    const topology = getYearTopology(this.year);

    this._mountBackboards();
    this.setScenicBackdropForSegment(this._segment);

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
   * @param {number} elapsed
   */
  update(_delta, elapsed) {
    pulseSpheres(elapsed);
  }

  /** Poster planes behind each month that has a configured scene (MONTH_SCENES). */
  _mountBackboards() {
    if (!this._layout) return;
    for (const monthIndex of Object.keys(MONTH_SCENES).map(Number)) {
      const cluster = this._layout.clusters.find((c) => c.monthIndex === monthIndex);
      if (!cluster) continue;
      const frame = clusterBackboardFrame(cluster);
      const geom = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0a1018,
        depthWrite: true,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = `ww-month-backboard-${monthIndex}`;
      mesh.renderOrder = -8;
      mesh.scale.set(frame.w, frame.h, 1);
      mesh.position.set(frame.cx, frame.cy, BACKBOARD_Z);
      this.root.add(mesh);
      this._backboards.set(monthIndex, { mesh, texture: null, url: null });
    }
  }

  _disposeBackboards() {
    for (const b of this._backboards.values()) {
      this.root.remove(b.mesh);
      b.mesh.geometry.dispose();
      if (b.mesh.material instanceof THREE.Material) b.mesh.material.dispose();
      b.texture?.dispose();
    }
    this._backboards.clear();
  }

  /**
   * Apply each configured month's day/night scene for the current segment.
   * @param {import("../inkling-core/timelineNode.js").DaySegment | string} segment
   */
  setScenicBackdropForSegment(segment) {
    this._segment = segment;
    for (const [monthIndex, b] of this._backboards) {
      const url = monthSceneUrl(monthIndex, segment);
      if (!url || url === b.url) continue;
      b.url = url;
      this._loadBackboardTexture(b, url);
    }
  }

  /**
   * @param {{ mesh: THREE.Mesh, texture: THREE.CanvasTexture | null, url: string | null }} b
   * @param {string} url
   */
  _loadBackboardTexture(b, url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (b.url !== url) return;
      b.texture?.dispose();
      const tex = buildMutedBackdropTexture(img);
      b.texture = tex;
      if (b.mesh.material instanceof THREE.MeshBasicMaterial) {
        b.mesh.material.map = tex;
        b.mesh.material.color.set(0xffffff);
        b.mesh.material.needsUpdate = true;
      }
    };
    img.onerror = () => {
      console.warn("[WordWeaverYearGrid] scenic backboard failed to load:", url);
      if (b.url === url) b.url = null;
    };
    img.src = url;
  }

  /** Legacy single-url setter — superseded by per-month MONTH_SCENES. @param {string} _url */
  setScenicBackdropImage(_url) {
    /* no-op: per-month config (MONTH_SCENES) drives backboard imagery now */
  }

  disposeContent() {
    this._disposeBackboards();

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

/** Crisp month backdrop for the day view — optional grayscale + dark scrim. */
function buildDayBackdropTexture(source, { grayscale = false, scrim = 0.2 } = {}) {
  const sw = /** @type {HTMLImageElement} */ (source).width || 1600;
  const sh = /** @type {HTMLImageElement} */ (source).height || 900;
  const w = Math.min(1920, sw);
  const h = Math.max(1, Math.round((w / sw) * sh));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (grayscale) ctx.filter = "grayscale(1)";
    ctx.drawImage(source, 0, 0, w, h);
    ctx.filter = "none";
    ctx.fillStyle = `rgba(0, 0, 0, ${scrim})`;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Day-view background theme + layout mode (persisted).
const DAY_THEME_KEY = "inkling-dayview-theme";
const DAY_MODE_KEY = "inkling-dayview-mode";
/** @returns {"day"|"night"|"bw"} */
function getDayTheme() {
  try { const v = localStorage.getItem(DAY_THEME_KEY); return v === "night" || v === "bw" ? v : "day"; } catch { return "day"; }
}
function setDayTheme(t) { try { localStorage.setItem(DAY_THEME_KEY, t); } catch { /* ignore */ } }
function getDayMode() {
  try { return localStorage.getItem(DAY_MODE_KEY) === "wheel" ? "wheel" : "full"; } catch { return "full"; }
}
function setDayMode(m) { try { localStorage.setItem(DAY_MODE_KEY, m); } catch { /* ignore */ } }
/** Theme → note-text base colour (boxes keep their category colour). */
function themeTextColor(theme) {
  void theme;
  return 0x111111; // black text across day / night / B&W
}

// ── Rough DAY VIEW (click-to-zoom prototype) ───────────────────────────────
const DAY_VIEW_SPHERE_GEO = new THREE.SphereGeometry(0.42, 22, 22);

/** Shared radial-gradient texture for the sphere glow aura (tinted per sprite). */
let _dayGlowTex = null;
function getDayGlowTexture() {
  if (_dayGlowTex) return _dayGlowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _dayGlowTex = new THREE.CanvasTexture(c);
  _dayGlowTex.needsUpdate = true;
  return _dayGlowTex;
}
// Taller timeline → more vertical space between notes now that the note text is
// larger beveled 3D text.
const DAY_VIEW_HEIGHT = 22;

/** Category/keyword → color for day-view time spheres (rough palette). */
const DAY_CATEGORY_COLORS = [
  [["alarm", "wake"], 0xe5484d],
  [["sleep", "rest", "wind down"], 0x6e56cf],
  [["workout", "exercise", "gym", "run"], 0x30a46c],
  [["nutrition", "meal", "food", "eat", "lunch", "dinner", "breakfast", "water"], 0xf5d90a],
  [["read", "study", "learn"], 0x0091ff],
  [["work", "task", "meeting", "deep", "zoom"], 0x00a2c7],
  [["social", "appointment", "appt", "birthday"], 0xd6409f]
];

function dayCategoryColor(category, text) {
  const hay = `${category || ""} ${text || ""}`.toLowerCase();
  for (const [keys, color] of DAY_CATEGORY_COLORS) {
    if (keys.some((k) => hay.includes(k))) return color;
  }
  return 0x8b8d98;
}

function parseHHMM(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return 12 * 60;
  return Math.max(0, Math.min(1439, Number(m[1]) * 60 + Number(m[2])));
}

function formatDayHeading(iso) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return iso;
  }
}

/**
 * Representative day ISO for a month: first day with notes, else the 15th.
 * @param {number} year
 * @param {number} monthIndex 0-11
 */
export function representativeDayIso(year, monthIndex) {
  const topo = getYearTopology(year);
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  let best = null;
  let bestCount = 0;
  for (const [iso, count] of Object.entries(topo.dayCounts)) {
    if (iso.startsWith(prefix) && count > bestCount) {
      bestCount = count;
      best = iso;
    }
  }
  return best ?? `${prefix}15`;
}

/**
 * Rough DAY VIEW: a vertical line of category-colored time-spheres for one day
 * (12am low → 11:59pm high) + a date heading, per-event time/text labels, and a
 * connecting line. Returns { group, dispose }.
 * @param {THREE.Scene} scene
 * @param {string} dayIso
 */
/** Word-wrap a string into lines of at most `maxChars` (hard-breaks long words). */
function wrapWords(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > maxChars) { lines.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function createDayView(scene, dayIso, opts = {}) {
  // opts: { camera, controls, segment, mode }. Back-compat: a string = segment.
  if (typeof opts === "string") opts = { segment: opts };
  const camera = opts.camera ?? null;
  const controls = opts.controls ?? null;
  const onRebuild = typeof opts.onRebuild === "function" ? opts.onRebuild : null;
  let mode = opts.mode || getDayMode(); // full stacked day (default) | scroll wheel
  const theme = getDayTheme();          // day | night | bw — background + text colour
  const themeText = themeTextColor(theme);
  const group = new THREE.Group();
  group.name = "ww-day-view";
  // Earliest-first so the day reads top→bottom by time.
  const events = [...getEventsForDate(dayIso)].sort((a, b) => parseHHMM(a.time) - parseHHMM(b.time));
  const textStyle = getTextStyle(); // user-chosen 3D look (chrome/neon/gold/…)
  void preloadReal3DFont(); // beveled 3D note text needs the typeface loaded
  /** @type {import("./Real3DText.js").Real3DText[]} */
  const textNodes = [];
  /** @type {Array<{ mesh: THREE.Mesh, mat: THREE.Material, tex?: THREE.Texture }>} */
  const labels = [];
  /** @type {THREE.Mesh[]} disposables (materials) */
  const spheres = [];
  /** @type {Array<{ group: THREE.Group, box: THREE.Mesh, baseY: number, event: any }>} */
  const cards = [];
  /** @type {Array<{ mesh: THREE.Mesh, y: number, event: any }>} kept for scene compat */
  const items = [];
  /** shared box + edge geometry, captured so dispose() can free them. */
  const dayBoxGeos = {};
  /** bucket index → header sprite mesh (Morning/Afternoon/Evening columns). */
  const colHeaders = {};
  const COLW = 9; // horizontal spacing between time-of-day columns
  let colHalfWidth = COLW;

  // NO white wall any more — the cosmic background shows through; one note's
  // animated box + centered text floats in the focused spot.

  // Date heading — a polished beveled title above the focused card.
  const hp = text3dParams(textStyle, 0xf8fafc);
  const heading3d = createReal3DText(formatDayHeading(dayIso), {
    fontSize: 1.2,
    depth: 0.4,
    color: hp.color,
    glowColor: hp.glowColor,
    metalness: hp.metalness,
    roughness: hp.roughness,
    emissiveIntensity: hp.emissiveIntensity
  });
  const headingGroup = heading3d.getGroup();
  headingGroup.position.set(0, 6.2, 0); // raised so the bigger column headers clear it
  headingGroup.layers.set(1);
  headingGroup.traverse((o) => o.layers.set(1));
  group.add(headingGroup);
  textNodes.push(heading3d);

  // SAMPLE: the month's scenic photo behind everything (light scrim for
  // readability). Easy to toggle off later if it competes with the text.
  let bgPhoto = null;
  {
    const monthIndex = (parseInt(dayIso.split("-")[1], 10) || 1) - 1;
    const url = monthSceneUrl(monthIndex, theme === "night" ? "night" : "day");
    if (url) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x141b2a, toneMapped: false });
      bgPhoto = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      bgPhoto.name = "ww-day-photo-bg";
      bgPhoto.scale.set(100, 70, 1);
      bgPhoto.position.set(0, 0, -12);
      bgPhoto.renderOrder = -10;
      bgPhoto.layers.set(1);
      group.add(bgPhoto);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = buildDayBackdropTexture(img, { grayscale: theme === "bw", scrim: theme === "night" ? 0.15 : 0.22 });
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      };
      img.onerror = () => { /* keep the dark placeholder */ };
      img.src = url;
    }
  }

  const BOX_Y = 1.9; // box sits above the centered text block

  if (!events.length) {
    const empty = createLabelSprite("No notes this day", {
      fontSize: "600 44px system-ui, sans-serif",
      fill: "#94a3b8",
      width: 768,
      height: 96,
      planeW: 5,
      planeH: 0.7
    });
    empty.mesh.position.set(0, 0.5, 0);
    group.add(empty.mesh);
    labels.push(empty);
  } else {
    // One CARD per note (box + glow + centered text). All cards sit in the same
    // focused spot; only the current one is visible — a wheel you step through.
    const BOX = 0.9;
    const boxGeo = new THREE.BoxGeometry(BOX, BOX, BOX);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    dayBoxGeos.boxGeo = boxGeo;
    dayBoxGeos.edgesGeo = edgesGeo;
    events.forEach((ev, idx) => {
      const card = new THREE.Group();
      card.name = `ww-day-card-${idx}`;
      const color = dayCategoryColor(ev.category, ev.text);

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color).multiplyScalar(0.5),
        emissiveIntensity: 0.75,
        roughness: 0.3,
        metalness: 0.2
      });
      const box = new THREE.Mesh(boxGeo, mat);
      box.position.set(0, BOX_Y, 0);
      const edges = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(0.35), transparent: true, opacity: 0.9
      }));
      box.add(edges);
      card.add(box);
      spheres.push(box, edges);

      // Glow aura behind the box.
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getDayGlowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      glow.scale.set(3.1, 3.1, 1);
      glow.position.set(0, BOX_Y, -0.1);
      glow.layers.set(1);
      card.add(glow);
      spheres.push(glow);

      // Centered note text below the box (Real3DText centers each line at x=0).
      // Box stays the category colour (differentiation); the TEXT honours the
      // paint-icon colour choice when set, else the category colour.
      const fullText = `${ev.time}  ${String(ev.text || ev.title || "").trim()}`;
      const lines = wrapWords(fullText, 20);
      const userTextColor = getTextColor();
      const finalTextColor = userTextColor != null ? userTextColor : themeText;
      // Keep the style's FINISH (metalness/depth/etc.) but force the COLOUR to
      // the theme/user choice, so day=black & night=gold hold even if a coloured
      // style (gold/chrome) is selected.
      const params = text3dParams(textStyle, finalTextColor);
      params.color = finalTextColor;
      params.glowColor = finalTextColor;
      const fontSize = 0.62;
      const lineH = 0.82;
      const startY = 0.45;
      lines.forEach((line, li) => {
        const t3d = createReal3DText(line, {
          fontSize, ...params, depth: Math.min(params.depth ?? 0.2, 0.16)
        });
        const tg = t3d.getGroup();
        tg.position.set(0, startY - li * lineH, 0.08);
        tg.layers.set(1);
        tg.traverse((o) => o.layers.set(1));
        card.add(tg);
        textNodes.push(t3d);
      });

      // Time-of-day bucket: 0 morning (12am–12pm), 1 afternoon (12–6pm), 2 evening (6pm–12am).
      const mm = parseHHMM(ev.time);
      const bucket = mm < 720 ? 0 : mm < 1080 ? 1 : 2;

      card.visible = true;
      group.add(card);
      cards.push({ group: card, box, baseY: BOX_Y, event: ev, lines: lines.length, bucket });
      items.push({ mesh: box, y: 0, event: ev });
    });

    // Column headers for whichever time buckets have notes.
    const HEADER_LABELS = ["Morning", "Afternoon", "Evening"];
    const present = [false, false, false];
    for (const c of cards) present[c.bucket] = true;
    for (let b = 0; b < 3; b++) {
      if (!present[b]) continue;
      const lab = createLabelSprite(HEADER_LABELS[b], {
        fontSize: "800 116px system-ui, sans-serif", fill: "#c7d2fe", width: 960, height: 256, planeW: 6.8, planeH: 1.86
      });
      lab.mesh.layers.set(1);
      lab.mesh.visible = false; // shown in full layout only
      group.add(lab.mesh);
      labels.push(lab);
      colHeaders[b] = lab.mesh;
    }
  }

  group.layers.set(1);
  group.traverse((o) => o.layers.set(1));
  scene.add(group);

  const _reLayer = () => group.traverse((o) => o.layers.set(1));
  if (typeof window !== "undefined") {
    window.addEventListener("wordweaver:font-ready", _reLayer);
  }

  // --- two layouts: FULL (all notes stacked, box-above-text) + WHEEL (one at a
  //     time, ‹ › arrows). Default is FULL; a 2D toggle switches between them. ---
  let current = 0;
  let stackBottom = 0;
  const STACK_TOP = 2.6; // lowered so the bigger headers sit between title + cards
  let modeBar = null, arrowBar = null, domLabel = null, fullBtn = null, wheelBtn = null;

  function layoutFull() {
    // Time-of-day COLUMNS (Morning / Afternoon / Evening) side by side; present
    // columns are centered. Keeps each stack short so a busy day stays readable.
    const order = [0, 1, 2].filter((b) => cards.some((c) => c.bucket === b));
    const P = order.length || 1;
    const colX = {};
    order.forEach((b, i) => { colX[b] = (i - (P - 1) / 2) * COLW; });
    colHalfWidth = (P - 1) / 2 * COLW + COLW * 0.5;

    let maxDepth = 0;
    for (const b of order) {
      if (colHeaders[b]) {
        colHeaders[b].visible = true;
        colHeaders[b].position.set(colX[b], STACK_TOP + 1.4, 0);
      }
      let y = STACK_TOP;
      const GAP = 1.05;
      for (const c of cards.filter((cc) => cc.bucket === b)) {
        const top = BOX_Y + 0.55;
        const bottom = 0.45 - (c.lines - 1) * 0.82 - 0.5;
        const h = top - bottom;
        c.group.position.set(colX[b], y - top, 0);
        c.group.visible = true;
        c.box.position.set(0, c.baseY, 0);
        y -= h + GAP;
      }
      maxDepth = Math.max(maxDepth, STACK_TOP - y);
    }
    stackBottom = STACK_TOP - maxDepth;
  }
  function layoutWheel() {
    for (const b of Object.keys(colHeaders)) colHeaders[b].visible = false;
    cards.forEach((c, idx) => {
      c.group.position.set(0, 0, 0);
      c.group.visible = idx === current;
      c.box.position.set(0, c.baseY, 0);
    });
  }
  function frame() {
    if (!camera || !controls) return;
    camera.up.set(0, 1, 0);
    if (mode === "full" && cards.length) {
      const top = 7.2, bottom = stackBottom; // include the raised date heading
      const cy = (top + bottom) / 2;
      const contentH = Math.max(7, top - bottom);
      const contentW = Math.max(10, 2 * (colHalfWidth + 3.5)); // include text width
      const fovR = (camera.fov || 50) * Math.PI / 180;
      const aspect = camera.aspect || 1.6;
      const distH = (contentH / 2) / Math.tan(fovR / 2);
      const distW = (contentW / 2) / (Math.tan(fovR / 2) * aspect);
      // Pull back to fit BOTH dimensions, plus a margin so everything shows.
      const dist = Math.max(distH, distW) + 5;
      if (controls.maxDistance < dist + 5) controls.maxDistance = dist + 60;
      controls.target.set(0, cy, 0);
      camera.position.set(0, cy, dist);
    } else {
      controls.target.set(0, 1.0, 0);
      camera.position.set(0, 1.0, 12);
    }
    camera.lookAt(controls.target);
    controls.update();
  }
  function syncLabel() {
    if (!domLabel || !cards.length) return;
    const ev = cards[current].event;
    const title = String(ev.text || ev.title || "Note").trim();
    domLabel.textContent = `${ev.time} · ${title.length > 26 ? title.slice(0, 25) + "…" : title}  (${current + 1}/${cards.length})`;
  }
  function updateUI() {
    const paint = (btn, on) => { if (btn) { btn.style.background = on ? "#312e81" : "transparent"; btn.style.color = on ? "#e0e7ff" : "#94a3b8"; } };
    paint(fullBtn, mode === "full");
    paint(wheelBtn, mode === "wheel");
    if (arrowBar) arrowBar.style.display = mode === "wheel" ? "flex" : "none";
    syncLabel();
  }
  function select(i) {
    if (!cards.length) return;
    current = ((i % cards.length) + cards.length) % cards.length;
    if (mode === "wheel") cards.forEach((c, idx) => { c.group.visible = idx === current; });
    syncLabel();
  }
  function step(dir) { select(current + (dir < 0 ? -1 : 1)); }
  function setMode(m) {
    mode = m === "wheel" ? "wheel" : "full";
    setDayMode(mode);
    if (mode === "wheel") layoutWheel(); else layoutFull();
    frame();
    updateUI();
  }

  if (typeof document !== "undefined" && cards.length) {
    // Mode toggle — sits with the calendar's 2D/3D controls (top center).
    modeBar = document.createElement("div");
    modeBar.id = "ww-day-modebar";
    modeBar.style.cssText =
      "position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:10261;display:flex;gap:6px;" +
      "background:rgba(8,12,22,0.74);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,0.45);border-radius:999px;" +
      "padding:5px 6px;box-shadow:0 6px 20px rgba(0,0,0,0.4)";
    fullBtn = document.createElement("button"); fullBtn.textContent = "📆 Full day";
    wheelBtn = document.createElement("button"); wheelBtn.textContent = "🎡 Scroll";
    for (const b of [fullBtn, wheelBtn]) {
      b.style.cssText = "border:0;border-radius:999px;padding:7px 14px;font:700 12px system-ui;cursor:pointer;background:transparent;color:#94a3b8";
    }
    fullBtn.addEventListener("click", () => setMode("full"));
    wheelBtn.addEventListener("click", () => setMode("wheel"));
    modeBar.append(fullBtn, wheelBtn);

    // Background theme: Day (bright + black text) / Night (dark + gold text) /
    // B&W (grayscale + black text). Switching rebuilds the day view.
    const divider = document.createElement("div");
    divider.style.cssText = "width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 3px";
    modeBar.append(divider);
    for (const [t, label] of [["day", "☀️ Day"], ["night", "🌙 Night"], ["bw", "⬜ B&W"]]) {
      const tb = document.createElement("button");
      tb.dataset.theme = t;
      tb.textContent = label;
      tb.style.cssText =
        "border:0;border-radius:999px;padding:7px 12px;font:700 12px system-ui;cursor:pointer;" +
        `background:${theme === t ? "#312e81" : "transparent"};color:${theme === t ? "#e0e7ff" : "#94a3b8"}`;
      tb.addEventListener("click", () => { setDayTheme(t); if (onRebuild) onRebuild(); });
      modeBar.append(tb);
    }
    document.body.appendChild(modeBar);

    // Wheel arrows (shown only in scroll mode).
    arrowBar = document.createElement("div");
    arrowBar.id = "ww-day-carousel";
    arrowBar.style.cssText =
      "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:10260;display:none;align-items:center;gap:14px;" +
      "background:rgba(8,12,22,0.72);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,0.45);border-radius:999px;" +
      "padding:8px 14px;color:#e6ebff;font:700 13px system-ui;box-shadow:0 8px 28px rgba(0,0,0,0.45)";
    const prev = document.createElement("button"); prev.textContent = "‹"; prev.title = "Earlier note";
    const next = document.createElement("button"); next.textContent = "›"; next.title = "Later note";
    for (const b of [prev, next]) {
      b.style.cssText = "background:#312e81;color:#e0e7ff;border:0;border-radius:50%;width:38px;height:38px;font-size:20px;line-height:1;cursor:pointer;flex:0 0 auto";
    }
    domLabel = document.createElement("div");
    domLabel.style.cssText = "min-width:150px;max-width:300px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    arrowBar.append(prev, domLabel, next);
    document.body.appendChild(arrowBar);
  }

  // Initial layout (full day) + camera frame.
  if (mode === "wheel") layoutWheel(); else layoutFull();
  frame();
  updateUI();

  /** Animate one box (spin + planar drift) around its card-local base. */
  function animateBox(c, elapsed, ph) {
    const b = c.box;
    b.rotation.y = elapsed * 0.5 + ph;
    b.rotation.x = Math.sin(elapsed * 0.4 + ph) * 0.18;
    b.position.x = Math.sin(elapsed * 0.8 + ph) * 0.34; // shift on the plane, in its spot
    b.position.z = Math.cos(elapsed * 0.8 + ph) * 0.34;
    b.position.y = c.baseY + Math.sin(elapsed * 1.1 + ph) * 0.07;
  }

  return {
    group,
    items,
    select,
    step,
    setMode,
    get mode() { return mode; },
    get current() { return current; },
    get count() { return cards.length; },
    update(elapsed) {
      if (!cards.length) return;
      if (mode === "wheel") animateBox(cards[current], elapsed, 0);
      else cards.forEach((c, i) => animateBox(c, elapsed, i * 0.7));
    },
    dispose() {
      if (typeof window !== "undefined") {
        window.removeEventListener("wordweaver:font-ready", _reLayer);
      }
      modeBar?.remove();
      arrowBar?.remove();
      for (const t of textNodes) t.dispose();
      scene.remove(group);
      for (const s of spheres) {
        if (s.material instanceof THREE.Material) s.material.dispose();
      }
      for (const l of labels) {
        l.mesh.geometry.dispose();
        l.mat.dispose();
        l.tex?.dispose();
      }
      dayBoxGeos.boxGeo?.dispose();
      dayBoxGeos.edgesGeo?.dispose();
      if (bgPhoto) {
        bgPhoto.geometry.dispose();
        if (bgPhoto.material instanceof THREE.Material) {
          bgPhoto.material.map?.dispose();
          bgPhoto.material.dispose();
        }
      }
    }
  };
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
