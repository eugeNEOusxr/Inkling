import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { AtomGlyph3D } from "./AtomGlyph3D.js";
import { formatTimelineDisplayTime, getCategoryColor } from "../timelineModel.js";

export const STAIR_STEP_Y = 0.45;
export const STAIR_STEP_Z = -0.1;
export const STAIR_BASE_Y = 1.2;

/** @type {import("three/examples/jsm/loaders/FontLoader.js").Font | null} */
let timelineFont = null;
/** @type {Promise<import("three/examples/jsm/loaders/FontLoader.js").Font | null> | null} */
let timelineFontPromise = null;

/**
 * @returns {Promise<import("three/examples/jsm/loaders/FontLoader.js").Font | null>}
 */
export function ensureTimelineFont() {
  if (timelineFont) return Promise.resolve(timelineFont);
  if (timelineFontPromise) return timelineFontPromise;

  const urls = [
    "/fonts/helvetiker_regular.typeface.json",
    "/vendor/three/examples/fonts/helvetiker_regular.typeface.json"
  ];
  const loader = new FontLoader();

  timelineFontPromise = (async () => {
    for (const url of urls) {
      try {
        timelineFont = await loader.loadAsync(url);
        return timelineFont;
      } catch {
        /* try next */
      }
    }
    console.warn("[TimelineEntry3D] font load failed");
    return null;
  })();

  return timelineFontPromise;
}

/**
 * @param {string} entryColor
 */
function createTextMaterial(entryColor) {
  const color = new THREE.Color(entryColor);
  const emissive = color.clone().multiplyScalar(0.55);
  return new THREE.MeshPhysicalMaterial({
    color: entryColor,
    emissive,
    emissiveIntensity: 1.35,
    metalness: 0.55,
    roughness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 1.0
  });
}

/**
 * @param {string} text
 * @param {import("three/examples/jsm/loaders/FontLoader.js").Font} font
 * @param {string} entryColor
 */
function makeExtrudedTextMesh(text, font, entryColor) {
  const textString = String(text || " ").slice(0, 120);
  const geometry = new TextGeometry(textString, {
    font,
    size: 0.22,
    depth: 0.05,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.005,
    bevelSegments: 3
  });
  geometry.computeBoundingBox();

  return new THREE.Mesh(geometry, createTextMaterial(entryColor));
}

/**
 * Single Depth Staircase entry: atom → timestamp → text (extruded 3D).
 */
export class TimelineEntry3D {
  /**
   * @param {THREE.Group} parent
   * @param {import("../timelineModel.js").TimelineEntryRecord} entry
   * @param {number} index
   * @param {import("three/examples/jsm/loaders/FontLoader.js").Font} font
   */
  constructor(parent, entry, index, font) {
    this.entry = entry;
    this.index = index;

    const y = index * STAIR_STEP_Y + STAIR_BASE_Y;
    const z = index * STAIR_STEP_Z;

    this.group = new THREE.Group();
    this.group.name = `timeline-entry-3d-${entry.id}`;
    this.group.position.set(0, y, z);

    const timeLabel = formatTimelineDisplayTime(entry.time);
    const mainColor = getCategoryColor(entry.category);

    const textMesh = makeExtrudedTextMesh(entry.text, font, mainColor);
    const timestampMesh = makeExtrudedTextMesh(timeLabel, font, "#F0FAFF");

    const textBox = new THREE.Box3().setFromObject(textMesh);
    const tsBox = new THREE.Box3().setFromObject(timestampMesh);
    const tsWidth = tsBox.max.x - tsBox.min.x;

    textMesh.position.x = 0;
    timestampMesh.position.x = textBox.min.x - tsWidth - 0.4;

    this.group.add(textMesh);
    this.group.add(timestampMesh);

    const tsBoxPlaced = new THREE.Box3().setFromObject(timestampMesh);
    this.atom = new AtomGlyph3D();
    this.atom.object3d.position.set(tsBoxPlaced.min.x - 0.6, 0, 0);
    this.group.add(this.atom.object3d);

    if (entry.alertId) {
      const iconMat = new THREE.MeshBasicMaterial({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.95
      });
      const icon = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 16), iconMat);
      icon.position.set(tsBoxPlaced.min.x - 1.05, 0.42, 0.12);
      icon.name = "timeline-alert-icon";
      this.group.add(icon);
    }

    parent.add(this.group);
  }

  /**
   * @returns {THREE.Box3}
   */
  getBounds() {
    const box = new THREE.Box3();
    this.group.updateMatrixWorld(true);
    return box.setFromObject(this.group);
  }

  /**
   * @param {number} delta
   */
  update(delta) {
    this.atom.update(delta);
  }

  dispose() {
    this.atom.dispose();
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this.group.removeFromParent();
  }
}
