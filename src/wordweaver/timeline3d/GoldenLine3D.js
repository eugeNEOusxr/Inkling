import * as THREE from "three";

/**
 * Golden 3D segment between two points.
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @returns {THREE.Mesh}
 */
export function createGoldenLineSegment(start, end) {
  const a = start.clone();
  const b = end.clone();
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  if (length < 1e-5) {
    return new THREE.Mesh();
  }

  dir.normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const geometry = new THREE.CylinderGeometry(0.012, 0.012, length, 10, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: new THREE.Color(0x8b7500),
    emissiveIntensity: 1,
    metalness: 0.8,
    roughness: 0.2
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "golden-line-3d";
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, dir);
  mesh.position.copy(mid);
  return mesh;
}
