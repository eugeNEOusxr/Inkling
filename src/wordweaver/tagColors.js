import { getActivePalette } from "../theme/appearancePalettes.js";

const ACCENT_GLOW = 0x6366f1;

/** @type {Record<string, number>} */
const TAG_GLOW = {
  vacation: 0xfbbf24,
  work: 0xc9a227,
  hospital: 0xf87171,
  doctors: 0xf472b6,
  sick: 0xfb923c,
  breakfast: 0xfde68a,
  lunch: 0xa3e635,
  dinner: 0xf97316,
  travel: 0x38bdf8,
  social: 0xa78bfa
};

/** @type {Record<string, number>} */
const KIND_GLOW = {
  vacation: 0xfbbf24,
  work: 0xc9a227,
  medical: 0xf87171,
  sick: 0xfb923c,
  meal: 0xfde68a,
  travel: 0x38bdf8,
  social: 0xa78bfa,
  appointment: 0x6366f1,
  note: 0x0a7ea4,
  other: 0x38bdf8
};

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 */
export function glowColorForNode(node) {
  const palette = getActivePalette();
  for (const tag of node.tags ?? []) {
    if (TAG_GLOW[tag]) return TAG_GLOW[tag];
  }
  if (node.kind === "insight") return palette.wwInsight ?? KIND_GLOW.insight;
  if (node.kind === "appointment") return palette.wwGlowDefault ?? KIND_GLOW.appointment;
  if (node.kind === "note") return palette.wwNode ?? KIND_GLOW.note;
  return palette.wwGlowDefault ?? KIND_GLOW[node.kind] ?? ACCENT_GLOW;
}
