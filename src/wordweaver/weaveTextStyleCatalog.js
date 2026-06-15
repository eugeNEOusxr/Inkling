/**
 * WordWeaver 3D text style catalog — geometry, fonts, materials, colors, FX, animation, presets.
 */

/** @typedef {import('./weaveTextStyleSettings.js').WeaveTextStyle} WeaveTextStyle */

export const WEAVE_STYLE_STORAGE_KEY = "inkling:ww-text-style";

export const GEOMETRY_STYLES = /** @type {const} */ ([
  { id: "extruded", label: "Extruded text (depth + bevel)" },
  { id: "hologram", label: "Hologram (glow + scanlines)" },
  { id: "wireframe", label: "Wireframe (neon outlines)" },
  { id: "voxel", label: "Voxel (blocky cubes)" },
  { id: "ribbon", label: "Ribbon mesh" },
  { id: "floating_glyph", label: "Floating glyph particles" },
  { id: "curved_surface", label: "Curved surface projection" },
  { id: "billboard", label: "Billboard (faces camera)" },
  { id: "sdf", label: "SDF crisp UI text" },
  { id: "glass_pane", label: "Glass pane etched" }
]);

export const FONT_STYLES = /** @type {const} */ ([
  { id: "sans", label: "Sans serif", family: "Arial, Helvetica, sans-serif", weight: "600" },
  { id: "serif", label: "Serif", family: "Georgia, Times New Roman, serif", weight: "600" },
  { id: "mono", label: "Monospace", family: "JetBrains Mono, Courier New, monospace", weight: "600" },
  { id: "techno_orbitron", label: "Techno — Orbitron", family: "Orbitron, Arial, sans-serif", weight: "700" },
  { id: "techno_exo", label: "Techno — Exo 2", family: "Exo 2, Arial, sans-serif", weight: "300" },
  { id: "techno_audiowide", label: "Techno — Audiowide", family: "Audiowide, Arial, sans-serif", weight: "400" },
  { id: "retro_pixel", label: "Retro pixel — Press Start 2P", family: '"Press Start 2P", monospace', weight: "400" },
  { id: "script", label: "Calligraphic script", family: "Palatino Linotype, Brush Script MT, cursive", weight: "600" },
  { id: "stencil", label: "Stencil military", family: "Impact, Haettenschweiler, sans-serif", weight: "700" },
  { id: "geometric", label: "Geometric modular", family: "Outfit, system-ui, sans-serif", weight: "700" },
  { id: "heavy_bold", label: "Heavy bold", family: "Arial Black, Arial, sans-serif", weight: "900" },
  { id: "ultra_thin", label: "Ultra thin hologram", family: "Exo 2, sans-serif", weight: "200" }
]);

export const MATERIAL_STYLES = /** @type {const} */ ([
  { id: "aluminum", label: "Aluminum" },
  { id: "brushed_aluminum", label: "Brushed aluminum" },
  { id: "copper", label: "Copper" },
  { id: "polished_copper", label: "Polished copper" },
  { id: "gold", label: "Gold" },
  { id: "rose_gold", label: "Rose gold" },
  { id: "chrome", label: "Chrome" },
  { id: "titanium", label: "Titanium" },
  { id: "matte_plastic", label: "Matte plastic" },
  { id: "glossy_plastic", label: "Glossy plastic" },
  { id: "glass", label: "Glass" },
  { id: "frosted_glass", label: "Frosted glass" },
  { id: "holographic_film", label: "Holographic film" },
  { id: "carbon_fiber", label: "Carbon fiber" },
  { id: "neon_emissive", label: "Neon emissive" },
  { id: "volumetric_fog", label: "Volumetric fog" },
  { id: "energy_plasma", label: "Energy plasma" },
  { id: "liquid_metal", label: "Liquid metal" },
  { id: "molten_lava", label: "Molten lava" }
]);

export const COLOR_SCHEMES = /** @type {const} */ ([
  { id: "nexaris_blue_gold", label: "Blue + gold + black + neon green" },
  { id: "aqua_gold", label: "Aqua + gold accents" },
  { id: "silver_electric", label: "Silver + electric blue" },
  { id: "black_copper", label: "Black + copper" },
  { id: "white_neon_cyan", label: "White + neon cyan" },
  { id: "purple_chrome", label: "Purple + chrome" }
]);

export const GEOMETRY_ENHANCEMENTS = /** @type {const} */ ([
  { id: "none", label: "None" },
  { id: "beveled", label: "Beveled edges" },
  { id: "inset", label: "Inset engraving" },
  { id: "embossed", label: "Embossed raised" },
  { id: "floating_segments", label: "Floating segments" },
  { id: "double_layer", label: "Metal base + glowing core" },
  { id: "outline_fill", label: "Neon outline + metal fill" }
]);

export const LIGHTING_STYLES = /** @type {const} */ ([
  { id: "default", label: "Scene default" },
  { id: "backlit", label: "Backlit glow" },
  { id: "edge_acrylic", label: "Edge-lit acrylic" },
  { id: "shadow_caster", label: "Shadow caster" },
  { id: "reflective_floor", label: "Reflective floor" },
  { id: "hdri_metal", label: "HDRI metal reflections" }
]);

export const ANIMATION_STYLES = /** @type {const} */ ([
  { id: "bobbing", label: "Floating bobbing" },
  { id: "breathing_glow", label: "Breathing glow" },
  { id: "orbiting", label: "Orbiting letters" },
  { id: "metal_shine", label: "Metal shine sweep" },
  { id: "hologram_flicker", label: "Hologram flicker" },
  { id: "assembly", label: "Letter assembly" },
  { id: "clock_layout", label: "Clock-position drift" }
]);

export const HYBRID_STYLES = /** @type {const} */ ([
  { id: "metal_neon_outline", label: "Metal core + neon outline" },
  { id: "glass_metal_frame", label: "Glass + metal frame" },
  { id: "hologram_in_rings", label: "Hologram in metal rings" },
  { id: "pixel_metal", label: "Pixel-metal fusion" },
  { id: "energy_copper", label: "Energy-infused copper" }
]);

/** @type {Record<string, { color: number, glow: number, accent: number }>} */
export const COLOR_SCHEME_VALUES = {
  nexaris_blue_gold: { color: 0x38bdf8, glow: 0xd4af37, accent: 0x4ade80 },
  aqua_gold: { color: 0x4ee6e6, glow: 0xfbbf24, accent: 0x0ea5e9 },
  silver_electric: { color: 0xcbd5e1, glow: 0x38bdf8, accent: 0x94a3b8 },
  black_copper: { color: 0xb87333, glow: 0x1c1917, accent: 0xf59e0b },
  white_neon_cyan: { color: 0xf8fafc, glow: 0x22d3ee, accent: 0x06b6d4 },
  purple_chrome: { color: 0xc084fc, glow: 0xe879f9, accent: 0x94a3b8 }
};

/** @type {Record<string, Partial<WeaveTextStyle>>} */
export const HYBRID_STYLE_OVERRIDES = {
  metal_neon_outline: {
    geometry: "extruded",
    enhancement: "outline_fill",
    material: "gold",
    animation: "breathing_glow"
  },
  glass_metal_frame: {
    geometry: "glass_pane",
    enhancement: "beveled",
    material: "chrome",
    lighting: "edge_acrylic"
  },
  hologram_in_rings: {
    geometry: "hologram",
    enhancement: "double_layer",
    material: "neon_emissive",
    animation: "hologram_flicker"
  },
  pixel_metal: {
    geometry: "voxel",
    fontId: "retro_pixel",
    material: "brushed_aluminum",
    enhancement: "embossed"
  },
  energy_copper: {
    geometry: "extruded",
    material: "molten_lava",
    colorScheme: "nexaris_blue_gold",
    animation: "metal_shine"
  }
};

/** Ready-to-use presets */
export const STYLE_PRESETS = /** @type {const} */ ([
  {
    id: "nexaris_prime",
    label: "Nexaris Prime",
    style: {
      preset: "nexaris_prime",
      geometry: "extruded",
      fontId: "techno_orbitron",
      material: "gold",
      colorScheme: "aqua_gold",
      enhancement: "outline_fill",
      lighting: "backlit",
      animation: "orbiting",
      hybrid: "metal_neon_outline",
      fontSize: 0.78
    }
  },
  {
    id: "retro_nes",
    label: "Retro NES Dimension",
    style: {
      preset: "retro_nes",
      geometry: "voxel",
      fontId: "retro_pixel",
      material: "brushed_aluminum",
      colorScheme: "silver_electric",
      enhancement: "embossed",
      lighting: "default",
      animation: "hologram_flicker",
      hybrid: "pixel_metal",
      fontSize: 0.65
    }
  },
  {
    id: "oracle_ai",
    label: "Oracle AI Hologram",
    style: {
      preset: "oracle_ai",
      geometry: "hologram",
      fontId: "techno_exo",
      material: "neon_emissive",
      colorScheme: "white_neon_cyan",
      enhancement: "double_layer",
      lighting: "edge_acrylic",
      animation: "hologram_flicker",
      hybrid: "hologram_in_rings",
      fontSize: 0.72
    }
  }
]);

/**
 * @param {string} fontId
 */
export function fontFamilyForId(fontId) {
  return FONT_STYLES.find((f) => f.id === fontId)?.family ?? FONT_STYLES[0].family;
}

/**
 * @param {string} fontId
 */
export function fontWeightForId(fontId) {
  return FONT_STYLES.find((f) => f.id === fontId)?.weight ?? "600";
}
