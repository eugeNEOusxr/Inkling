import * as THREE from "three";

/** @typedef {'food'|'alarm'|'note'|'appointment'|'goal'|'task'|'default'} AtomMarkerKind */

/** @type {Record<AtomMarkerKind, { nucleus: number, ring: number, glow: number, photon: number }>} */
export const ATOM_MARKER_COLORS = {
  food: { nucleus: 0xfbbf24, ring: 0xfde68a, glow: 0xf59e0b, photon: 0xfffbeb },
  alarm: { nucleus: 0xef4444, ring: 0xf87171, glow: 0xdc2626, photon: 0xfecaca },
  note: { nucleus: 0x38bdf8, ring: 0x7dd3fc, glow: 0x0ea5e9, photon: 0xe0f2fe },
  appointment: { nucleus: 0x22c55e, ring: 0x4ade80, glow: 0x16a34a, photon: 0xbbf7d0 },
  goal: { nucleus: 0xd4af37, ring: 0xfde68a, glow: 0xb45309, photon: 0xfff7ed },
  task: { nucleus: 0x4ee6e6, ring: 0xa8f7f7, glow: 0x0891b2, photon: 0xecfeff },
  default: { nucleus: 0x7dd3fc, ring: 0x38bdf8, glow: 0x6366f1, photon: 0xe0f2fe }
};

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @returns {AtomMarkerKind}
 */
export function resolveAtomMarkerKind(node) {
  const link = node?.calendarLink;
  if (link?.itemType === "alarm") return "alarm";
  if (link?.itemType === "reminder") return "alarm";

  const tags = node?.tags ?? [];
  if (tags.some((t) => ["breakfast", "lunch", "dinner", "meal"].includes(t))) return "food";
  if (tags.includes("work")) return "task";

  const text = String(node?.text ?? "");
  if (/\b(goal|target|milestone|aim)\b/i.test(text)) return "goal";
  if (/\b(task|todo|to-do)\b/i.test(text)) return "task";

  if (node?.kind === "appointment") return "appointment";
  if (node?.kind === "meal") return "food";
  if (node?.kind === "insight") return "goal";
  if (node?.kind === "note") return "note";

  return "default";
}

/**
 * Light-blue style atom: nucleus + pulsating orbital rings + photon particles.
 * @param {AtomMarkerKind} kind
 */
export function createWeaverAtomMarker(kind = "default") {
  const style = ATOM_MARKER_COLORS[kind] ?? ATOM_MARKER_COLORS.default;
  const atom = new THREE.Group();
  atom.name = "weave-atom-marker";
  atom.userData.type = "weave-atom-marker";
  atom.userData.markerKind = kind;
  atom.userData.phase = Math.random() * Math.PI * 2;

  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, 18, 18),
    new THREE.MeshBasicMaterial({
      color: style.nucleus,
      transparent: true,
      opacity: 0.92
    })
  );
  nucleus.userData.part = "nucleus";
  atom.add(nucleus);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 14),
    new THREE.MeshBasicMaterial({
      color: style.glow,
      transparent: true,
      opacity: 0.22
    })
  );
  glow.userData.part = "glow";
  atom.add(glow);

  /** @type {THREE.Mesh[]} */
  const rings = [];
  const ringRadii = [0.2, 0.27, 0.33];
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadii[r], 0.011, 10, 56),
      new THREE.MeshBasicMaterial({
        color: style.ring,
        transparent: true,
        opacity: 0.52
      })
    );
    ring.userData.baseRotX = Math.PI / 2 + r * 0.62;
    ring.userData.baseRotY = r * 0.95;
    ring.rotation.x = ring.userData.baseRotX;
    ring.rotation.y = ring.userData.baseRotY;
    ring.userData.ringIndex = r;
    ring.userData.part = "ring";
    rings.push(ring);
    atom.add(ring);
  }
  atom.userData.rings = rings;

  /** @type {THREE.Mesh[]} */
  const photons = [];
  for (let p = 0; p < 4; p++) {
    const photon = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 8),
      new THREE.MeshBasicMaterial({
        color: style.photon,
        transparent: true,
        opacity: 0.94
      })
    );
    photon.userData.photonIndex = p;
    photon.userData.part = "photon";
    photons.push(photon);
    atom.add(photon);
  }
  atom.userData.photons = photons;
  atom.userData.style = style;

  return atom;
}

/**
 * Pulsating sin/cos motion for rings and orbiting photons.
 * @param {THREE.Group} atom
 * @param {number} t elapsed seconds
 */
export function updateWeaverAtomMarker(atom, t) {
  if (!atom?.userData) return;
  const phase = atom.userData.phase ?? 0;

  const glow = atom.children.find((c) => c.userData?.part === "glow");
  if (glow instanceof THREE.Mesh && glow.material) {
    const pulse = 0.18 + Math.cos(t * 2.1 + phase) * 0.08 + 0.08;
    glow.material.opacity = pulse;
    const s = 1 + Math.sin(t * 1.6 + phase) * 0.06;
    glow.scale.setScalar(s);
  }

  for (const ring of atom.userData.rings ?? []) {
    const i = ring.userData.ringIndex ?? 0;
    const scalePulse = 0.88 + Math.sin(t * 2.35 + phase + i * 0.9) * 0.14;
    ring.scale.set(scalePulse, scalePulse, 1);
    if (ring.material) {
      ring.material.opacity = 0.32 + Math.cos(t * 1.75 + phase + i * 0.6) * 0.22 + 0.28;
    }
    ring.rotation.x = ring.userData.baseRotX + Math.sin(t * 0.45 + phase + i) * 0.12;
    ring.rotation.z = Math.cos(t * 0.55 + phase + i * 0.4) * 0.25;
  }

  for (const photon of atom.userData.photons ?? []) {
    const p = photon.userData.photonIndex ?? 0;
    const angle = t * (1.05 + p * 0.08) + phase + p * (Math.PI * 0.5);
    const r = 0.24 + p * 0.03 + Math.sin(t * 2.2 + phase + p) * 0.045;
    photon.position.set(
      Math.cos(angle) * r,
      Math.sin(t * 1.4 + phase + p * 0.7) * 0.11,
      Math.sin(angle) * r * Math.cos(p * 0.35)
    );
  }

  atom.rotation.y = t * 0.28 + phase;
}
