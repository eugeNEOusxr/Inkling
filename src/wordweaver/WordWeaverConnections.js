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
import { analyzePatterns, patternInsights, checkInQuestions, CONNECTIONS_PROMPT } from "../calendar/ai/patternBrain.js";

const BRACKET_RED = 0xff4d4d;

/** Per-user overrides — health reads as RED (user's "red health box"). */
const CAT_COLOR_OVERRIDE = {
  health: "#ef4444"
};

/** Category → display label. */
const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work", personal: "Personal",
  creative: "Creative", errands: "Errands", finance: "Finance",
  appointment: "Appointments", deadline: "Deadlines", reminder: "Reminders",
  social: "Social", default: "Other"
};

function catColor(cat) {
  const key = cat === "errand" ? "errands" : cat;
  return CAT_COLOR_OVERRIDE[key] ?? CategoryColors[key] ?? CategoryColors.default ?? "#94a3b8";
}

/** Gather events for a day, or for the whole (Sun-start) week containing it. */
function gatherEvents(iso, scope) {
  if (scope !== "week") return (getEventsForDate(iso) || []).map((e) => ({ ...e, _iso: iso }));
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay()); // back up to Sunday
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const di = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    for (const e of getEventsForDate(di) || []) out.push({ ...e, _iso: di });
  }
  return out;
}

const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function catOf(ev) {
  let c = String(ev.category || "").toLowerCase().trim();
  if (!c || c === "default") { try { c = classifyText(ev.text || "") || "default"; } catch { c = "default"; } }
  return c === "errand" ? "errands" : c;
}

/** Canvas text sprite (transparent, billboard-ish plane). Auto-shrinks the font
 *  so long notes FIT instead of being cut off. */
function labelSprite(text, { color = "#f1f5f9", size = 48, planeW = 4, planeH = 0.9, bg = null, maxChars = 46 } = {}) {
  const W = 720, H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, W, H);
    const t = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
    const padX = 26;
    let f = size;
    ctx.font = `800 ${f}px system-ui, sans-serif`;
    while (ctx.measureText(t).width > W - padX * 2 && f > 16) {
      f -= 2;
      ctx.font = `800 ${f}px system-ui, sans-serif`;
    }
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 6, 14, W - 12, H - 28, 18); ctx.fill(); }
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.fillText(t, W / 2, H / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  // Keep plane aspect = canvas aspect (W/H) so text isn't stretched.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeW * (H / W)), mat);
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
  const scope = opts.scope === "week" ? "week" : "day";
  const onScope = typeof opts.onScope === "function" ? opts.onScope : null;
  const camera = opts.camera ?? null;
  const controls = opts.controls ?? null;
  const group = new THREE.Group();
  group.name = "ww-connections-view";

  /** disposables */
  const disposers = [];
  /** @type {Array<{ mesh: THREE.Mesh, baseY: number, phase: number }>} */
  const animBoxes = [];
  const NOTE_CAP = 6;

  const events = gatherEvents(iso, scope);

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
  const heading = labelSprite(scope === "week" ? `🔗 Week of ${formatHeading(iso)}` : `🔗 ${formatHeading(iso)}`,
    { color: "#e0f2fe", size: 44, planeW: 10, planeH: 1.5 });
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
    const shown = items.slice(0, NOTE_CAP);
    const extra = items.length - shown.length;
    const rows = shown.length + (extra > 0 ? 1 : 0);
    const top = 3.3;
    const rowH = 1.15;
    const bottom = top - Math.max(1, rows) * rowH;
    const spineX = x - 2.6;
    segs.push({ from: new THREE.Vector3(x, 3.7, 0.02), to: new THREE.Vector3(spineX, top, 0.02) }); // box → spine top
    segs.push({ from: new THREE.Vector3(spineX, top, 0.02), to: new THREE.Vector3(spineX, bottom, 0.02) }); // spine
    // bracket end caps (the "[" feet)
    segs.push({ from: new THREE.Vector3(spineX, top, 0.02), to: new THREE.Vector3(spineX + 0.35, top, 0.02) });
    segs.push({ from: new THREE.Vector3(spineX, bottom, 0.02), to: new THREE.Vector3(spineX + 0.35, bottom, 0.02) });

    shown.forEach((ev, i) => {
      const y = top - 0.55 - i * rowH;
      segs.push({ from: new THREE.Vector3(spineX, y, 0.02), to: new THREE.Vector3(x - 2.2, y, 0.02) }); // tick
      const time = ev.time ? `${ev.time}  ` : "";
      const wd = scope === "week" && ev._iso ? `${WD_SHORT[new Date(ev._iso + "T12:00:00").getDay()]} ` : "";
      const note = labelSprite(`${wd}${time}${(ev.text || ev.title || "Note").trim()}`, {
        color: "#f8fafc", size: 30, planeW: 5.4, planeH: 0.82, bg: "rgba(10,14,26,0.55)"
      });
      note.mesh.position.set(x + 0.55, y, 0.05);
      group.add(note.mesh);
      disposers.push(note);
    });
    if (extra > 0) {
      const y = top - 0.55 - shown.length * rowH;
      const more = labelSprite(`+${extra} more`, { color: "#94a3b8", size: 26, planeW: 3, planeH: 0.7 });
      more.mesh.position.set(x + 0.2, y, 0.05);
      group.add(more.mesh);
      disposers.push(more);
    }
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

  // Top bar: Day/Week scope toggle + category filters (All + present categories).
  let filterBar = null;
  if (typeof document !== "undefined") {
    filterBar = document.createElement("div");
    filterBar.id = "ww-connections-filters";
    filterBar.style.cssText =
      "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:30;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;" +
      "max-width:92vw;background:rgba(8,12,22,0.82);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,0.4);" +
      "border-radius:999px;padding:5px 8px;box-shadow:0 6px 20px rgba(0,0,0,0.45)";
    const applyFilter = (key) => {
      for (const obj of group.children) {
        if (obj.userData.cat) obj.visible = key === "all" || obj.userData.cat === key;
      }
    };
    const mkBtn = (label, bg, onClick) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = `border:0;border-radius:999px;padding:6px 12px;font:700 12px system-ui;cursor:pointer;background:${bg};color:#fff`;
      b.addEventListener("click", onClick);
      filterBar.appendChild(b);
      return b;
    };
    // Scope: Day | Week (rebuilds the whole view through the scene).
    if (onScope) {
      mkBtn(scope === "day" ? "● Day" : "Day", scope === "day" ? "#0e7490" : "#1e293b", () => onScope("day"));
      mkBtn(scope === "week" ? "● Week" : "Week", scope === "week" ? "#0e7490" : "#1e293b", () => onScope("week"));
      const sep = document.createElement("span");
      sep.style.cssText = "width:1px;background:rgba(255,255,255,.2);margin:2px 2px";
      filterBar.appendChild(sep);
    }
    mkBtn("All", "#4338ca", () => applyFilter("all"));
    for (const cat of cats) mkBtn(CAT_LABEL[cat] ?? cat, catColor(cat), () => applyFilter(cat));
    document.body.appendChild(filterBar);
  }

  // Inkling chimes in INSIDE the world: the "any connections?" prompt + the
  // patterns it sees + a casual check-in. (bottom-left HUD, collapsible).
  let hud = null;
  if (typeof document !== "undefined") {
    const p = analyzePatterns();
    const insights = patternInsights(p).slice(0, 4);
    const checks = checkInQuestions({ max: 1 });
    hud = document.createElement("div");
    hud.id = "ww-connections-hud";
    hud.style.cssText =
      "position:fixed;left:12px;bottom:78px;z-index:30;width:min(320px,82vw);max-height:46vh;overflow:auto;" +
      "background:rgba(8,12,22,0.9);backdrop-filter:blur(10px);border:1px solid rgba(129,140,248,0.45);border-radius:14px;" +
      "padding:12px 13px;color:#e2e8f0;font:600 12px system-ui;box-shadow:0 10px 34px rgba(0,0,0,0.5)";
    const lines = [];
    lines.push(`<div style="display:flex;align-items:center;gap:7px;margin-bottom:7px"><span style="font-size:17px">✦</span><b style="color:#c7d2fe">Inkling</b></div>`);
    lines.push(`<div style="color:#a5b4fc;font-weight:800;margin-bottom:6px">${CONNECTIONS_PROMPT}</div>`);
    for (const s of insights) lines.push(`<div style="margin:3px 0;line-height:1.35">${s}</div>`);
    if (checks.length) lines.push(`<div style="margin-top:8px;color:#fbcfe8">💬 ${checks[0].replace(/</g, "&lt;")}</div>`);
    hud.innerHTML = lines.join("");
    const close = document.createElement("button");
    close.textContent = "×";
    close.style.cssText = "position:absolute;top:6px;right:8px;background:transparent;border:0;color:#64748b;font:800 16px system-ui;cursor:pointer";
    close.addEventListener("click", () => hud.remove());
    hud.appendChild(close);
    document.body.appendChild(hud);
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
      hud?.remove();
      scene.remove(group);
      for (const d of disposers) {
        try { d.mesh?.geometry?.dispose?.(); } catch { /* ignore */ }
        try { d.mat?.dispose?.(); } catch { /* ignore */ }
        try { d.tex?.dispose?.(); } catch { /* ignore */ }
      }
    }
  };
}
