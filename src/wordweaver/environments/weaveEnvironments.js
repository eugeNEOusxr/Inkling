/**
 * WordWeaver world scenes — procedural presets + slots for Meshy GLB uploads.
 * Meshy (meshy.ai) exports GLB; place files under public/environments/ or use Upload in the UI.
 */

/** @typedef {'float'|'sway'|'drift'|'wave'} MotionKind */

/**
 * @typedef {Object} WeaveEnvAnchor
 * @property {string} id
 * @property {string} [label]
 * @property {[number, number, number]} position
 * @property {number} [rotY]
 */

/**
 * @typedef {Object} WeaveEnvironmentDef
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 * @property {string} [glbUrl] optional static path e.g. /environments/park.glb
 * @property {'procedural'|'glb'} type
 * @property {WeaveEnvAnchor[]} anchors
 * @property {{ position: [number,number,number], target: [number,number,number] }} [camera]
 * @property {number} [fogNear]
 * @property {number} [fogFar]
 * @property {number} [bgColor]
 */

export const WEAVE_ENV_STORAGE_KEY = "inkling:ww-environment-id";
export const WEAVE_ENV_GLB_URL_KEY = "inkling:ww-environment-glb-url";

export const WEAVE_ENVIRONMENTS = /** @type {WeaveEnvironmentDef[]} */ ([
  {
    id: "default",
    label: "Starfield",
    description: "Original grid and particles.",
    type: "procedural",
    anchors: [
      { id: "a0", label: "Center", position: [0, 1.1, 0] },
      { id: "a1", label: "Left", position: [-2.2, 1, 0.6] },
      { id: "a2", label: "Right", position: [2.2, 1.05, -0.4] },
      { id: "a3", label: "Back", position: [0, 1.25, -2] }
    ],
    camera: { position: [0, 2.4, 8.2], target: [0, 1.1, 0] }
  },
  {
    id: "house",
    label: "House",
    description: "Cozy interior — desk, window, doorway.",
    type: "procedural",
    anchors: [
      { id: "desk", label: "Desk", position: [-1.1, 0.95, 0.2], rotY: 0.4 },
      { id: "window", label: "Window", position: [1.35, 1.15, -1.05], rotY: -0.5 },
      { id: "door", label: "Doorway", position: [-0.15, 0.85, 1.35], rotY: Math.PI },
      { id: "shelf", label: "Shelf", position: [0.95, 1.05, 0.45], rotY: -0.2 }
    ],
    camera: { position: [2.8, 2.1, 4.5], target: [0, 1, 0.2] },
    fogNear: 8,
    fogFar: 22,
    bgColor: 0x0a0e14
  },
  {
    id: "park",
    label: "Park",
    description: "Trees, path, bench — notes along the green.",
    type: "procedural",
    anchors: [
      { id: "bench", label: "Bench", position: [-0.5, 0.75, 0.8], rotY: 0.15 },
      { id: "oak", label: "Under tree", position: [2.1, 0.9, -0.6], rotY: -0.35 },
      { id: "path", label: "Path", position: [0, 0.7, -1.8], rotY: 0 },
      { id: "pond", label: "Pond edge", position: [-2.2, 0.72, -1.2], rotY: 0.5 }
    ],
    camera: { position: [0.5, 2.6, 7.5], target: [0, 0.9, -0.3] },
    fogNear: 10,
    fogFar: 28,
    bgColor: 0x071018
  },
  {
    id: "beach",
    label: "Beach",
    description: "Sand, animated water, umbrella.",
    type: "procedural",
    anchors: [
      { id: "sand", label: "Shore", position: [0, 0.72, 1.4], rotY: 0 },
      { id: "umbrella", label: "Shade", position: [-1.6, 0.88, 0.3], rotY: 0.25 },
      { id: "tide", label: "Tide line", position: [1.2, 0.68, -1.5], rotY: -0.2 },
      { id: "dune", label: "Dune", position: [-0.4, 0.8, -2.2], rotY: 0.1 }
    ],
    camera: { position: [3.2, 2.3, 5.8], target: [0, 0.75, -0.5] },
    fogNear: 12,
    fogFar: 32,
    bgColor: 0x0c1a28
  },
  {
    id: "meshy",
    label: "Meshy upload",
    description: "Your GLB from meshy.ai or file upload.",
    type: "glb",
    glbUrl: "",
    anchors: [
      { id: "n0", label: "Note 1", position: [0, 1, 0] },
      { id: "n1", label: "Note 2", position: [-1.5, 1, 0.5] },
      { id: "n2", label: "Note 3", position: [1.5, 1, -0.5] },
      { id: "n3", label: "Note 4", position: [0, 1.2, -1.5] }
    ],
    camera: { position: [0, 2.2, 7], target: [0, 1, 0] }
  }
]);

/**
 * @param {string} id
 * @returns {WeaveEnvironmentDef}
 */
export function getEnvironmentDef(id) {
  return WEAVE_ENVIRONMENTS.find((e) => e.id === id) ?? WEAVE_ENVIRONMENTS[0];
}

export function loadSavedEnvironmentId() {
  try {
    const id = localStorage.getItem(WEAVE_ENV_STORAGE_KEY);
    if (id && WEAVE_ENVIRONMENTS.some((e) => e.id === id)) return id;
  } catch {
    /* ignore */
  }
  return "default";
}

/**
 * @param {string} id
 */
export function saveEnvironmentId(id) {
  try {
    localStorage.setItem(WEAVE_ENV_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadSavedCustomGlbUrl() {
  try {
    return localStorage.getItem(WEAVE_ENV_GLB_URL_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * @param {string} url
 */
export function saveCustomGlbUrl(url) {
  try {
    if (url) localStorage.setItem(WEAVE_ENV_GLB_URL_KEY, url);
    else localStorage.removeItem(WEAVE_ENV_GLB_URL_KEY);
  } catch {
    /* ignore */
  }
}
