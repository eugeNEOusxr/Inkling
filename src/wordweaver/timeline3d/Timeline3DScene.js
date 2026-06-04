import * as THREE from "three";
import { TimelineEntry3D, ensureTimelineFont } from "./TimelineEntry3D.js";
import { sortTimelineForDisplay } from "../timelineModel.js";

/**
 * Depth Staircase 3D timeline in a Three.js scene/group (no floor, no golden lines).
 */
export class Timeline3DScene {
  /**
   * @param {{ scene: THREE.Scene | THREE.Group }} opts
   */
  constructor(opts) {
    this.parent = opts.scene;
    this.root = new THREE.Group();
    this.root.name = "timeline-3d-scene";
    this.parent.add(this.root);

    /** @type {TimelineEntry3D[]} */
    this.entries3D = [];
    this._buildGen = 0;
  }

  /**
   * @param {import("../timelineModel.js").TimelineEntryRecord[]} entries
   */
  buildFromTimeline(entries) {
    this._clear();

    const sorted = sortTimelineForDisplay(entries ?? []);
    const gen = ++this._buildGen;

    ensureTimelineFont().then((font) => {
      if (gen !== this._buildGen || !font) return;

      sorted.forEach((entry, index) => {
        const item = new TimelineEntry3D(this.root, entry, index, font);
        this.entries3D.push(item);
      });
    });
  }

  /**
   * Frame the camera on a timeline entry for readable text.
   * @param {TimelineEntry3D} entry3D
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
   */
  fitToEntry(entry3D, camera, controls) {
    if (!entry3D?.group || !camera || !controls) return;

    const box = entry3D.getBounds();
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.35);

    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = Math.max(2.2, (maxDim / 2) / Math.tan(fovRad / 2) * 1.45);

    const viewDir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();
    if (viewDir.lengthSq() < 1e-6) {
      viewDir.set(0.35, 0.12, 1).normalize();
    }

    camera.position.copy(center).addScaledVector(viewDir, distance);
    controls.target.copy(center);
    controls.update();
  }

  /**
   * @param {number} delta
   */
  update(delta) {
    for (const entry of this.entries3D) {
      entry.update(delta);
    }
  }

  _clear() {
    for (const entry of this.entries3D) {
      entry.dispose();
    }
    this.entries3D = [];
  }

  dispose() {
    this._clear();
    this.parent.remove(this.root);
  }
}
