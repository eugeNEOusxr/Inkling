import * as THREE from "three";
import { Holographic3DText } from "../calendar/Holographic3DText.js";
import { glowColorForNode } from "./tagColors.js";
import { getActiveCustomLayout, customPlacement, setCustomLayoutOverride } from "./customLayout.js";

/** @typedef {'street'|'tree'|'float'|'constellation'|'forest'|'river'|'custom'} WeaveLayoutMode */

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
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 */
function weaveSegmentHeader(module) {
  return new Holographic3DText(`${module.date} · ${module.label}`, {
    fontSize: 1.4,
    fontFamily: "Arial",
    color: 0x38bdf8,
    glowColor: 0x0a7ea4,
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
  return label.length > 36 ? `${label.slice(0, 34)}…` : label || "…";
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

  switch (mode) {
    case "tree": {
      const layer = Math.floor(i / 3);
      const angle = (i % 3) * ((Math.PI * 2) / 3) + layer * 0.4;
      const r = 0.35 + layer * 0.45;
      const y = 0.4 + layer * 0.55 + (1 - importance) * 0.2;
      return {
        x: Math.sin(angle) * r,
        y: done ? y * 0.65 : y,
        z: Math.cos(angle) * r - layer * 0.15,
        rotY: angle,
        scale: done ? 0.75 : 0.85 + importance * 0.25,
        glowBoost: importance
      };
    }
    case "float": {
      const t = i / Math.max(total - 1, 1);
      return {
        x: Math.sin(t * Math.PI * 2 + i) * (1.2 + importance),
        y: 0.8 + Math.cos(t * 4) * 0.6 + i * 0.12,
        z: Math.cos(t * Math.PI * 2) * (1.1 + importance * 0.5),
        rotY: t * 0.5,
        scale: 0.9 + importance * 0.2,
        glowBoost: importance
      };
    }
    case "constellation": {
      const angle = (i / total) * Math.PI * 2 + 0.2;
      const r = 1.4 + (i % 4) * 0.22;
      return {
        x: Math.cos(angle) * r,
        y: 1.2 + Math.sin(angle * 2) * 0.35,
        z: Math.sin(angle) * r * 0.7,
        rotY: 0,
        scale: 0.65 + importance * 0.35,
        glowBoost: importance * 1.2
      };
    }
    case "forest": {
      const grove = Math.floor(i / 4);
      const inGrove = i % 4;
      const angle = inGrove * 1.2 + grove;
      return {
        x: grove * 1.1 + Math.sin(angle) * 0.35,
        y: 0.3 + inGrove * 0.4,
        z: Math.cos(angle) * 0.4 - grove * 0.25,
        rotY: angle * 0.15,
        scale: 0.8 + importance * 0.15,
        glowBoost: importance
      };
    }
    case "river": {
      const t = i / Math.max(total - 1, 1);
      return {
        x: Math.sin(t * 3) * 0.35,
        y: 0.5 + t * 0.15,
        z: -2.2 + t * 4.4,
        rotY: 0,
        scale: 0.85 + importance * 0.2,
        glowBoost: importance
      };
    }
    case "custom": {
      return customPlacement(node, i, total, getActiveCustomLayout());
    }
    case "street":
    default: {
      const step = 0.72;
      const baseY = 0.35;
      let y = baseY + i * step;
      const x = (i % 2 === 0 ? -0.2 : 0.2) + ((i % 3) - 1) * 0.08;
      const z = -0.15 - (i % 3) * 0.12;
      const rotY = (i % 3 - 1) * 0.08;
      const maxY = baseY + Math.max(total - 1, 0) * step;
      if (maxY > 3.8) {
        const scale = 3.8 / maxY;
        y = baseY + i * step * scale;
      }
      return { x, y, z, rotY, scale: 1, glowBoost: importance };
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
 * @param {THREE.Group} parent
 * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
 * @param {Holographic3DText[]} disposed
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 */
function addNodeSign(node, x, y, z, rotY, scale, glowBoost, parent, pickables, disposed, module) {
  const glow = glowColorForNode(node);
  const short = nodeLabel(node);
  const isInsight = node.kind === "insight";

  if (node.time && !isInsight) {
    const pole = new Holographic3DText(node.time, {
      fontSize: 0.38 * scale,
      color: 0xfde68a,
      glowColor: 0xd97706,
      bold: true,
      depthLayers: 2
    });
    pole.setPosition(x - 0.55, y + 0.72, z + 0.08);
    pole.getGroup().rotation.y = rotY * 0.6;
    pole.getGroup().userData = { type: "weave-time", node, module };
    parent.add(pole.getGroup());
    disposed.push(pole);
    pickables.push({ mesh: pole, node });
  }

  const board = new Holographic3DText(short, {
    fontSize: (isInsight ? 0.44 : 0.52) * scale,
    color: isInsight ? 0xc4b5fd : 0x0a7ea4,
    glowColor: isInsight ? 0x7c3aed : glow,
    bold: isInsight,
    depthLayers: isInsight ? 4 : 3
  });
  board.setPosition(x, y, z);
  const group = board.getGroup();
  group.rotation.y = rotY;
  group.scale.setScalar(scale);
  group.userData = { type: "weave-node", node, module, layoutPos: { x, y, z } };
  parent.add(group);
  disposed.push(board);
  pickables.push({ mesh: board, node });
}

/**
 * Related nodes share a tag → draw faint threads (float / constellation).
 * @param {import('./layoutSegmentWeave.js').WeavePickable[]} pickables
 * @param {THREE.Group} parent
 */
function addRelationThreads(pickables, parent) {
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
            opacity: 0.35
          })
        );
        line.userData = { type: "weave-thread" };
        parent.add(line);
      }
    }
  }
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

  const header = weaveSegmentHeader(module);
  header.setPosition(0, mode === "river" ? 2.6 : 2.35, mode === "river" ? -2.5 : 0);
  header.getGroup().userData = { type: "weave-header", module };
  parent.add(header.getGroup());
  disposed.push(header);

  const nodes = [...module.nodes].sort(sortNodesByTime).slice(0, 16);

  nodes.forEach((node, i) => {
    const { x, y, z, rotY, scale, glowBoost } = placementFor(node, i, nodes.length, mode);
    addNodeSign(node, x, y, z, rotY, scale, glowBoost, parent, pickables, disposed, module);
  });

  if (mode === "float" || mode === "constellation") {
    addRelationThreads(pickables, parent);
  }

  if (mode === "river") {
    const pathPoints = nodes.map((_, i) => {
      const p = placementFor(nodes[i], i, nodes.length, "river");
      return new THREE.Vector3(p.x, p.y - 0.2, p.z);
    });
    if (pathPoints.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pathPoints);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.04, 6, false),
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.25
        })
      );
      tube.userData = { type: "weave-river" };
      parent.add(tube);
    }
  }

  return { disposed, pickables };
}
