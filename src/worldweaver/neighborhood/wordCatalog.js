/**
 * Word neighborhood data — structured catalog for procedural house spawning.
 * @typedef {Object} WordHouseEntry
 * @property {string} id
 * @property {string} word
 * @property {string} hash
 * @property {string} definition
 * @property {string} example
 * @property {string} addedAt ISO date
 */

const CATALOG_URL = "/data/word-neighborhood.json";
const STORAGE_KEY = "inkling:ww-neighborhood-catalog-v1";

/**
 * @typedef {Object} NeighborhoodCatalog
 * @property {number} version
 * @property {string} districtName
 * @property {{ gridCols?: number, blockSpacing?: number, streetWidth?: number }} [spawn]
 * @property {WordHouseEntry[]} words
 */

/**
 * @returns {Promise<NeighborhoodCatalog>}
 */
export async function loadWordCatalog() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    /* ignore */
  }
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const data = await res.json();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

/**
 * @param {NeighborhoodCatalog} catalog
 */
export function saveWordCatalogLocal(catalog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    /* ignore */
  }
}

/**
 * Compute spawn positions along sidewalks (no manual placement per house).
 * @param {NeighborhoodCatalog} catalog
 * @returns {Array<WordHouseEntry & { position: [number, number, number], rotY: number }>}
 */
export function spawnHousesFromCatalog(catalog) {
  const words = catalog.words ?? [];
  const cols = catalog.spawn?.gridCols ?? 4;
  const spacing = catalog.spawn?.blockSpacing ?? 5.5;
  const street = catalog.spawn?.streetWidth ?? 3.2;
  const half = ((cols - 1) * spacing) / 2;

  return words.map((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const side = row % 2 === 0 ? 1 : -1;
    const x = col * spacing - half;
    const z = row * spacing * 0.85 + side * (street * 0.5 + 1.8);
    const rotY = side > 0 ? Math.PI : 0;
    return {
      ...entry,
      position: [x, 0, z],
      rotY
    };
  });
}
