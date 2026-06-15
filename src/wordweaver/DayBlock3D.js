import * as THREE from "three";
import { CategoryColors, getCategoryColor } from "./timelineModel.js";
import { classifyEvent } from "../calendar/ai/AIBrain.js";

const PLANE_W = 1.2;
const PLANE_H = 1.6;
const NOTE_W = 1.1;
const NOTE_H = 1.4;
const LINE_STEP = 0.22;
const MAX_SURFACE_LINES = 5;

/** @type {{
 *   panelGeo: THREE.PlaneGeometry,
 *   edgeGeo: THREE.PlaneGeometry,
 *   noteGeo: THREE.PlaneGeometry,
 *   panelMat: THREE.MeshPhysicalMaterial,
 *   noteMat: THREE.MeshBasicMaterial
 * } | null} */
let _sharedResources = null;

/**
 * Shared geometries/materials for year-scale day blocks.
 */
export function getSharedDayBlockResources() {
  if (_sharedResources) return _sharedResources;

  _sharedResources = {
    panelGeo: new THREE.PlaneGeometry(PLANE_W, PLANE_H),
    edgeGeo: new THREE.PlaneGeometry(PLANE_W * 1.03, PLANE_H * 1.03),
    noteGeo: new THREE.PlaneGeometry(NOTE_W, NOTE_H),
    panelMat: new THREE.MeshPhysicalMaterial({
      color: "#0a0a0a",
      transparent: true,
      opacity: 0.92,
      roughness: 0.15,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    }),
    noteMat: new THREE.MeshBasicMaterial({
      color: "#111111",
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    })
  };
  return _sharedResources;
}

/** @deprecated No-op — crack shaders removed. */
export function updateSharedCrackTime() {}

/**
 * Instanced day panels (shared material).
 */
export class DayBlockInstancedPanels {
  constructor(capacity = 400) {
    const shared = getSharedDayBlockResources();
    this.capacity = capacity;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(shared.panelGeo, shared.panelMat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this._matrix = new THREE.Matrix4();
    this._color = new THREE.Color();
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3
    );
  }

  setInstance(index, matrix, tintHex) {
    this.mesh.setMatrixAt(index, matrix);
    if (this.mesh.instanceColor && tintHex) {
      this._color.set(tintHex);
      this.mesh.setColorAt(index, this._color);
    }
  }

  add(matrix, tintHex) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.setInstance(i, matrix, tintHex);
    return i;
  }

  finalize() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get object3d() {
    return this.mesh;
  }
}

/**
 * @param {string} line
 * @param {string} color
 * @param {number} w
 * @param {number} h
 */
function createLabelTexture(line, color, w = 256, h = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(line.slice(0, 42), 8, h * 0.5, w - 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * @param {string} icon
 * @param {string} text
 * @param {string} time
 * @param {string} color
 */
function createEventSprite(icon, text, time, color) {
  const line = `${icon} ${time ? time + " " : ""}${text}`.trim();
  const tex = createLabelTexture(line, color, 280, 56);
  if (!tex) return null;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.95
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.95, 0.2, 1);
  sprite.userData._tex = tex;
  return sprite;
}

/**
 * @param {string} summary
 * @param {string} color
 */
function createSummarySprite(summary, color) {
  const tex = createLabelTexture(summary, color, 300, 48);
  if (!tex) return null;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1, 0.16, 1);
  sprite.userData._tex = tex;
  return sprite;
}

/**
 * @param {{ category?: string, text?: string }[]} events
 */
function buildDaySummary(events) {
  if (!events.length) return "";
  const cats = events.map((e) => e.category ?? "personal");
  const counts = {};
  for (const c of cats) counts[c] = (counts[c] ?? 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "personal";
  const label = dominant.charAt(0).toUpperCase() + dominant.slice(1);
  return `${events.length} · ${label}`;
}

/**
 * @typedef {{
 *   time?: string,
 *   text: string,
 *   category?: string,
 *   kind?: string,
 *   alertId?: string,
 *   icon?: string,
 *   color?: string,
 *   priority?: string
 * }} DayBlockEvent
 * }}

/**
 * Clean glass day tile with readable note surface and billboarding labels.
 */
export class DayBlock3D {
  /**
   * @param {{
   *   day: number,
   *   dateIso: string,
   *   events?: DayBlockEvent[],
   *   glowColor?: string,
   *   isToday?: boolean,
   *   useSharedMaterials?: boolean,
   *   monthIndex?: number
   * }} opts
   */
  constructor(opts) {
    this.day = opts.day;
    this.dateIso = opts.dateIso;
    this.monthIndex = opts.monthIndex ?? 0;
    this.events = this._normalizeEvents(opts.events ?? []);
    this._useShared = opts.useSharedMaterials !== false;
    this._near = false;
    this._baseScale = 1;
    this._targetScale = 1;
    this._glowIntensity = 0.25;
    this._sprites = [];

    const glowHex = opts.glowColor ?? this._dominantGlowColor();
    const glowColor = new THREE.Color(glowHex);

    this.group = new THREE.Group();
    this.group.name = `day-block-${opts.dateIso}`;
    this.group.userData.dayBlock = this;

    const shared = this._useShared ? getSharedDayBlockResources() : null;

    const panelGeo = shared ? shared.panelGeo : new THREE.PlaneGeometry(PLANE_W, PLANE_H);
    const panelMat = shared
      ? shared.panelMat
      : new THREE.MeshPhysicalMaterial({
          color: "#0a0a0a",
          transparent: true,
          opacity: 0.92,
          roughness: 0.15,
          metalness: 0.05,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide
        });
    this.panel = new THREE.Mesh(panelGeo, panelMat);
    this.panel.renderOrder = 1;
    this._ownsPanelMat = !shared;
    this.group.add(this.panel);

    const noteGeo = shared ? shared.noteGeo : new THREE.PlaneGeometry(NOTE_W, NOTE_H);
    const noteMat = shared
      ? shared.noteMat
      : new THREE.MeshBasicMaterial({
          color: "#111111",
          transparent: true,
          opacity: 0.85,
          depthWrite: false
        });
    this.noteSurface = new THREE.Mesh(noteGeo, noteMat);
    this.noteSurface.position.z = 0.006;
    this.noteSurface.renderOrder = 2;
    this._ownsNoteMat = !shared;
    this.group.add(this.noteSurface);

    const edgeGeo = shared ? shared.edgeGeo : new THREE.PlaneGeometry(PLANE_W * 1.03, PLANE_H * 1.03);
    this._ownsEdgeGeo = !shared;
    this.eventGlow = new THREE.Mesh(edgeGeo, new THREE.MeshStandardMaterial({
      color: glowHex,
      emissive: glowColor,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      depthWrite: false
    }));
    this.eventGlow.position.z = -0.006;
    this.eventGlow.renderOrder = 0;
    this.edgeMat = this.eventGlow.material;
    this.group.add(this.eventGlow);

    this.surfaceLabels = new THREE.Group();
    this.surfaceLabels.position.z = 0.02;
    this.group.add(this.surfaceLabels);

    this.dayLabel = createEventSprite("📅", String(this.day), "", "#e2e8f0");
    if (this.dayLabel) {
      this.dayLabel.scale.set(0.22, 0.12, 1);
      this.dayLabel.position.set(-NOTE_W * 0.38, NOTE_H * 0.42, 0);
      this.surfaceLabels.add(this.dayLabel);
    }

    this._rebuildSurfaceLabels();

    if (opts.isToday) {
      this.edgeMat.emissiveIntensity = 0.38;
    }
  }

  /**
   * @param {DayBlockEvent[]} events
   * @returns {DayBlockEvent[]}
   */
  _normalizeEvents(events) {
    return events.map((ev) => {
      const classified = classifyEvent(ev.text ?? "");
      const cat =
        ev.category === "errand" ? "errands" : ev.category ?? classified.category;
      const kind = ev.kind ?? "timeline";
      let icon = ev.icon ?? classified.icon;
      if (ev.alertId || kind === "alarm" || kind === "reminder") {
        icon = "⏰";
      } else if (kind === "appointment") {
        icon = "📅";
      }
      return {
        ...ev,
        category: cat,
        icon,
        color: ev.color ?? classified.color ?? getCategoryColor(cat),
        priority: ev.priority ?? classified.priority
      };
    });
  }

  _dominantGlowColor() {
    const ev = this.events[0];
    if (!ev) return "#4da6ff";
    return ev.color ?? getCategoryColor(ev.category ?? "personal");
  }

  _rebuildSurfaceLabels() {
    for (const sp of this._sprites) {
      sp.material?.map?.dispose();
      sp.material?.dispose();
      this.surfaceLabels.remove(sp);
    }
    this._sprites = [];

    const summary = buildDaySummary(this.events);
    if (summary) {
      const dom = this._dominantGlowColor();
      const sumSp = createSummarySprite(summary, dom);
      if (sumSp) {
        sumSp.position.set(0, NOTE_H * 0.38, 0);
        this.surfaceLabels.add(sumSp);
        this._sprites.push(sumSp);
      }
    }

    const slice = this.events.slice(0, MAX_SURFACE_LINES);
    slice.forEach((ev, i) => {
      const sp = createEventSprite(
        ev.icon ?? "•",
        ev.text,
        ev.time ?? "",
        ev.color ?? getCategoryColor(ev.category ?? "personal")
      );
      if (!sp) return;
      sp.position.set(0, NOTE_H * 0.28 - i * LINE_STEP, 0.01 * i);
      this.surfaceLabels.add(sp);
      this._sprites.push(sp);
    });
  }

  /**
   * @param {DayBlockEvent[]} events
   * @param {string} [glowColor]
   */
  setEvents(events, glowColor) {
    this.events = this._normalizeEvents(events);
    const hex = glowColor ?? this._dominantGlowColor();
    const c = new THREE.Color(hex);
    this.edgeMat.color.copy(c);
    this.edgeMat.emissive.copy(c);
    this._rebuildSurfaceLabels();
  }

  /**
   * @param {boolean} near
   */
  setProximity(near) {
    this._near = near;
    this._targetScale = near ? 1.08 : 1;
    this._glowIntensity = near ? 0.42 : 0.25;
    for (const sp of this._sprites) {
      sp.material.opacity = near ? 1 : 0.88;
    }
  }

  /**
   * @param {number} delta
   * @param {number} _elapsed
   * @param {THREE.Camera} [camera]
   */
  update(delta, _elapsed, camera) {
    const lerp = 1 - Math.pow(0.001, delta);
    this._baseScale += (this._targetScale - this._baseScale) * lerp;
    this.group.scale.setScalar(this._baseScale);

    const targetGlow = this._glowIntensity;
    this.edgeMat.emissiveIntensity +=
      (targetGlow - this.edgeMat.emissiveIntensity) * Math.min(1, delta * 8);

    if (camera) {
      for (const sp of this._sprites) {
        sp.quaternion.copy(camera.quaternion);
      }
      if (this.dayLabel) {
        this.dayLabel.quaternion.copy(camera.quaternion);
      }
    }
  }

  dispose() {
    if (this._ownsPanelMat) this.panel.material.dispose();
    if (!this._useShared) this.panel.geometry.dispose();
    if (this._ownsNoteMat) this.noteSurface.material.dispose();
    if (!this._useShared) this.noteSurface.geometry.dispose();
    if (this._ownsEdgeGeo) this.eventGlow.geometry.dispose();
    this.edgeMat.dispose();

    for (const sp of this._sprites) {
      sp.material?.map?.dispose();
      sp.material?.dispose();
    }
    this._sprites = [];

    if (this.dayLabel) {
      this.dayLabel.material?.map?.dispose();
      this.dayLabel.material?.dispose();
    }
  }
}

export { DayBlock3D as DayBlock };
