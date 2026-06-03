import * as THREE from "three";
import { getActivePalette } from "../theme/appearancePalettes.js";

/**
 * Feminine palette: each woven note as an atom — nucleus + orbiting UV particles.
 */
export class WordWeaverAtomOrbits {
  /**
   * @param {THREE.Group} parent
   * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
   */
  constructor(parent, pickables) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = "ww-atom-orbits";
    this.parent.add(this.group);
    /** @type {Array<{ group: THREE.Group, phase: number, speed: number, radius: number, tilt: number }>} */
    this._atoms = [];
    this._build(pickables);
  }

  /**
   * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
   */
  _build(pickables) {
    const palette = getActivePalette();
    if (!palette.atomOrbits) return;

    const nucleusColor = 0xff2d8f;
    const electronColors = [0xf472b6, 0xe879f9, 0xfb7185, 0xc026d3];

    pickables.forEach((pick, i) => {
      const pos = pick.mesh.getGroup().userData.layoutPos;
      if (!pos) return;

      const atom = new THREE.Group();
      atom.position.set(pos.x, pos.y, pos.z);

      const nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({
          color: nucleusColor,
          transparent: true,
          opacity: 0.85
        })
      );
      atom.add(nucleus);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0xe879f9,
          transparent: true,
          opacity: 0.18
        })
      );
      atom.add(glow);

      const electronCount = 3;
      for (let e = 0; e < electronCount; e++) {
        const el = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 8, 8),
          new THREE.MeshBasicMaterial({
            color: electronColors[(i + e) % electronColors.length],
            transparent: true,
            opacity: 0.92
          })
        );
        el.userData.orbitIndex = e;
        atom.add(el);
      }

      this._atoms.push({
        group: atom,
        phase: (pick.mesh.getGroup().userData.layoutPhase ?? i) + i * 0.17,
        speed: 0.85 + (i % 5) * 0.12,
        radius: 0.38 + (i % 3) * 0.08,
        tilt: (i % 4) * 0.35
      });

      this.group.add(atom);
    });
  }

  /**
   * @param {number} t elapsed seconds
   */
  update(t) {
    for (const atom of this._atoms) {
      const children = atom.group.children;
      const electrons = children.filter((c) => c.userData?.orbitIndex != null);
      electrons.forEach((el, e) => {
        const angle = t * atom.speed + atom.phase + e * ((Math.PI * 2) / electrons.length);
        const wobble = Math.sin(t * 2.2 + atom.phase + e) * 0.06;
        const r = atom.radius + wobble;
        const tilt = atom.tilt + e * 0.5;
        el.position.set(
          Math.cos(angle) * r,
          Math.sin(angle * 1.3 + e) * 0.12,
          Math.sin(angle) * r * Math.cos(tilt)
        );
      });
      atom.group.rotation.y = Math.sin(t * 0.4 + atom.phase) * 0.08;
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this.parent.remove(this.group);
    this._atoms = [];
  }
}
