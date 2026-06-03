import * as THREE from "three";
import { Holographic3DText } from "../calendar/Holographic3DText.js";
import { glowColorForNode } from "./tagColors.js";
import { getActivePalette } from "../theme/appearancePalettes.js";
import { getActiveCustomLayout, customPlacement, setCustomLayoutOverride } from "./customLayout.js";

/** @typedef {'street'|'tree'|'float'|'constellation'|'forest'|'river'|'custom'} WeaveLayoutMode */

export const MAX_WEAVE_NODES = 12;

export const WEAVE_LAYOUT_MODES = /** @type {const} */ ([
  { id: "street", label: "Street signs" },
  { id: "tree", label: "Memory tree" },
  { id: "float", label: "Floating" },
  { id: "constellation", label: "Constellation" },
  { id: "forest", label: "Memory forest" },
  { id: "river", label: "Timeline river" },
  { id: "custom", label: "My layout" }
]);

/**
 * @param {number} total
 */
function spacingScale(total) {
  return 1 + Math.max(0, total - 4) * 0.14;
}

/**
 * @param {number} i
 * @param {number} total
 */
function treeTierInfo(i, total) {
  let assigned = 0;
  let level = 0;
  while (assigned < total && level < 24) {
    const width = Math.min(level + 1, Math.max(1, total - assigned));
    if (i < assigned + width) {
      return { level, posInTier: i - assigned, widthInTier: width, levels: level + 1 };
    }
    assigned += width;
    level += 1;
  }
  return { level: 0, posInTier: 0, widthInTier: 1, levels: 1 };
}

/**
 * Camera framing per layout metaphor.
 * @param {WeaveLayoutMode} mode
 * @param {number} total
 */
export function getCameraFrameForLayout(mode, total = 8) {
  const s = spacingScale(total);
  switch (mode) {
    case "street":
      return {
        position: new THREE.Vector3(0.35, 2.4, 7.2 * s),
        target: new THREE.Vector3(0, 1.15, -1.8 * s)
      };
    case "tree":
      return {
        position: new THREE.Vector3(0, 2.9, 8.5 * s),
        target: new THREE.Vector3(0, 1.35, 0.2)
      };
    case "float":
      return {
        position: new THREE.Vector3(0, 2.6, 9.5 * s),
        target: new THREE.Vector3(0, 1.5, 0)
      };
    case "constellation":
      return {
        position: new THREE.Vector3(0, 2.2, 10 * s),
        target: new THREE.Vector3(0, 1.45, 0)
      };
    case "forest":
      return {
        position: new THREE.Vector3(0, 3.2, 9 * s),
        target: new THREE.Vector3(0, 0.9, 0)
      };
    case "river":
      return {
        position: new THREE.Vector3(0, 2.8, 8.5 * s),
        target: new THREE.Vector3(0, 0.75, 0.5)
      };
    case "custom":
    default:
      return {
        position: new THREE.Vector3(0, 2.5, 8.2 * s),
        target: new THREE.Vector3(0, 1.1, 0)
      };
  }
}

/**
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 */
function weaveSegmentHeader(module) {
  const p = getActivePalette();
  const headerColor = p.id === "feminine" ? 0xf472b6 : p.id === "masculine" ? 0x38bdf8 : 0x38bdf8;
  const headerGlow = p.id === "feminine" ? 0xe879f9 : p.id === "masculine" ? 0x3b82f6 : 0x0a7ea4;
  return new Holographic3DText(`${module.date} · ${module.label}`, {
    fontSize: 1.4,
    fontFamily: "Arial",
    color: headerColor,
    glowColor: headerGlow,
    bold: true,
    depthLayers: 3
  });
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} a
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} b
 */
export function sortNodesByTime(a, b) {
  const ta = a.time || "00:00";
  const tb = b.time || "00:00";
  if (ta !== tb) return ta.localeCompare(tb);
  return String(a.id || "").localeCompare(String(b.id || ""));
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 */
function nodeLabel(node) {
  const label = (node.text || "").trim();
  return label.length > 28 ? `${label.slice(0, 26)}…` : label || "…";
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {number} i
 * @param {number} total
 * @param {WeaveLayoutMode} mode
 */
function placementFor(node, i, total, mode) {
  const importance = node.importance ?? (node.kind === "appointment" ? 0.8 : 0.5);
  const done = Boolean(node.completed);
  const s = spacingScale(total);
  const phase = i * 0.85 + (importance * 0.4);

  switch (mode) {
    case "tree": {
      const { level, posInTier, widthInTier } = treeTierInfo(i, total);
      const angle = (posInTier / Math.max(widthInTier, 1)) * Math.PI * 2 + level * 0.28;
      const r = (0.25 + level * 0.62) * s;
      const y = 2.85 - level * 0.78 * s + (done ? -0.12 : 0);
      return {
        x: Math.sin(angle) * r,
        y,
        z: Math.cos(angle) * r * 0.55 - level * 0.08,
        rotY: angle + Math.PI * 0.5,
        scale: done ? 0.78 : 0.82 + importance * 0.22,
        glowBoost: importance,
        phase
      };
    }
    case "float": {
      const t = i / Math.max(total - 1, 1);
      const band = i % 3;
      const helixR = (1.35 + band * 0.55) * s;
      return {
        x: Math.cos(t * Math.PI * 2.8 + i * 0.5) * helixR,
        y: 0.75 + i * 0.42 * s + Math.sin(t * Math.PI * 5) * 0.28,
        z: Math.sin(t * Math.PI * 2.8 + i * 0.5) * helixR * 0.9,
        rotY: t * Math.PI * 0.35,
        scale: 0.88 + importance * 0.2,
        glowBoost: importance,
        phase
      };
    }
    case "constellation": {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(total, 1));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const R = 2.35 * s;
      return {
        x: R * Math.sin(phi) * Math.cos(theta),
        y: 1.35 + R * Math.cos(phi) * 0.75,
        z: R * Math.sin(phi) * Math.sin(theta),
        rotY: theta * 0.15,
        scale: 0.72 + importance * 0.28,
        glowBoost: importance * 1.15,
        phase
      };
    }
    case "forest": {
      const groveCount = Math.min(4, Math.max(2, Math.ceil(total / 3)));
      const grove = i % groveCount;
      const onTree = Math.floor(i / groveCount);
      const gx = (grove % 2) * 3.1 * s - 1.55 * s;
      const gz = Math.floor(grove / 2) * 2.8 * s - 1.2 * s;
      const angle = onTree * 1.35 + grove * 0.4;
      return {
        x: gx + Math.sin(angle) * 0.55 * s,
        y: 0.35 + onTree * 0.62 * s,
        z: gz + Math.cos(angle) * 0.5 * s,
        rotY: angle * 0.2,
        scale: 0.84 + importance * 0.18,
        glowBoost: importance,
        phase
      };
    }
    case "river": {
      const t = i / Math.max(total - 1, 1);
      return {
        x: Math.sin(t * Math.PI * 2.6) * 1.45 * s,
        y: 0.7 + Math.sin(t * Math.PI * 4) * 0.22,
        z: -3.8 * s + t * 7.6 * s,
        rotY: Math.sin(t * Math.PI * 2) * 0.12,
        scale: 0.86 + importance * 0.2,
        glowBoost: importance,
        phase
      };
    }
    case "custom": {
      const p = customPlacement(node, i, total, getActiveCustomLayout());
      return { ...p, phase };
    }
    case "street":
    default: {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -i * 1.2 * s;
      const x = side * (1.25 + (i % 3) * 0.12) * s;
      const y = 0.95 + importance * 0.35 + (i % 2) * 0.08;
      return {
        x,
        y: done ? y * 0.88 : y,
        z: -0.2 + z,
        rotY: side * 0.42,
        scale: done ? 0.82 : 0.9 + importance * 0.15,
        glowBoost: importance,
        phase
      };
    }
  }
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} rotY
 * @param {number} scale
 * @param {number} glowBoost
 * @param {number} phase
 * @param {THREE.Group} parent
 * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
 * @param {Holographic3DText[]} disposed
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 */
function addNodeSign(node, x, y, z, rotY, scale, glowBoost, phase, parent, pickables, disposed, module) {
  const glow = glowColorForNode(node);
  const short = nodeLabel(node);
  const isInsight = node.kind === "insight";

  const palette = getActivePalette();
  const noteColor = isInsight
    ? palette.wwInsight
    : palette.id === "feminine"
      ? palette.wwNode
      : palette.id === "masculine"
        ? palette.wwNode
        : 0x0a7ea4;
  const board = new Holographic3DText(short, {
    fontSize: (isInsight ? 0.42 : 0.48) * scale,
    color: noteColor,
    glowColor: isInsight ? palette.wwInsight : glow,
    bold: isInsight,
    depthLayers: isInsight ? 4 : 3
  });
  board.setPosition(x, y, z);
  const group = board.getGroup();
  group.rotation.y = rotY;
  group.scale.setScalar(scale);
  group.userData = {
    type: "weave-node",
    node,
    module,
    layoutPos: { x, y, z },
    layoutPhase: phase,
    layoutScale: scale,
    glowBoost
  };
  if (node.time && !isInsight) {
    const poleColor = palette.id === "feminine" ? 0xfda4af : palette.id === "masculine" ? 0xe2e8f0 : 0xfde68a;
    const poleGlow = palette.id === "feminine" ? 0xff2d8f : palette.id === "masculine" ? 0x64748b : 0xd97706;
    const pole = new Holographic3DText(node.time, {
      fontSize: 0.34 * scale,
      color: poleColor,
      glowColor: poleGlow,
      bold: true,
      depthLayers: 2
    });
    pole.setPosition(-0.62 * scale, 0.78 * scale, 0.1);
    pole.getGroup().rotation.y = rotY * 0.6;
    pole.getGroup().userData = { type: "weave-time", node, module };
    group.add(pole.getGroup());
    disposed.push(pole);
  }

  parent.add(group);
  disposed.push(board);
  pickables.push({ mesh: board, node });
}

/**
 * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
 * @param {THREE.Group} parent
 * @returns {THREE.Line[]}
 */
function addRelationThreads(pickables, parent) {
  const lines = [];
  const byTag = new Map();
  for (const { node } of pickables) {
    for (const tag of node.tags ?? []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(node);
    }
  }
  const pairs = new Set();
  for (const nodes of byTag.values()) {
    if (nodes.length < 2) continue;
    for (let i = 0; i < nodes.length - 1; i++) {
      for (let j = i + 1; j < Math.min(nodes.length, i + 3); j++) {
        const key = [nodes[i].id, nodes[j].id].sort().join("|");
        if (pairs.has(key)) continue;
        pairs.add(key);
        const a = pickables.find((p) => p.node.id === nodes[i].id)?.mesh.getGroup().position;
        const b = pickables.find((p) => p.node.id === nodes[j].id)?.mesh.getGroup().position;
        if (!a || !b) continue;
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3(b.x, b.y, b.z)
        ]);
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({
            color: 0x4ee6e6,
            transparent: true,
            opacity: 0.38
          })
        );
        line.userData = { type: "weave-thread", nodeA: nodes[i].id, nodeB: nodes[j].id };
        parent.add(line);
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 * @param {THREE.Group} parent
 * @param {WeaveLayoutMode} [mode]
 */
export function layoutSegmentWeave(module, parent, mode = "street", customParams = null) {
  if (mode === "custom" && customParams) {
    setCustomLayoutOverride(customParams);
  }
  const disposed = [];
  const pickables = /** @type {import('./layoutSegmentWeave.js').WeavePickable[]} */ ([]);
  const threadLines = [];

  const headerY = mode === "river" ? 3.1 : mode === "tree" ? 3.35 : 2.65;
  const headerZ = mode === "river" ? -3.2 * spacingScale(1) : mode === "street" ? -0.4 : 0;
  const header = weaveSegmentHeader(module);
  header.setPosition(0, headerY, headerZ);
  header.getGroup().userData = { type: "weave-header", module };
  parent.add(header.getGroup());
  disposed.push(header);

  const nodes = [...module.nodes].sort(sortNodesByTime).slice(0, MAX_WEAVE_NODES);

  nodes.forEach((node, i) => {
    const { x, y, z, rotY, scale, glowBoost, phase } = placementFor(node, i, nodes.length, mode);
    addNodeSign(node, x, y, z, rotY, scale, glowBoost, phase, parent, pickables, disposed, module);
  });

  if (mode === "float" || mode === "constellation") {
    threadLines.push(...addRelationThreads(pickables, parent));
  }

  if (mode === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.12, 2.4 * spacingScale(nodes.length), 8),
      new THREE.MeshBasicMaterial({ color: 0x5c4033, transparent: true, opacity: 0.55 })
    );
    trunk.position.set(0, 1.2, 0);
    trunk.userData = { type: "weave-trunk" };
    parent.add(trunk);
  }

  if (mode === "forest") {
    const groveCount = Math.min(4, Math.max(2, Math.ceil(nodes.length / 3)));
    for (let g = 0; g < groveCount; g++) {
      const gx = (g % 2) * 3.1 * spacingScale(nodes.length) - 1.55 * spacingScale(nodes.length);
      const gz = Math.floor(g / 2) * 2.8 * spacingScale(nodes.length) - 1.2 * spacingScale(nodes.length);
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 0.35, 6),
        new THREE.MeshBasicMaterial({ color: 0x4a3728, transparent: true, opacity: 0.5 })
      );
      stump.position.set(gx, 0.15, gz);
      stump.userData = { type: "weave-stump" };
      parent.add(stump);
    }
  }

  if (mode === "river") {
    const pathPoints = nodes.map((_, i) => {
      const p = placementFor(nodes[i], i, nodes.length, "river");
      return new THREE.Vector3(p.x, p.y - 0.25, p.z);
    });
    if (pathPoints.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pathPoints);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 32, 0.06, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.32
        })
      );
      tube.userData = { type: "weave-river" };
      parent.add(tube);
    }
  }

  if (mode === "street") {
    const len = Math.max(nodes.length * 1.2 * spacingScale(nodes.length), 2);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8 * spacingScale(nodes.length), len),
      new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, -len / 2 + 0.5);
    road.userData = { type: "weave-road" };
    parent.add(road);
  }

  return { disposed, pickables, threadLines };
}
