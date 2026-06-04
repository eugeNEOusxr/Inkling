import * as THREE from "three";

/** #FFD700 */
const GOLD = 0xffd700;
/** darker gold emissive */
const GOLD_EMISSIVE = 0xb8860b;

/**
 * 3D golden segment between two world-space points (cylinder geometry).
 */
export class GoldenLine {
  /**
   * @param {THREE.Vector3} start
   * @param {THREE.Vector3} end
   * @param {{ radius?: number }} [opts]
   */
  constructor(start, end, opts = {}) {
    this.start = start.clone();
    this.end = end.clone();
    this.radius = opts.radius ?? 0.014;

    const direction = new THREE.Vector3().subVectors(this.end, this.start);
    const length = direction.length();
    if (length < 1e-4) {
      this.mesh = new THREE.Group();
      return;
    }

    direction.normalize();
    const mid = new THREE.Vector3().addVectors(this.start, this.end).multiplyScalar(0.5);
    const geometry = new THREE.CylinderGeometry(this.radius, this.radius, length, 12, 1, false);
    const material = new THREE.MeshStandardMaterial({
      color: GOLD,
      emissive: new THREE.Color(GOLD_EMISSIVE),
      emissiveIntensity: 1.0,
      metalness: 0.92,
      roughness: 0.2
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "golden-line-segment";

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
    this.mesh.quaternion.copy(quat);
    this.mesh.position.copy(mid);
  }

  getMesh() {
    return this.mesh;
  }

  dispose() {
    if (!this.mesh) return;
    if (this.mesh instanceof THREE.Group) return;
    this.mesh.geometry?.dispose?.();
    this.mesh.material?.dispose?.();
  }
}
