import { createTimelineNode, demoSegmentNodes } from "../inkling-core/timelineNode.js";
import { STYLE_PRESETS } from "./weaveTextStyleCatalog.js";
import { resolveWeaveTextStyle } from "./weaveTextStyleSettings.js";
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

export { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

/** @typedef {import('../inkling-core/timelineNode.js').DaySegment} DaySegment */
/** @typedef {import('../inkling-core/timelineNode.js').TimelineNode} TimelineNode */

/**
 * Phones, narrow viewports, and Tauri Android should get a rich demo weave.
 * @returns {boolean}
 */
export function shouldUseMobileWeaveShowcase() {
  return isMobileWordWeaver();
}

/**
 * Mobile defaults: one extruded label per thought (readable with canvas fallback).
 * @returns {import('./weaveTextStyleSettings.js').WeaveTextStyle}
 */
export function getMobileWeaveTextDefaults() {
  return resolveWeaveTextStyle({
    geometry: "extruded",
    fontId: "techno_orbitron",
    material: "neon_emissive",
    colorScheme: "nexaris_blue_gold",
    enhancement: "outline_fill",
    animation: "breathing_glow",
    fontSize: 0.92
  });
}

/**
 * Per-segment example nodes — each uses a different geometry, material, animation, and font size.
 * @param {string} date YYYY-MM-DD
 * @param {DaySegment} segment
 * @returns {TimelineNode[]}
 */
export function getMobileShowcaseNodes(date, segment) {
  const presetStyles = STYLE_PRESETS.map((p) => resolveWeaveTextStyle(p.style));

  /** @type {Record<DaySegment, Array<{ time: string, text: string, style: import('./weaveTextStyleSettings.js').WeaveTextStyle, importance?: number }>>} */
  const rows = {
    morning: [
      {
        time: "07:15",
        text: "Glow · floating glyphs",
        style: {
          ...presetStyles[0],
          geometry: "floating_glyph",
          fontId: "techno_orbitron",
          material: "neon_emissive",
          animation: "bobbing",
          fontSize: 0.82
        },
        importance: 0.9
      },
      {
        time: "08:30",
        text: "Gold extrude",
        style: {
          ...presetStyles[0],
          geometry: "extruded",
          material: "gold",
          enhancement: "outline_fill",
          animation: "metal_shine",
          fontSize: 0.76
        },
        importance: 0.85
      },
      {
        time: "10:00",
        text: "Pixel weave",
        style: {
          ...presetStyles[1],
          geometry: "voxel",
          fontId: "retro_pixel",
          animation: "hologram_flicker",
          fontSize: 0.68
        },
        importance: 0.8
      }
    ],
    afternoon: [
      {
        time: "12:00",
        text: "Hologram drift",
        style: {
          ...presetStyles[2],
          geometry: "hologram",
          fontId: "ultra_thin",
          animation: "hologram_flicker",
          fontSize: 0.74
        },
        importance: 0.92
      },
      {
        time: "14:30",
        text: "Copper orbit",
        style: {
          geometry: "extruded",
          fontId: "techno_audiowide",
          material: "polished_copper",
          colorScheme: "black_copper",
          enhancement: "outline_fill",
          animation: "orbiting",
          fontSize: 0.8
        },
        importance: 0.88
      },
      {
        time: "15:45",
        text: "Plasma pulse",
        style: {
          geometry: "floating_glyph",
          fontId: "geometric",
          material: "energy_plasma",
          colorScheme: "purple_chrome",
          animation: "breathing_glow",
          fontSize: 0.7
        },
        importance: 0.86
      },
      {
        time: "16:20",
        text: "Inkling mobile",
        style: {
          geometry: "extruded",
          fontId: "heavy_bold",
          material: "rose_gold",
          colorScheme: "aqua_gold",
          animation: "clock_layout",
          fontSize: 0.88
        },
        importance: 0.95
      }
    ],
    night: [
      {
        time: "19:00",
        text: "Neon night",
        style: {
          geometry: "floating_glyph",
          fontId: "techno_exo",
          material: "neon_emissive",
          colorScheme: "white_neon_cyan",
          animation: "breathing_glow",
          fontSize: 0.78
        },
        importance: 0.9
      },
      {
        time: "21:30",
        text: "Chrome wire",
        style: {
          geometry: "wireframe",
          fontId: "stencil",
          material: "chrome",
          colorScheme: "silver_electric",
          animation: "metal_shine",
          fontSize: 0.72
        },
        importance: 0.84
      },
      {
        time: "22:45",
        text: "Wind down",
        style: {
          geometry: "curved_surface",
          fontId: "script",
          material: "frosted_glass",
          colorScheme: "nexaris_blue_gold",
          animation: "bobbing",
          fontSize: 0.66
        },
        importance: 0.75
      }
    ]
  };

  const list = rows[segment] ?? rows.afternoon;
  return list.map((row, i) =>
    createTimelineNode({
      id: `ww-mobile-demo-${date}-${segment}-${i}`,
      date,
      segment,
      time: row.time,
      text: row.text,
      kind: "note",
      tags: ["work"],
      importance: row.importance ?? 0.8,
      weaveTextStyle: row.style
    })
  );
}

/**
 * Demo nodes when the segment has no calendar or saved weave data.
 * @param {string} date
 * @param {DaySegment} segment
 * @returns {TimelineNode[]}
 */
export function getSegmentDemoNodes(date, segment) {
  if (shouldUseMobileWeaveShowcase()) {
    return getMobileShowcaseNodes(date, segment);
  }
  return demoSegmentNodes(date, segment);
}
