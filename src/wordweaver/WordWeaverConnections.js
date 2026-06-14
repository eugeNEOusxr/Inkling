/**
 * WordWeaver — the 3D "connections" world (slice 1).
 *
 * Groups a day's notes by CATEGORY into animated category boxes, each wired to
 * its member notes by the red "bracket" style (the alert-popup look the user
 * likes). Filter buttons (All / Health / Work / …) show/hide categories. This is
 * where Inkling will visually surface the connections it finds.
 *
 * Self-contained like createDayView: returns { group, update, dispose }.
 */
import * as THREE from "three";
import { getEventsForDate, CategoryColors, classifyText } from "./timelineModel.js";

const BRACKET_RED = 0xff4d4d;

/** Category → display label. */
const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work", personal: "Personal",
  creative: "Creative", errands: "Errands", finance: "Finance",
  appointment: "Appointments", deadline: "Deadlines", reminder: "Reminders",
  social: "Social", default: "Other"
};

function catColor(cat) {
  return CategoryColors[cat === "errand" ? "errands" : cat] ?? CategoryColors.default ?? "#94a3b8";
}

function catOf(ev) {
  let c = String(ev.category || "").toLowerCase().trim();
  if (!c || c === "default") { try { c = classifyText(ev.text || "") || "default"; } catch { c = "default"; } }
  return c === "errand" ? "errands" : c;
}

/** Canvas text sprite (transparent, billboard-ish plane). */
function labelSprite(text, { color = "#f1f5f9", size = 48, planeW = 4, planeH = 0.9, bg = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 6, 18, 500, 92, 16); ctx.fill(); }
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.fillText(text.slice(0, 26), 256, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
  mesh.renderOrder = 11;
  return { mesh, mat, tex };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatHeading(iso) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
  } catch { return iso; }
}

/**
 * @param {THREE.Scene} scene
 * @param {{ iso: string, camera?: THREE.PerspectiveCamera, controls?: any }} opts
 */
export function createConnectionsView(scene, opts = {}) {
  const iso = opts.iso;
  const camera = opts.camera ?? null;
  const controls = opts.controls ?? null;
  const group = new THREE.Group();
  group.name = "ww-connections-view";

  /** disposables */
  const disposers = [];
  /** @type {Array<{ mesh: THREE.Mesh, baseY: number, phase: number }>} */
  const animBoxes = [];

  const events = getEventsForDate(iso) || [];

  // Group by category.
  /** @type {Map<string, any[]>} */
  const byCat = new Map();
  for (const ev of events) {
    const c = catOf(ev);
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(ev);
  }
  const cats = [...byCat.keys()].sort((a, b) => byCat.get(b).length - byCat.get(a).length);

  // Heading.
  const heading = labelSprite(`🔗 ${formatHeading(iso)}`, { color: "#e0f2fe", size: 46, planeW: 9, planeH: 1.5 });
  heading.mesh.position.set(0, 7.4, 0);
  group.add(heading.mesh);
  disposers.push(heading);

  if (!cats.length) {
    const empty = labelSprite("No notes to connect yet — jot a few and I'll wire them up.", { color: "#94a3b8", size: 30, planeW: 12, planeH: 1.2 });
    empty.mesh.position.set(0, 2, 0);
    group.add(empty.mesh);
    disposers.push(empty);
  }

  const COLW = 7;
  const colX = {};
  cats.forEach((c, i) => { colX[c] = (i - (cats.length - 1) / 2) * COLW; });

  const boxGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  const bracketMat = new THREE.LineBasicMaterial({ color: BRACKET_RED, transparent: true, opacity: 0.85 });
  disposers.push({ mat: bracketMat, mesh: { geometry: { dispose() {} } }, tex: { dispose() {} } });

  /** @type {{from:THREE.Vector3,to:THREE.Vector3}[]} */
  const segs = [];

  for (const cat of cats) {
    const x = colX[cat];
    const color = new THREE.Color(catColor(cat));
    const items = byCat.get(cat);

    // Category box (animated).
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color.clone().multiplyScalar(0.45), emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.2
    });
    const box = new THREE.Mesh(boxGeo, mat);
    box.position.set(x, 4.4, 0);
    group.add(box);
    animBoxes.push({ mesh: box, baseY: 4.4, phase: x });
    disposers.push({ mesh: box, mat, tex: { dispose() {} } });

    // Category label + count.
    const lab = labelSprite(`${CAT_LABEL[cat] ?? cat} · ${items.length}`, { color: "#" + color.getHexString(), size: 42, planeW: 5.4, planeH: 1.1 });
    lab.mesh.position.set(x, 5.9, 0);
    group.add(lab.mesh);
    disposers.push(lab);

    // Red BRACKET spine down the column + a tick to each note (the alert look).
    const top = 3.3;
    const rowH = 1.15;
    const bottom = top - Math.max(1, items.length) * rowH;
    const spineX = x - 2.6;
    segs.push({ from: new THREE.Vector3(x, 3.7, 0.02), to: new THREE.Vector3(spineX, top, 0.02) }); // box → spine top
    segs.push({ from: new THREE.Vector3(spineX, top, 0.02), to: new THREE.Vector3(spineX, bottom, 0.02) }); // spine
    // bracket end caps (the "[" feet)
    segs.push({ from: new THREE.Vector3(spineX, top, 0.02), to: new THREE.Vector3(spineX + 0.35, top, 0.02) });
    segs.push({ from: new THREE.Vector3(spineX, bottom, 0.02), to: new THREE.Vector3(spineX + 0.35, bottom, 0.02) });

    items.forEach((ev, i) => {
      const y = top - 0.55 - i * rowH;
      segs.push({ from: new THREE.Vector3(spineX, y, 0.02), to: new THREE.Vector3(x - 2.2, y, 0.02) }); // tick
      const time = ev.time ? `${ev.time}  ` : "";
      const note = labelSprite(`${time}${(ev.text || ev.title || "Note").trim()}`, {
        color: "#f8fafc", size: 30, planeW: 5.4, planeH: 0.82, bg: "rgba(10,14,26,0.55)"
      });
      note.mesh.position.set(x + 0.55, y, 0.05);
      group.add(note.mesh);
      disposers.push(note);
    });
  }

  // Build the red bracket lines.
  if (segs.length) {
    const pos = new Float32Array(segs.length * 6);
    segs.forEach((s, i) => {
      const o = i * 6;
      pos[o] = s.from.x; pos[o + 1] = s.from.y; pos[o + 2] = s.from.z;
      pos[o + 3] = s.to.x; pos[o + 4] = s.to.y; pos[o + 5] = s.to.z;
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geom, bracketMat);
    lines.renderOrder = 6;
    group.add(lines);
    disposers.push({ mesh: lines, mat: { dispose() {} }, tex: { dispose() {} } });
  }

  group.layers.set(1);
  group.traverse((o) => o.layers.set(1));
  scene.add(group);

  // Filter buttons (All + present categories).
  let filterBar = null;
  if (typeof document !== "undefined") {
    filterBar = document.createElement("div");
    filterBar.id = "ww-connections-filters";
    filterBar.style.cssText =
      "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:30;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;" +
      "max-width:92vw;background:rgba(8,12,22,0.82);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,0.4);" +
      "border-radius:999px;padding:5px 8px;box-shadow:0 6px 20px rgba(0,0,0,0.45)";
    const setVisible = (only) => {
      for (const cat of cats) {
        const show = only === "all" || only === cat;
        group.traverse((o) => { if (o.userData.cat) { /* per-object filter below */ } });
        void show;
      }
    };
    void setVisible;
    const mkF = (key, label, color) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText =
        `border:0;border-radius:999px;padding:6px 12px;font:700 12px system-ui;cursor:pointer;` +
        `background:${color || "#1e293b"};color:#fff`;
      b.addEventListener("click", () => applyFilter(key));
      filterBar.appendChild(b);
      return b;
    };
    const applyFilter = (key) => {
      for (const obj of group.children) {
        if (obj.userData.cat) obj.visible = key === "all" || obj.userData.cat === key;
      }
    };
    mkF("all", "All", "#4338ca");
    for (const cat of cats) mkF(cat, CAT_LABEL[cat] ?? cat, catColor(cat));
    if (cats.length) document.body.appendChild(filterBar);
  }

  // Tag children with their category so the filter can toggle them.
  // (Re-walk: assign cat to boxes/labels/notes/lines per column.)
  // Simplicity: rebuild mapping by x position is brittle, so tag at creation —
  // done below by re-tagging via stored references.
  // (We tagged nothing above; tag now using a second pass keyed by x.)
  for (const obj of group.children) {
    if (obj === heading.mesh) continue;
    const ox = obj.position?.x ?? 0;
    let best = null, bestD = Infinity;
    for (const cat of cats) {
      const d = Math.abs(ox - (colX[cat] ?? 999) ) ;
      if (d < bestD) { bestD = d; best = cat; }
    }
    if (best != null && bestD < COLW / 2 + 1.2) obj.userData.cat = best;
  }

  // Frame camera.
  if (camera && controls) {
    const span = Math.max(10, cats.length * COLW);
    camera.up.set(0, 1, 0);
    controls.minDistance = 4;
    controls.maxDistance = Math.max(controls.maxDistance || 0, span * 2 + 40);
    controls.target.set(0, 2.5, 0);
    camera.position.set(0, 2.5, span * 0.9 + 14);
    camera.far = Math.max(camera.far, span * 3 + 80);
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
  }

  return {
    group,
    update(t) {
      for (const b of animBoxes) {
        b.mesh.rotation.y = t * 0.5 + b.phase;
        b.mesh.rotation.x = Math.sin(t * 0.4 + b.phase) * 0.16;
        b.mesh.position.y = b.baseY + Math.sin(t * 1.0 + b.phase) * 0.12;
      }
    },
    dispose() {
      filterBar?.remove();
      scene.remove(group);
      for (const d of disposers) {
        try { d.mesh?.geometry?.dispose?.(); } catch { /* ignore */ }
        try { d.mat?.dispose?.(); } catch { /* ignore */ }
        try { d.tex?.dispose?.(); } catch { /* ignore */ }
      }
    }
  };
}
