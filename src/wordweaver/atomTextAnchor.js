import * as THREE from "three";

const _box = new THREE.Box3();
const _corner = new THREE.Vector3();

/** Gap between atom nucleus and the first letter (local units). */
const GAP_BASE = 0.1;
const ATOM_HALF_WIDTH = 0.09;

/**
 * First sentence fragment (stops at . ! ? …).
 * @param {string} text
 */
export function firstSentenceOf(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^[^.!?…\n]+/);
  return (m ? m[0] : raw).trim();
}

/**
 * Character index in `text` of the first letter/number in the first sentence.
 * @param {string} text
 */
export function indexOfFirstWordLetter(text) {
  const sentence = firstSentenceOf(text);
  const m = sentence.match(/[\p{L}\p{N}]/u);
  if (!m) return 0;
  const idx = sentence.indexOf(m[0]);
  const base = String(text ?? "").trim();
  const sentStart = base.indexOf(sentence);
  return sentStart >= 0 ? sentStart + idx : idx;
}

/**
 * Leftmost mesh / group used as the text anchor (first letter of first word).
 * @param {THREE.Object3D} textRoot
 * @param {number} [preferredLetterIndex]
 */
export function findFirstTextAnchorTarget(textRoot, preferredLetterIndex = -1) {
  if (!textRoot) return null;

  /** @type {{ obj: THREE.Object3D, order: number }[]} */
  const letters = [];
  textRoot.traverse((c) => {
    if (c.userData?.type === "weave-time") return;
    if (c.userData?.type === "weave-atom-marker") return;
    if (c.userData?.type === "weave-slab") return;
    if (c.userData?.isTextAnchorLetter) {
      letters.push({ obj: c, order: c.userData.letterIndex ?? 0 });
      return;
    }
    if (c.userData?.type === "weave-letter") {
      letters.push({ obj: c, order: c.userData.letterIndex ?? 999 });
    }
  });

  if (letters.length) {
    if (preferredLetterIndex >= 0) {
      const hit = letters.find((l) => l.order === preferredLetterIndex);
      if (hit) return hit.obj;
    }
    letters.sort((a, b) => a.order - b.order);
    return letters[0].obj;
  }

  let fallback = null;
  textRoot.traverse((c) => {
    if (fallback) return;
    if (c.userData?.type === "weave-time") return;
    if (c.userData?.type === "weave-atom-marker") return;
    if (c.userData?.type === "weave-slab") return;
    if (c.userData?.type === "weave-styled-text") {
      fallback = c;
      return;
    }
    if (c instanceof THREE.Mesh && c.geometry && c.userData?.part !== "ring") {
      fallback = c;
    }
  });
  return fallback;
}

/**
 * Local position for atom: just left of anchor letter with a small gap.
 * @param {THREE.Object3D} anchorTarget
 * @param {THREE.Object3D} atomParent
 * @param {number} [layoutScale]
 */
export function computeAtomAnchorPosition(anchorTarget, atomParent, layoutScale = 1) {
  if (!anchorTarget || !atomParent) return new THREE.Vector3(-0.2 * layoutScale, 0, 0);

  atomParent.updateWorldMatrix(true, true);
  anchorTarget.updateWorldMatrix(true, true);

  _box.setFromObject(anchorTarget);
  if (_box.isEmpty()) {
    return new THREE.Vector3(-(GAP_BASE + ATOM_HALF_WIDTH) * layoutScale, 0, 0);
  }

  const gap = (GAP_BASE + ATOM_HALF_WIDTH) * layoutScale;
  const corners = [
    new THREE.Vector3(_box.min.x, _box.min.y, _box.min.z),
    new THREE.Vector3(_box.min.x, _box.max.y, _box.min.z),
    new THREE.Vector3(_box.min.x, _box.min.y, _box.max.z),
    new THREE.Vector3(_box.min.x, _box.max.y, _box.max.z)
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const c of corners) {
    _corner.copy(c);
    atomParent.worldToLocal(_corner);
    minX = Math.min(minX, _corner.x);
    minY = Math.min(minY, _corner.y);
    maxY = Math.max(maxY, _corner.y);
    minZ = Math.min(minZ, _corner.z);
    maxZ = Math.max(maxZ, _corner.z);
  }

  return new THREE.Vector3(minX - gap, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
}

/**
 * Attach atom to a weave text root; repositions each frame via updateAtomTextAnchor.
 * @param {THREE.Group} atom
 * @param {THREE.Object3D} textRoot
 * @param {{ layoutScale?: number, label?: string }} [opts]
 */
export function bindAtomToTextAnchor(atom, textRoot, opts = {}) {
  const scale = opts.layoutScale ?? 1;
  const letterIdx =
    opts.label != null ? indexOfFirstWordLetter(opts.label) : -1;

  atom.userData.textAnchorRoot = textRoot;
  atom.userData.anchorLetterIndex = letterIdx;
  atom.userData.layoutScale = scale;
  atom.userData.followsText = true;

  const target = findFirstTextAnchorTarget(textRoot, letterIdx);
  if (target) {
    atom.position.copy(computeAtomAnchorPosition(target, atom.parent ?? textRoot, scale));
  }
}

/**
 * Keep atom aligned with the first letter while text animates.
 * @param {THREE.Group} atom
 */
export function updateAtomTextAnchor(atom) {
  if (!atom?.userData?.followsText) return;
  const root = atom.userData.textAnchorRoot;
  if (!root) return;

  const scale = atom.userData.layoutScale ?? 1;
  const letterIdx = atom.userData.anchorLetterIndex ?? -1;
  const target = findFirstTextAnchorTarget(root, letterIdx);
  if (!target) return;

  const parent = atom.parent;
  if (!parent) return;
  atom.position.copy(computeAtomAnchorPosition(target, parent, scale));
}
