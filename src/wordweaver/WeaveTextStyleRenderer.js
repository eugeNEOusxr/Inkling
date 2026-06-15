import * as THREE from "three";
import { Real3DText, createTextPbrMaterial } from "./Real3DText.js";
import { resolveWeaveTextStyle, styleToTypography } from "./weaveTextStyleSettings.js";
import { fontWeightForId } from "./weaveTextStyleCatalog.js";
import { createFloatingLettersGroup, animateFloatingLetters } from "./FloatingLetters3D.js";

/** @typedef {import('./weaveTextStyleSettings.js').WeaveTextStyle} WeaveTextStyle */

/**
 * @param {string} materialId
 * @param {{ color: number, glow: number, accent: number }} colors
 */
function materialParams(materialId, colors) {
  const base = {
    color: colors.color,
    glow: colors.glow,
    metalness: 0.35,
    roughness: 0.45,
    emissiveIntensity: 0.85
  };
  const table = /** @type {Record<string, Partial<typeof base>>} */ ({
    aluminum: { metalness: 0.92, roughness: 0.28, color: 0xc0c8d8 },
    brushed_aluminum: { metalness: 0.88, roughness: 0.52, color: 0xb8c0cc },
    copper: { metalness: 0.95, roughness: 0.38, color: 0xb87333, glow: 0xda8a45 },
    polished_copper: { metalness: 1, roughness: 0.12, color: 0xe8a055 },
    gold: { metalness: 1, roughness: 0.18, color: 0xd4af37, glow: 0xfde68a },
    rose_gold: { metalness: 0.95, roughness: 0.22, color: 0xe8b4b8, glow: 0xf9a8d4 },
    chrome: { metalness: 1, roughness: 0.05, color: 0xe2e8f0 },
    titanium: { metalness: 0.9, roughness: 0.35, color: 0x64748b, glow: 0x94a3b8 },
    matte_plastic: { metalness: 0, roughness: 0.92, color: colors.color },
    glossy_plastic: { metalness: 0.15, roughness: 0.18, color: colors.color },
    neon_emissive: { metalness: 0, roughness: 0.35, emissiveIntensity: 1.25 },
    energy_plasma: { metalness: 0.3, roughness: 0.4, emissiveIntensity: 1.4, glow: colors.accent },
    liquid_metal: { metalness: 1, roughness: 0.1, color: 0x94a3b8 },
    molten_lava: { metalness: 0.5, roughness: 0.7, color: 0x7f1d1d, glow: 0xf97316, emissiveIntensity: 1.3 }
  });
  return { ...base, ...(table[materialId] ?? {}) };
}

/**
 * Extruded TextGeometry mesh only — no background planes or canvas textures.
 * @param {string} text
 * @param {WeaveTextStyle} style
 * @param {number} layoutScale
 */
function createExtrudedTextMesh(text, style, layoutScale) {
  const typo = styleToTypography(style);
  const mat = materialParams(style.material, {
    color: typo.color,
    glow: typo.glowColor ?? typo.color,
    accent: typo.accentColor ?? typo.glowColor ?? typo.color
  });
  const size = typo.fontSize * layoutScale;
  const isExtruded = style.geometry === "extruded";
  const isWire = style.geometry === "wireframe";
  const isHologram = style.geometry === "hologram";
  const isGlass = style.geometry === "glass_pane";
  const depth = isExtruded ? size * 0.22 : size * 0.1;

  const board = new Real3DText(text, {
    fontSize: size,
    color: mat.color,
    glowColor: mat.glow,
    metalness: isGlass ? 0.15 : mat.metalness,
    roughness: isGlass ? 0.08 : mat.roughness,
    emissiveIntensity: isHologram ? mat.emissiveIntensity * 1.2 : mat.emissiveIntensity,
    depth,
    wireframe: isWire
  });

  const group = board.getGroup();
  const disposed = [board];

  if (style.enhancement === "outline_fill" || style.hybrid === "metal_neon_outline") {
    const outline = new Real3DText(text, {
      fontSize: size * 1.04,
      color: typo.accentColor ?? 0x4ade80,
      glowColor: typo.accentColor ?? mat.glow,
      metalness: 0,
      roughness: 0.5,
      emissiveIntensity: 0.9,
      depth: depth * 0.85
    });
    outline.getGroup().position.z = -depth * 0.35;
    group.add(outline.getGroup());
    disposed.push(outline);
  }

  group.userData.type = "weave-styled-text";
  group.userData.weaveStyle = style;
  group.userData.billboard = style.geometry === "billboard";
  group.userData.real3d = true;
  return { group, disposed, letters: disposed };
}

/**
 * Voxel letters are 3D cubes (sampling mask only — not displayed as flat text).
 */
function createVoxelText(text, style, layoutScale) {
  const typo = styleToTypography(style);
  const mat = materialParams(style.material, typo);
  const group = new THREE.Group();
  const disposed = /** @type {Real3DText[]} */ ([]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const px = 12;
  const fontSize = Math.floor(typo.fontSize * 72 * layoutScale);
  ctx.font = `${fontWeightForId(style.fontId)} ${fontSize}px ${typo.fontFamily}`;
  const w = Math.ceil(ctx.measureText(text).width) + px * 2;
  canvas.width = Math.max(64, w);
  canvas.height = fontSize + px * 2;
  ctx.font = `${fontWeightForId(style.fontId)} ${fontSize}px ${typo.fontFamily}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, px, fontSize);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const boxGeo = new THREE.BoxGeometry(0.06 * layoutScale, 0.06 * layoutScale, 0.06 * layoutScale);
  const boxMat = createTextPbrMaterial({
    color: mat.color,
    glowColor: mat.glow,
    metalness: mat.metalness,
    roughness: mat.roughness,
    emissiveIntensity: mat.emissiveIntensity * 0.7
  });
  const step = 3;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const i = (y * canvas.width + x) * 4;
      if (img.data[i + 3] < 80) continue;
      const cube = new THREE.Mesh(boxGeo, boxMat);
      cube.position.set(
        (x / canvas.width - 0.5) * 2.2 * layoutScale,
        (0.5 - y / canvas.height) * 0.9 * layoutScale,
        0
      );
      group.add(cube);
    }
  }
  group.userData.type = "weave-styled-text";
  group.userData.weaveStyle = style;
  group.userData.voxel = true;
  return { group, disposed, letters: disposed };
}

/**
 * @param {string} text
 * @param {Partial<WeaveTextStyle>} style
 * @param {number} [layoutScale]
 */
export function createWeaveTextGroup(text, style, layoutScale = 1) {
  const resolved = resolveWeaveTextStyle(style);
  const raw = String(text || "").trim();
  if (!raw) {
    const empty = new THREE.Group();
    return { group: empty, disposed: [], letters: [] };
  }

  const glyphModes = new Set(["floating_glyph", "floating_glyph_particles"]);
  if (glyphModes.has(resolved.geometry) || resolved.enhancement === "floating_segments") {
    const typo = styleToTypography(resolved);
    const result = createFloatingLettersGroup(raw, typo, layoutScale);
    result.group.userData.weaveStyle = resolved;
    result.group.userData.type = "weave-letters";
    return result;
  }

  if (resolved.geometry === "voxel" || resolved.hybrid === "pixel_metal") {
    return createVoxelText(raw, resolved, layoutScale);
  }

  if (resolved.geometry === "curved_surface") {
    const flat = createExtrudedTextMesh(raw, resolved, layoutScale);
    const n = Math.min(raw.length, 24);
    flat.group.children.forEach((child, i) => {
      const t = i / Math.max(n, 1);
      const angle = (t - 0.5) * 0.9;
      child.position.x = Math.sin(angle) * 1.2;
      child.position.z = Math.cos(angle) * 0.35 - 0.35;
      child.rotation.y = -angle;
    });
    return flat;
  }

  return createExtrudedTextMesh(raw, resolved, layoutScale);
}

/**
 * @param {THREE.Object3D} root
 * @param {number} t
 * @param {THREE.Camera} [camera]
 */
export function animateWeaveTextGroup(root, t, camera) {
  const style = root.userData.weaveStyle;
  if (!style) return;

  if (root.userData.type === "weave-letters") {
    animateFloatingLetters(root, t);
  }

  const anim = style.animation ?? "bobbing";
  const phase = root.userData.layoutPhase ?? 0;

  if (anim === "bobbing" || anim === "clock_layout") {
    const baseY = root.userData.baseY ?? root.position.y;
    if (root.userData.baseY === undefined) root.userData.baseY = root.position.y;
    root.position.y = baseY + Math.sin(t * 1.1 + phase) * 0.12;
  }

  if (anim === "orbiting") {
    root.rotation.y = t * 0.45 + phase;
  }

  if (anim === "breathing_glow" || anim === "metal_shine" || anim === "hologram_flicker") {
    root.traverse((c) => {
      if (!(c instanceof THREE.Mesh) || !c.material) return;
      const m = c.material;
      if (m.emissiveIntensity !== undefined) {
        const base = c.userData.baseEmissive ?? m.emissiveIntensity;
        if (c.userData.baseEmissive === undefined) c.userData.baseEmissive = base;
        const flicker = anim === "hologram_flicker" ? 0.65 + Math.random() * 0.35 : 1;
        m.emissiveIntensity =
          base * (0.55 + Math.sin(t * (anim === "metal_shine" ? 3.2 : 2)) * 0.45) * flicker;
      }
    });
  }

  if (root.userData.billboard && camera) {
    root.lookAt(camera.position);
  }
}
