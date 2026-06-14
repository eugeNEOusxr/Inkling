import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

/** Selectable 3D typefaces (key → JSON file under /fonts). */
export const FONT_FILES = {
  helvetiker: "helvetiker_regular.typeface.json",
  "helvetiker-bold": "helvetiker_bold.typeface.json",
  optimer: "optimer_regular.typeface.json",
  gentilis: "gentilis_bold.typeface.json",
  "droid-serif": "droid_serif_regular.typeface.json"
};
export const DEFAULT_FONT = "helvetiker";
export const AVAILABLE_FONTS = Object.keys(FONT_FILES);

/** @type {Map<string, import("three/examples/jsm/loaders/FontLoader.js").Font>} */
const fontCache = new Map();
/** @type {Map<string, Promise<import("three/examples/jsm/loaders/FontLoader.js").Font | null>>} */
const fontPromises = new Map();
let fontLoadFailed = false;

function normFontKey(key) {
  return FONT_FILES[key] ? key : DEFAULT_FONT;
}

function fontCandidateUrls(file) {
  const urls = [];
  if (typeof window !== "undefined" && window.location?.href) {
    try { urls.push(new URL(`fonts/${file}`, window.location.href).href); } catch { /* ignore */ }
    const origin = window.location.origin;
    if (origin && origin !== "null") urls.push(`${origin}/fonts/${file}`);
  }
  urls.push(`/fonts/${file}`, `./fonts/${file}`);
  return [...new Set(urls)];
}

async function loadFontFile(file) {
  const loader = new FontLoader();
  let lastError = null;
  for (const url of fontCandidateUrls(file)) {
    try {
      return await loader.loadAsync(url);
    } catch (err) {
      lastError = err;
      console.warn("[Real3DText] font load failed:", url, err);
    }
  }
  throw lastError ?? new Error("No font URLs available");
}

/** Load (and cache) a typeface by key. @param {string} [key] */
export function loadFont(key = DEFAULT_FONT) {
  const k = normFontKey(key);
  if (fontCache.has(k)) return Promise.resolve(fontCache.get(k));
  if (fontPromises.has(k)) return fontPromises.get(k);
  const p = loadFontFile(FONT_FILES[k])
    .then((font) => {
      fontCache.set(k, font);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wordweaver:font-ready"));
      return font;
    })
    .catch((err) => {
      console.error("[Real3DText] font path failed:", k, err);
      if (k === DEFAULT_FONT) {
        fontLoadFailed = true;
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("wordweaver:font-failed"));
      }
      return null;
    });
  fontPromises.set(k, p);
  return p;
}

/** Already-loaded Font for a key, or null. @param {string} [key] */
export function getLoadedFont(key = DEFAULT_FONT) {
  return fontCache.get(normFontKey(key)) ?? null;
}

/** Back-compat: preload (default) typeface. @param {string} [key] */
export function preloadReal3DFont(key = DEFAULT_FONT) {
  return loadFont(key);
}

export function isReal3DFontReady() {
  return fontCache.has(DEFAULT_FONT);
}

export function didReal3DFontFail() {
  return fontLoadFailed;
}

/**
 * @param {{
 *   color?: number,
 *   glowColor?: number,
 *   metalness?: number,
 *   roughness?: number,
 *   emissiveIntensity?: number,
 *   wireframe?: boolean
 * }} params
 */
export function createTextPbrMaterial(params) {
  const color = params.color ?? 0x38bdf8;
  const emissive = new THREE.Color(params.glowColor ?? color);
  const metalness = params.metalness ?? 0.85;
  const roughness = params.roughness ?? 0.28;
  const emissiveIntensity = params.emissiveIntensity ?? 0.45;

  if (metalness >= 0.92) {
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity,
      envMapIntensity: 1.5,
      wireframe: Boolean(params.wireframe)
    });
  }

  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
    wireframe: Boolean(params.wireframe)
  });
}

/**
 * @param {string} text
 * @param {import("three/examples/jsm/loaders/FontLoader.js").Font} font
 * @param {{
 *   size?: number,
 *   depth?: number,
 *   bevelEnabled?: boolean,
 *   curveSegments?: number
 * }} opts
 */
export function buildTextGeometry(text, font, opts = {}) {
  const safe = String(text || " ").trim() || " ";
  const size = Math.max(0.08, opts.size ?? 0.5);
  const depth = Math.max(0.02, opts.depth ?? 0.06);
  const geometry = new TextGeometry(safe, {
    font,
    size,
    depth,
    curveSegments: opts.curveSegments ?? 8,
    bevelEnabled: opts.bevelEnabled !== false,
    bevelThickness: depth * 0.16,
    bevelSize: depth * 0.09,
    bevelSegments: 2
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    const cx = (box.max.x + box.min.x) * 0.5;
    const cy = (box.max.y + box.min.y) * 0.5;
    const cz = (box.max.z + box.min.z) * 0.5;
    geometry.translate(-cx, -cy, -cz);
  }
  return geometry;
}

/**
 * Readable label when typeface JSON is not available (Android / offline).
 * @param {string} text
 * @param {object} options
 */
function buildCanvasLabelMesh(text, options = {}) {
  const label = String(text || "?").trim() || "?";
  const fontSize = Math.max(0.12, options.fontSize ?? 0.5);
  const colorHex = `#${(options.color ?? 0x38bdf8).toString(16).padStart(6, "0")}`;
  const glowHex = `#${(options.glowColor ?? options.color ?? 0x7dd3fc).toString(16).padStart(6, "0")}`;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const pad = 24;
  const fontPx = Math.round((isMobileWordWeaver() ? 80 : 64) + fontSize * (isMobileWordWeaver() ? 52 : 40));
  const weight = String(options.fontWeight ?? "700");
  ctx.font = `${weight} ${fontPx}px Outfit, Arial, sans-serif`;
  const metrics = ctx.measureText(label);
  canvas.width = Math.ceil(metrics.width + pad * 2);
  canvas.height = Math.ceil(fontPx * 1.35 + pad);
  ctx.font = `${weight} ${fontPx}px Outfit, Arial, sans-serif`;
  ctx.fillStyle = "rgba(6,10,20,0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = glowHex;
  ctx.lineWidth = 4;
  ctx.strokeText(label, pad, canvas.height * 0.72);
  ctx.fillStyle = colorHex;
  ctx.fillText(label, pad, canvas.height * 0.72);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const aspect = canvas.width / canvas.height;
  const h = fontSize * 0.95;
  const w = h * aspect;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    metalness: options.metalness ?? 0.2,
    roughness: options.roughness ?? 0.45,
    emissive: new THREE.Color(options.glowColor ?? options.color ?? 0x7dd3fc),
    emissiveIntensity: (options.emissiveIntensity ?? 0.5) * 0.6
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.type = "weave-canvas-text";
  mesh.userData.canvasTexture = texture;
  return { mesh, geometry, material, texture };
}

/**
 * Standalone extruded text in world space — canvas fallback until typeface loads.
 */
export class Real3DText {
  /**
   * @param {string} text
   * @param {{
   *   fontSize?: number,
   *   color?: number,
   *   glowColor?: number,
   *   metalness?: number,
   *   roughness?: number,
   *   emissiveIntensity?: number,
   *   depth?: number,
   *   wireframe?: boolean,
   *   position?: THREE.Vector3,
   *   rotation?: THREE.Euler
   * }} [options]
   */
  constructor(text, options = {}) {
    this.text = text;
    this.options = options;
    this.group = new THREE.Group();
    this.meshes = [];
    this.glowMeshes = [];
    this._geometries = [];
    this._materials = [];
    this._textures = [];
    this._disposed = false;
    this._usingFallback = false;

    if (options.position) this.group.position.copy(options.position);
    if (options.rotation) this.group.rotation.copy(options.rotation);

    this._mountText();
  }

  _mountText() {
    if (this._disposed) return;
    const key = this.options.font || DEFAULT_FONT;
    if (getLoadedFont(key)) {
      this._clearMeshes();
      this._buildExtrudedMesh();
      return;
    }
    // Show a readable canvas label until the chosen typeface loads, then upgrade.
    this._clearMeshes();
    this._buildCanvasFallback();
    void loadFont(key).then((font) => {
      if (this._disposed || !font) return;
      this._clearMeshes();
      this._buildExtrudedMesh();
    });
  }

  _clearMeshes() {
    this._geometries.forEach((g) => g.dispose());
    this._materials.forEach((m) => m.dispose());
    this._textures.forEach((t) => t.dispose());
    this._geometries = [];
    this._materials = [];
    this._textures = [];
    this.meshes = [];
    this.glowMeshes = [];
    this.group.clear();
  }

  _buildExtrudedMesh() {
    const font = getLoadedFont(this.options.font || DEFAULT_FONT);
    if (!font) return;
    this._usingFallback = false;
    const size = Math.max(0.12, this.options.fontSize ?? 0.5);
    const depth = this.options.depth ?? size * 0.12;
    const geometry = buildTextGeometry(this.text, font, {
      size,
      depth,
      bevelEnabled: true
    });
    const material = createTextPbrMaterial({
      color: this.options.color ?? 0x38bdf8,
      glowColor: this.options.glowColor ?? this.options.color ?? 0x7dd3fc,
      metalness: this.options.metalness ?? 0.88,
      roughness: this.options.roughness ?? 0.25,
      emissiveIntensity: this.options.emissiveIntensity ?? 0.5,
      wireframe: this.options.wireframe
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = "weave-styled-text";

    // Optional black contour outline (inverted-hull). Off by default — it muddied
    // the glyphs; opt in with `outline: true`.
    if (this.options.outline === true) {
      const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
      const outline = new THREE.Mesh(geometry, outlineMat);
      outline.scale.multiplyScalar(this.options.outlineScale ?? 1.08);
      outline.userData.type = "weave-text-outline";
      this.meshes.push(outline);
      this._materials.push(outlineMat);
      this.group.add(outline);
    }

    this.meshes.push(mesh);
    this._geometries.push(geometry);
    this._materials.push(material);
    this.group.add(mesh);
  }

  _buildCanvasFallback() {
    this._usingFallback = true;
    const { mesh, geometry, material, texture } = buildCanvasLabelMesh(this.text, this.options);
    mesh.userData.type = "weave-styled-text";
    this.meshes.push(mesh);
    this._geometries.push(geometry);
    this._materials.push(material);
    this._textures.push(texture);
    this.group.add(mesh);
  }

  getGroup() {
    return this.group;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotation(x, y, z) {
    this.group.rotation.set(x, y, z);
  }

  updateText(newText, newOptions = {}) {
    this.dispose();
    this._disposed = false;
    this.text = newText;
    Object.assign(this.options, newOptions);
    this.group = new THREE.Group();
    this.meshes = [];
    this.glowMeshes = [];
    this._mountText();
  }

  animatePulse(intensity = 0.5) {
    const time = Date.now() * 0.001;
    const pulse = 0.5 + Math.sin(time * 2) * intensity * 0.5;
    this.meshes.forEach((m) => {
      if (m.material && "emissiveIntensity" in m.material) {
        m.material.emissiveIntensity = (this.options.emissiveIntensity ?? 0.5) * pulse;
      }
    });
  }

  dispose() {
    this._disposed = true;
    this._clearMeshes();
  }
}

/**
 * @param {string} text
 * @param {object} options
 * @returns {Real3DText}
 */
export function createReal3DText(text, options) {
  return new Real3DText(text, options);
}
