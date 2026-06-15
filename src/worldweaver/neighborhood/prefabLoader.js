import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { registerExternalAsset } from "./assetRegistry.js";

const loader = new GLTFLoader();

/**
 * Load GLB/GLTF as a reusable prefab group (Meshy, Blender exports).
 * @param {string} url
 * @param {{ scale?: number, id?: string, label?: string }} [opts]
 * @returns {Promise<THREE.Group>}
 */
export async function loadPrefabFromGltf(url, opts = {}) {
  const gltf = await loader.loadAsync(url);
  const root = new THREE.Group();
  root.name = opts.label ?? "ImportedPrefab";
  const scale = opts.scale ?? 1;
  gltf.scene.scale.setScalar(scale);
  root.add(gltf.scene);
  registerExternalAsset({
    id: opts.id ?? `import-${Date.now()}`,
    label: opts.label ?? "Imported",
    source: url.endsWith(".glb") ? "glb" : "gltf",
    url,
    scale,
    category: "prop"
  });
  return root;
}
