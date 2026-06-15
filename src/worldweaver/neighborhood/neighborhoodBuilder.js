import * as THREE from "three";
import { createWordHouse } from "./wordHouse.js";

const ASPHALT = 0x2a2a2e;
const CONCRETE = 0x8b8f94;
const GRASS = 0x3d5c3a;
const LAMP_METAL = 0x1a1a1f;

/**
 * Procedural low-poly neighborhood — roads, sidewalks, lights, data-driven houses.
 * @param {THREE.Scene} scene
 * @param {import('./wordCatalog.js').spawnHousesFromCatalog extends Function ? ReturnType<import('./wordCatalog.js').spawnHousesFromCatalog> : never} houseEntries
 */
export function buildNeighborhood(scene, houseEntries) {
  const root = new THREE.Group();
  root.name = "WorldWeaverDistrict";
  scene.add(root);

  const bounds = computeBounds(houseEntries);
  addGround(root, bounds);
  addRoadGrid(root, bounds);
  addSidewalks(root, bounds);
  addStreetlights(root, bounds, houseEntries.length);

  const houses = [];
  for (const entry of houseEntries) {
    const house = createWordHouse(entry);
    root.add(house.group);
    houses.push({ mesh: house.group, entry, pickMesh: house.pickMesh });
  }

  return { root, houses, bounds };
}

function computeBounds(entries) {
  let minX = -12;
  let maxX = 12;
  let minZ = -8;
  let maxZ = 28;
  for (const e of entries) {
    const [x, , z] = e.position;
    minX = Math.min(minX, x - 6);
    maxX = Math.max(maxX, x + 6);
    minZ = Math.min(minZ, z - 6);
    maxZ = Math.max(maxZ, z + 6);
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

function addGround(root, b) {
  const w = b.maxX - b.minX + 16;
  const d = b.maxZ - b.minZ + 16;
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshLambertMaterial({ color: GRASS });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(b.cx, -0.02, b.cz);
  mesh.receiveShadow = false;
  root.add(mesh);
}

function addRoadGrid(root, b) {
  const roadMat = new THREE.MeshLambertMaterial({ color: ASPHALT });
  const mainW = b.maxX - b.minX + 4;
  const main = new THREE.Mesh(new THREE.PlaneGeometry(mainW, 3.2), roadMat);
  main.rotation.x = -Math.PI / 2;
  main.position.set(b.cx, 0.01, b.cz);
  root.add(main);

  const crossLen = b.maxZ - b.minZ + 6;
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(3.2, crossLen), roadMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(b.cx, 0.012, b.cz);
  root.add(cross);

  for (let z = b.minZ; z <= b.maxZ; z += 5.5) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(mainW * 0.6, 2.4), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(b.cx, 0.011, z);
    root.add(strip);
  }
}

function addSidewalks(root, b) {
  const mat = new THREE.MeshLambertMaterial({ color: CONCRETE });
  const sw = 1.4;
  const len = b.maxZ - b.minZ + 10;
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.08, len), mat);
    slab.position.set(b.cx + side * 2.8, 0.05, b.cz);
    root.add(slab);
  }
}

function addStreetlights(root, b, count) {
  const n = Math.max(4, Math.min(12, count + 2));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    const z = THREE.MathUtils.lerp(b.minZ, b.maxZ, t);
    for (const side of [-1, 1]) {
      const pole = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6),
        new THREE.MeshLambertMaterial({ color: LAMP_METAL })
      );
      post.position.y = 1.6;
      pole.add(post);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
      );
      bulb.position.y = 3.1;
      pole.add(bulb);
      const light = new THREE.PointLight(0xffe8b8, 0.35, 8);
      light.position.y = 3;
      pole.add(light);
      pole.position.set(b.cx + side * 3.6, 0, z);
      root.add(pole);
    }
  }
}
