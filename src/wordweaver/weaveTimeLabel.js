import { Real3DText } from "./Real3DText.js";
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

/**
 * @param {string} [time] HH:MM
 */
export function formatWeaveTime(time) {
  const raw = String(time || "12:00").trim().split("~")[0];
  const [hRaw, mRaw] = raw.split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw ?? 0);
  if (!Number.isFinite(hour)) return raw;
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Gold time stamp floating with woven text (street / letters / mobile extruded).
 * @param {THREE.Group} group
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {import('./Real3DText.js').Real3DText[]} disposed
 * @param {number} [layoutScale]
 */
/** Neon aqua used for weave timestamps (readable above thought text). */
export const WEAVE_TIME_COLOR = 0x38bdf8;
export const WEAVE_TIME_GLOW = 0x22d3ee;

export function attachWeaveTimeLabel(group, node, disposed, layoutScale = 1) {
  if (!group || !node?.time || node.kind === "insight") return;

  const mobile = isMobileWordWeaver();
  const scale = layoutScale;
  const label = formatWeaveTime(node.time);
  const size = (mobile ? 0.3 : 0.24) * scale;

  const pole = new Real3DText(label, {
    fontSize: size,
    color: WEAVE_TIME_COLOR,
    glowColor: WEAVE_TIME_GLOW,
    metalness: 0.15,
    roughness: 0.35,
    emissiveIntensity: mobile ? 1.15 : 1,
    depth: 0.05 * scale
  });

  const poleGroup = pole.getGroup();
  poleGroup.position.set(0, (mobile ? 1.2 : 1.02) * scale, 0.04 * scale);
  poleGroup.userData = { type: "weave-time", node };

  group.add(poleGroup);
  disposed.push(pole);
}
