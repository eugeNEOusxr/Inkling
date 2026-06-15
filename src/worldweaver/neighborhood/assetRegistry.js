/**
 * Future-ready asset pipeline — GLB/GLTF/FBX prefab slots (Meshy, Blender, etc.).
 * @typedef {Object} WorldWeaverAssetDef
 * @property {string} id
 * @property {string} label
 * @property {'builtin'|'gltf'|'glb'|'fbx'} source
 * @property {string} [url]
 * @property {number} [scale]
 * @property {string} category house | street | decor | prop
 */

/** @type {WorldWeaverAssetDef[]} */
export const BUILTIN_ASSETS = [
  { id: "house_lowpoly_a", label: "House A", source: "builtin", category: "house" },
  { id: "house_lowpoly_b", label: "House B", source: "builtin", category: "house" },
  { id: "streetlight", label: "Streetlight", source: "builtin", category: "street" },
  { id: "road_asphalt", label: "Asphalt", source: "builtin", category: "street" },
  { id: "sidewalk", label: "Sidewalk", source: "builtin", category: "street" }
];

/**
 * @param {Partial<WorldWeaverAssetDef>} def
 * @returns {WorldWeaverAssetDef}
 */
export function registerExternalAsset(def) {
  const entry = {
    id: def.id ?? `asset-${Date.now()}`,
    label: def.label ?? "Imported",
    source: def.source ?? "glb",
    url: def.url,
    scale: def.scale ?? 1,
    category: def.category ?? "prop"
  };
  BUILTIN_ASSETS.push(entry);
  return entry;
}

/**
 * @param {string} category
 */
export function assetsByCategory(category) {
  return BUILTIN_ASSETS.filter((a) => a.category === category);
}
