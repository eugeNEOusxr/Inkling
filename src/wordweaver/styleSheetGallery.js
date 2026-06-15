import { createTimelineNode, buildSegmentModule } from "../inkling-core/timelineNode.js";
import {
  STYLE_PRESETS,
  GEOMETRY_STYLES,
  HYBRID_STYLES,
  ANIMATION_STYLES,
  MATERIAL_STYLES
} from "./weaveTextStyleCatalog.js";
import { resolveWeaveTextStyle, DEFAULT_WEAVE_TEXT_STYLE } from "./weaveTextStyleSettings.js";

export const STYLE_SHEET_GALLERY_MAX = 16;

/**
 * Demo nodes for the Style sheet tab — one sample per preset, geometry, hybrid, animation, material.
 * @param {string} dateStr YYYY-MM-DD
 */
export function buildStyleSheetGalleryModule(dateStr) {
  /** @type {import('../inkling-core/timelineNode.js').TimelineNode[]} */
  const nodes = [];
  let i = 0;

  const push = (id, label, stylePartial) => {
    if (nodes.length >= STYLE_SHEET_GALLERY_MAX) return;
    const hour = 9 + Math.floor(i / 4);
    const minute = (i * 11) % 60;
    nodes.push(
      createTimelineNode({
        id: `ww-sheet-${id}`,
        date: dateStr,
        segment: "afternoon",
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        text: label.length > 22 ? `${label.slice(0, 20)}…` : label,
        kind: "note",
        importance: 0.82,
        weaveTextStyle: resolveWeaveTextStyle(stylePartial)
      })
    );
    i += 3;
  };

  for (const preset of STYLE_PRESETS) {
    push(preset.id, preset.label, preset.style);
  }

  for (const geo of GEOMETRY_STYLES) {
    push(`geo-${geo.id}`, geo.label.split("(")[0].trim(), {
      ...DEFAULT_WEAVE_TEXT_STYLE,
      geometry: geo.id,
      fontId: "techno_orbitron",
      material: geo.id === "voxel" ? "brushed_aluminum" : "neon_emissive",
      animation: geo.id === "hologram" ? "hologram_flicker" : "bobbing",
      fontSize: 0.72
    });
  }

  for (const hybrid of HYBRID_STYLES) {
    push(`hy-${hybrid.id}`, hybrid.label, {
      ...DEFAULT_WEAVE_TEXT_STYLE,
      hybrid: hybrid.id,
      fontSize: 0.7
    });
  }

  for (const anim of ANIMATION_STYLES) {
    push(`anim-${anim.id}`, anim.label, {
      ...DEFAULT_WEAVE_TEXT_STYLE,
      geometry: "extruded",
      material: "gold",
      animation: anim.id,
      fontSize: 0.68
    });
  }

  for (const mat of MATERIAL_STYLES.slice(0, 4)) {
    if (nodes.length >= STYLE_SHEET_GALLERY_MAX) break;
    push(`mat-${mat.id}`, mat.label, {
      ...DEFAULT_WEAVE_TEXT_STYLE,
      geometry: "extruded",
      material: mat.id,
      fontSize: 0.66
    });
  }

  return buildSegmentModule(dateStr, "afternoon", nodes);
}
