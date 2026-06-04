import * as THREE from "three";
import { AtomGlyph } from "./AtomGlyph.js";
import { Real3DText } from "./Real3DText.js";

const TIMESTAMP_X = -1.35;
const ATOM_X = -0.8;
const TEXT_X = 0.15;

/**
 * @param {string | number | undefined} input
 * @param {number} fallback
 */
function parseColor(input, fallback = 0xe2e8f0) {
  if (typeof input === "number") return input;
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    const parsed = Number.parseInt(hex, 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Single Depth Staircase timeline entry: timestamp, atom (left of text), body text.
 */
export class TimelineEntry {
  /**
   * @param {{
   *   time: string,
   *   text: string,
   *   id?: number | string,
   *   index: number,
   *   fontSize?: number,
   *   fontWeight?: string,
   *   color?: string
   * }} data
   */
  constructor(data) {
    this.data = data;
    this.index = data.index;

    const y = this.index * 0.45;
    const z = this.index * -0.1;

    const bodyFontSize = Number(data.fontSize) || 0.26;
    const bodyColor = parseColor(data.color, 0xe2e8f0);
    const bodyWeight = data.fontWeight ?? "700";

    this.group = new THREE.Group();
    this.group.name = `timeline-entry-${data.id ?? this.index}`;
    this.group.position.set(0, y, z);

    this.timestampText = new Real3DText(data.time, {
      fontSize: 0.22,
      color: 0xfbbf24,
      glowColor: 0xffd700,
      emissiveIntensity: 0.65,
      fontWeight: "700"
    });
    this.timestampText.setPosition(TIMESTAMP_X, 0, 0);
    this.group.add(this.timestampText.getGroup());

    this.atom = new AtomGlyph({ particleCount: 5 });
    this.atom.getGroup().position.set(ATOM_X, 0, 0);
    this.group.add(this.atom.getGroup());

    this.bodyText = new Real3DText(data.text, {
      fontSize: bodyFontSize,
      color: bodyColor,
      glowColor: bodyColor,
      emissiveIntensity: 0.55,
      fontWeight: bodyWeight
    });
    this.bodyText.setPosition(TEXT_X, 0, 0);
    this.group.add(this.bodyText.getGroup());

    this.anchorPoints = this._computeAnchorPoints();
  }

  _computeAnchorPoints() {
    const y = this.index * 0.45;
    const z = this.index * -0.1;
    return {
      timestamp: new THREE.Vector3(TIMESTAMP_X, y, z),
      atom: new THREE.Vector3(ATOM_X, y, z),
      text: new THREE.Vector3(TEXT_X, y, z)
    };
  }

  /** World-space point on the atom (for golden line connections). */
  getAtomWorldPoint() {
    return this.anchorPoints.atom.clone();
  }

  refreshAnchorPoints() {
    this.group.updateMatrixWorld(true);
    const y = this.index * 0.45;
    const z = this.index * -0.1;
    this.anchorPoints = {
      timestamp: new THREE.Vector3(TIMESTAMP_X, y, z),
      atom: new THREE.Vector3(ATOM_X, y, z),
      text: new THREE.Vector3(TEXT_X, y, z)
    };
    return this.anchorPoints;
  }

  getGroup() {
    return this.group;
  }

  /**
   * @param {number} delta seconds since last frame
   */
  update(delta) {
    this.atom.update(delta);
    this.timestampText.animatePulse(0.35);
    this.bodyText.animatePulse(0.25);
  }

  dispose() {
    this.timestampText.dispose();
    this.bodyText.dispose();
    this.atom.dispose();
    this.group.clear();
  }
}
