/**
 * Axis-aligned separation so weave sign labels do not overlap.
 */

/** Half-width of the front reading arc (radians); signs outside are edge-on / faded. */
export const TREE_CYLINDER_READ_ARC = Math.PI * 0.4;

/** Seconds for one full 2π revolution of the spiral column. */
export const TREE_CYLINDER_PERIOD = 44;

/** Continuous Y rotation speed (rad/s) = 2π / period. */
export const TREE_CYLINDER_ROT_SPEED = (Math.PI * 2) / TREE_CYLINDER_PERIOD;

/**
 * @param {number} theta
 */
function wrapAngle(theta) {
  let a = theta % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

/**
 * Keep helix nodes separated on the cylinder surface (angle + height), not AABB boxing.
 * @param {Array<{ x: number, y: number, z: number, rotY?: number, cylTheta?: number, cylRadius?: number, text?: string, scale?: number }>} items
 * @param {{ minAngle?: number, minHeight?: number }} [opts]
 */
export function resolveCylinderSignPositions(items, opts = {}) {
  const minAngle = opts.minAngle ?? 0.5;
  const minHeight = opts.minHeight ?? 0.48;
  const out = items.map((it) => {
    const cylRadius = it.cylRadius ?? (Math.hypot(it.x, it.z) || 1.8);
    const cylTheta = it.cylTheta ?? Math.atan2(it.x, it.z);
    return { ...it, cylRadius, cylTheta };
  });

  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dTheta = Math.abs(wrapAngle(a.cylTheta) - wrapAngle(b.cylTheta));
        dTheta = Math.min(dTheta, Math.PI * 2 - dTheta);
        const dy = Math.abs(b.y - a.y);
        if (dTheta < minAngle && dy < minHeight) {
          const sign = wrapAngle(b.cylTheta) >= wrapAngle(a.cylTheta) ? 1 : -1;
          b.cylTheta = wrapAngle(b.cylTheta + sign * (minAngle - dTheta) * 0.6);
          b.x = Math.sin(b.cylTheta) * b.cylRadius;
          b.z = Math.cos(b.cylTheta) * b.cylRadius;
          b.rotY = b.cylTheta + Math.PI * 0.5;
          moved = true;
        } else if (dy < minHeight * 0.85 && dTheta < minAngle * 1.35) {
          b.y += minHeight * 0.45;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return out;
}

/**
 * Whether a sign on the rotating cylinder faces the viewer (+Z reading window).
 * @param {number} cylTheta — local azimuth on the cylinder
 * @param {number} groupRotY — weaveGroup.rotation.y
 */
export function isTreeCylinderReadable(cylTheta, groupRotY) {
  const worldTheta = Math.atan2(
    Math.sin(cylTheta + groupRotY),
    Math.cos(cylTheta + groupRotY)
  );
  return Math.abs(worldTheta) <= TREE_CYLINDER_READ_ARC * 0.5;
}

/**
 * @param {string} text
 * @param {number} scale
 */
function estimateHalfExtents(text, scale) {
  const len = Math.min(String(text || "").length, 28);
  return {
    halfW: (0.42 + len * 0.038) * scale,
    halfH: 0.32 * scale,
    halfD: 0.22 * scale
  };
}

/**
 * @param {Array<{ x: number, y: number, z: number, text?: string, scale?: number }>} items
 * @param {{ minGapX?: number, minGapY?: number, minGapZ?: number }} [opts]
 */
export function resolveSignPositions(items, opts = {}) {
  const minGapX = opts.minGapX ?? 0.42;
  const minGapY = opts.minGapY ?? 0.36;
  const minGapZ = opts.minGapZ ?? 0.34;
  const out = items.map((it) => ({ ...it }));

  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ea = estimateHalfExtents(a.text, a.scale ?? 1);
        const eb = estimateHalfExtents(b.text, b.scale ?? 1);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const overlapX = ea.halfW + eb.halfW + minGapX - Math.abs(dx);
        const overlapY = ea.halfH + eb.halfH + minGapY - Math.abs(dy);
        const overlapZ = ea.halfD + eb.halfD + minGapZ - Math.abs(dz);
        if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
          const push =
            overlapY >= overlapX && overlapY >= overlapZ
              ? { axis: "y", amount: overlapY * 0.55 }
              : overlapX >= overlapZ
                ? { axis: "x", amount: overlapX * 0.55 }
                : { axis: "z", amount: overlapZ * 0.55 };
          const sign = push.axis === "x" ? Math.sign(dx || 1) : push.axis === "y" ? Math.sign(dy || 1) : Math.sign(dz || 1);
          if (push.axis === "x") {
            a.x -= (push.amount * sign) / 2;
            b.x += (push.amount * sign) / 2;
          } else if (push.axis === "y") {
            a.y -= (push.amount * sign) / 2;
            b.y += (push.amount * sign) / 2;
          } else {
            a.z -= (push.amount * sign) / 2;
            b.z += (push.amount * sign) / 2;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return out;
}
