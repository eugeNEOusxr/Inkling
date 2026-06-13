/**
 * WeaverGalaxy — WordWeaver's "living constellation."
 *
 * Every note is a category-colored sphere. Spheres cluster by likeness (one
 * cluster per category) and each cluster slowly orbits CLOCKWISE in its own zone
 * so it stays grouped but feels alive. Click a sphere → a backplate sidebar
 * shows that day's notes (time, grouped by category) with a Back button to the
 * cluster world. Reading happens in the crisp DOM sidebar, so 3D text stays
 * small/minimal.
 *
 * Slice 1 (this file): clustered orbiting spheres + click→sidebar + back.
 * Next: write-on-wall billboard authoring + an insights/report panel.
 */
import * as THREE from "three";
import {
  getEventsForYear,
  getEventsForDate,
  getCategoryColor,
  classifyText
} from "./timelineModel.js";

const CAT_ORDER = ["health", "study", "work", "personal", "creative", "errands"];
const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work",
  personal: "Personal", creative: "Creative", errands: "Errands", default: "Other"
};
const MAX_SPHERES = 320;
const RING_RADIUS = 22; // distance of each category cluster from center

function catOf(text) {
  const c = classifyText(text);
  if (c === "errand") return "errands";
  return CAT_ORDER.includes(c) ? c : "default";
}
function colorInt(cat) {
  const c = cat === "errand" ? "errands" : cat;
  return parseInt(String(getCategoryColor(c)).replace("#", ""), 16) || 0x94a3b8;
}
function pad(n) { return String(n).padStart(2, "0"); }
function isoToday() { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; }
function dayDiff(a, b) { return Math.round((Date.parse(a + "T12:00:00") - Date.parse(b + "T12:00:00")) / 86400000); }

/** Shared radial glow texture for sphere auras. */
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export class WeaverGalaxy {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
   */
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.year = new Date().getFullYear();
    this.root = new THREE.Group();
    this.root.name = "weaver-galaxy";
    this.root.visible = false;
    scene.add(this.root);

    this._sphereGeo = new THREE.SphereGeometry(0.5, 18, 18);
    /** @type {Array<{ mesh: THREE.Mesh, glow: THREE.Sprite, cx: number, cy: number, cz: number, r: number, angle: number, speed: number, iso: string }>} */
    this._nodes = [];
    this._built = false;
    this._active = false;
    this._savedCam = null;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.layers.set(1);
    this._sidebar = null;
    this._hint = null;
    this._clock = 0;
    this._onPointerDown = this._onPointerDown.bind(this);
    this._downXY = null;
  }

  _build() {
    if (this._built) return;
    let notes = [];
    try {
      notes = getEventsForYear(this.year).map((r) => ({
        iso: r.date,
        cat: catOf(r.text ?? r.title ?? ""),
        minutes: (() => { const m = String(r.time ?? "0:0").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; })()
      }));
    } catch { /* ignore */ }
    notes = notes.slice(0, MAX_SPHERES);

    // Cluster centers — one per present category, evenly on a ring.
    const cats = CAT_ORDER.filter((c) => notes.some((n) => n.cat === c));
    if (!cats.includes("default") && notes.some((n) => n.cat === "default")) cats.push("default");
    const centers = {};
    cats.forEach((c, i) => {
      const a = (i / Math.max(1, cats.length)) * Math.PI * 2;
      centers[c] = { x: Math.cos(a) * RING_RADIUS, y: Math.sin(a) * RING_RADIUS * 0.6, z: 0 };
    });

    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    for (const n of notes) {
      const ctr = centers[n.cat] ?? { x: 0, y: 0, z: 0 };
      const r = 2 + Math.random() * 6;
      const angle = Math.random() * Math.PI * 2;
      const cz = (Math.random() - 0.5) * 8;
      const col = colorInt(n.cat);
      const m = new THREE.Mesh(this._sphereGeo, mat.clone());
      m.material.color.setHex(col);
      m.userData.iso = n.iso;
      m.layers.set(1);
      this.root.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      glow.scale.set(2.4, 2.4, 1);
      glow.layers.set(1);
      this.root.add(glow);
      this._nodes.push({ mesh: m, glow, cx: ctr.x, cy: ctr.y, cz: ctr.z + cz, r, angle, speed: 0.06 + Math.random() * 0.05, iso: n.iso });
    }
    this._positionAll();
    this._built = true;
  }

  _positionAll() {
    for (const nd of this._nodes) {
      const x = nd.cx + Math.cos(nd.angle) * nd.r;
      const y = nd.cy + Math.sin(nd.angle) * nd.r;
      nd.mesh.position.set(x, y, nd.cz);
      nd.glow.position.set(x, y, nd.cz - 0.05);
    }
  }

  // --- lifecycle ---

  show() {
    this._build();
    this.root.visible = true;
    this._active = true;
    // Reuse the journal's stable body class so the shell keeps #three-canvas
    // visible on this tab (CSS gates canvas visibility on it).
    document.body.classList.add("weaver-journal-active");
    this._buildSidebar();
    this._updateHint();
    this._saveCamOnce();
    // Frame the whole galaxy.
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 0, RING_RADIUS * 2.6);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.domElement?.addEventListener("pointerdown", this._onPointerDown);
    this.controls.domElement?.addEventListener("pointerup", this._onPointerUp ??= (e) => this._handlePointerUp(e));

    // Open the WordWeaver reader straight away, on the nearest day that has
    // notes (so you land on something readable instead of an empty panel).
    if (this._nodes.length) {
      const today = isoToday();
      let openIso = today, bestD = Infinity;
      for (const nd of this._nodes) {
        const dd = Math.abs(dayDiff(nd.iso, today));
        if (dd < bestD) { bestD = dd; openIso = nd.iso; }
      }
      this._highlightDate(openIso);
      this._openSidebar(openIso);
    }
  }

  hide() {
    this.root.visible = false;
    this._active = false;
    document.body.classList.remove("weaver-journal-active");
    if (this._sidebar) this._sidebar.style.display = "none";
    if (this._hint) this._hint.style.display = "none";
    this.controls.domElement?.removeEventListener("pointerdown", this._onPointerDown);
    if (this._onPointerUp) this.controls.domElement?.removeEventListener("pointerup", this._onPointerUp);
    if (this._savedCam) {
      this.camera.position.copy(this._savedCam.pos);
      this.controls.target.copy(this._savedCam.target);
      this.camera.near = this._savedCam.near;
      this.camera.far = this._savedCam.far;
      this.controls.minDistance = this._savedCam.minD;
      this.controls.maxDistance = this._savedCam.maxD;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this._savedCam = null;
    }
  }

  _saveCamOnce() {
    if (this._savedCam) return;
    this._savedCam = {
      pos: this.camera.position.clone(), target: this.controls.target.clone(),
      near: this.camera.near, far: this.camera.far,
      minD: this.controls.minDistance, maxD: this.controls.maxDistance
    };
    this.controls.minDistance = 6;
    this.controls.maxDistance = 200;
    this.camera.far = Math.max(this.camera.far, 600);
    this.camera.updateProjectionMatrix();
  }

  update() {
    if (!this._active || !this.root.visible) return;
    this._clock += 0.016;
    for (const nd of this._nodes) {
      nd.angle -= nd.speed * 0.016; // clockwise drift within the cluster
    }
    this._positionAll();
  }

  // --- interaction ---

  _onPointerDown(e) { this._downXY = { x: e.clientX, y: e.clientY }; }

  _handlePointerUp(e) {
    if (!this._active || !this._downXY) return;
    const moved = Math.hypot(e.clientX - this._downXY.x, e.clientY - this._downXY.y);
    this._downXY = null;
    if (moved > 6) return; // a drag (orbit), not a click
    const el = this.controls.domElement;
    const rect = el.getBoundingClientRect();
    const ptr = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(ptr, this.camera);
    const hits = this._raycaster.intersectObjects(this._nodes.map((n) => n.mesh), false);
    if (hits.length) this._openSidebar(hits[0].object.userData.iso);
  }

  /**
   * Fly to + highlight the node(s) for a date and open its sidebar.
   * (Inkling: "take me to my birthday on June 16" → this.)
   * @param {string} iso
   */
  focusDate(iso) {
    this._build();
    const target = this._highlightDate(iso);
    if (target) {
      this.camera.position.set(target.x, target.y, target.z + 16);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
    this._openSidebar(iso);
  }

  /**
   * Enlarge + brighten the node(s) for a date; return their average position
   * (or null if none). Camera is NOT moved here.
   * @param {string} iso
   * @returns {THREE.Vector3 | null}
   */
  _highlightDate(iso) {
    const target = new THREE.Vector3();
    let count = 0;
    for (const nd of this._nodes) {
      const on = nd.iso === iso;
      nd.mesh.scale.setScalar(on ? 2.3 : 1);
      nd.glow.scale.set(on ? 5 : 2.4, on ? 5 : 2.4, 1);
      if (on) { target.add(nd.mesh.position); count++; }
    }
    return count ? target.multiplyScalar(1 / count) : null;
  }

  /** Page the WordWeaver reader to the prev/next calendar day (no camera move). */
  _shiftReader(delta) {
    const base = this._readerIso || isoToday();
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d + delta);
    const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    this._highlightDate(iso);
    this._openSidebar(iso);
  }

  // --- sidebar backplate ---

  _buildSidebar() {
    if (this._sidebar) return;
    const panel = document.createElement("div");
    panel.id = "weaver-galaxy-sidebar";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(360px,88vw);z-index:10280;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.94);backdrop-filter:blur(10px);" +
      "border-left:1px solid rgba(99,102,241,0.4);color:#e2e8f0;font:600 12px system-ui;" +
      "box-shadow:-12px 0 40px rgba(0,0,0,0.5)";

    // Brand header — this reader IS WordWeaver.
    const brand = document.createElement("div");
    brand.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const brandTitle = document.createElement("div");
    brandTitle.textContent = "✦ WordWeaver";
    brandTitle.style.cssText =
      "font:800 17px system-ui;letter-spacing:.3px;" +
      "background:linear-gradient(90deg,#c7d2fe,#a5b4fc,#f0abfc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent";
    const collapse = document.createElement("button");
    collapse.textContent = "✕";
    collapse.title = "Back to the galaxy";
    collapse.style.cssText =
      "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;flex:0 0 auto";
    collapse.addEventListener("click", () => { panel.style.display = "none"; });
    brand.append(brandTitle, collapse);

    // Day-nav row: ‹ [date] › — page through any day's notes.
    const nav = document.createElement("div");
    nav.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08)";
    const prev = document.createElement("button"); prev.textContent = "‹"; prev.title = "Previous day";
    const next = document.createElement("button"); next.textContent = "›"; next.title = "Next day";
    for (const b of [prev, next]) {
      b.style.cssText =
        "background:#312e81;color:#e0e7ff;border:0;border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:18px;line-height:1;flex:0 0 auto";
    }
    prev.addEventListener("click", () => this._shiftReader(-1));
    next.addEventListener("click", () => this._shiftReader(1));
    const title = document.createElement("div");
    title.style.cssText = "flex:1;text-align:center;font:800 14px system-ui;color:#e6ebff";
    nav.append(prev, title, next);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:12px 14px";

    panel.append(brand, nav, body);
    document.body.appendChild(panel);
    this._sidebar = panel;
    this._sidebarTitle = title;
    this._sidebarBody = body;
  }

  _openSidebar(iso) {
    if (!iso) return;
    this._buildSidebar();
    this._readerIso = iso;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    this._sidebarTitle.textContent = `${wd} ${MON[m - 1]} ${d}, ${y}`;

    let events = [];
    try { events = getEventsForDate(iso) ?? []; } catch { /* ignore */ }
    // Group by likeness (category).
    const groups = {};
    for (const ev of events) {
      const cat = catOf(ev.text ?? ev.title ?? "");
      (groups[cat] ||= []).push(ev);
    }
    this._sidebarBody.textContent = "";
    if (!events.length) {
      const empty = document.createElement("div");
      empty.textContent = "No notes this day.";
      empty.style.cssText = "color:#94a3b8;font-size:12px";
      this._sidebarBody.appendChild(empty);
    }
    for (const cat of [...CAT_ORDER, "default"]) {
      const list = groups[cat];
      if (!list?.length) continue;
      const hdr = document.createElement("div");
      const color = getCategoryColor(cat);
      hdr.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;margin-right:6px"></span>${CAT_LABEL[cat] ?? cat}`;
      hdr.style.cssText = "display:flex;align-items:center;font:700 12px system-ui;color:#cbd5e1;margin:10px 0 5px";
      this._sidebarBody.appendChild(hdr);
      for (const ev of list.sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
        const row = document.createElement("div");
        row.style.cssText = `display:flex;gap:8px;padding:5px 8px;border-left:3px solid ${color};background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px`;
        row.innerHTML =
          `<span style="color:#a5b4fc;font-weight:700;font-size:11px;flex:0 0 auto">${String(ev.time).slice(0, 5)}</span>` +
          `<span style="font-size:12px;color:#e2e8f0;font-weight:600">${escapeHtml(ev.text || ev.title || "Note")}</span>`;
        this._sidebarBody.appendChild(row);
      }
    }
    this._sidebar.style.display = "flex";
  }

  _updateHint() {
    if (!this._nodes.length) {
      if (!this._hint) {
        const h = document.createElement("div");
        h.id = "weaver-galaxy-hint";
        h.style.cssText =
          "position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);z-index:10270;text-align:center;" +
          "color:#cbd5e1;font:600 15px system-ui;background:rgba(8,12,22,0.7);padding:16px 22px;border-radius:14px;" +
          "border:1px solid rgba(99,102,241,0.35);max-width:300px";
        h.innerHTML = "✦ Your galaxy is empty.<br><span style='opacity:.7;font-size:13px'>Add notes in Schedule and they'll cluster here by color.</span>";
        document.body.appendChild(h);
        this._hint = h;
      }
      this._hint.style.display = "block";
    } else if (this._hint) {
      this._hint.style.display = "none";
    }
  }

  dispose() {
    this.hide();
    for (const nd of this._nodes) { nd.mesh.material.dispose(); nd.glow.material.dispose(); }
    this._sphereGeo.dispose();
    this._sidebar?.remove();
    this._sidebar = null;
    this._hint?.remove();
    this._hint = null;
    this.scene.remove(this.root);
    this._built = false;
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
