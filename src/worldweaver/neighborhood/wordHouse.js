import * as THREE from "three";
import { createWordLabelSprite } from "./wordLabel.js";

const HOUSE_COLORS = [0x6b8cae, 0xc4a574, 0x9a7b6b, 0x7a9e8e, 0xb88a9e, 0x8a9eb8];

/**
 * Low-poly word house with billboard label (TMP equivalent on web).
 * @param {import('./wordCatalog.js').WordHouseEntry & { position: number[], rotY: number }} entry
 */
export function createWordHouse(entry) {
  const group = new THREE.Group();
  group.name = `house-${entry.id}`;
  const [x, y, z] = entry.position;
  group.position.set(x, y, z);
  group.rotation.y = entry.rotY ?? 0;

  const color = HOUSE_COLORS[hashStr(entry.id) % HOUSE_COLORS.length];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.8, 2.4),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.9;
  body.castShadow = false;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 1.1, 4),
    new THREE.MeshLambertMaterial({ color: 0x3d3d45 })
  );
  roof.position.y = 2.35;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.9, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x2a2520 })
  );
  door.position.set(0, 0.45, 1.22);
  group.add(door);

  const label = createWordLabelSprite(entry.hash || `#${entry.word}`);
  label.position.set(0, 3.2, 0);
  group.add(label);

  const pickMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 3.8, 2.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickMesh.position.y = 1.9;
  pickMesh.userData.wordHouse = entry;
  group.add(pickMesh);

  group.userData.wordHouse = entry;
  pickMesh.userData.wordHouse = entry;

  return { group, pickMesh, entry };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
