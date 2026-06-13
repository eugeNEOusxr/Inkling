/**
 * WordWeaver Journal — a 3D journaling hall (a "memory wall").
 *
 * The year becomes 365 day-platforms, each with a giant white backboard wall you
 * write your memories onto. Days are grouped into 12 month-clusters in a 4×3
 * gallery hall. Tapping WordWeaver opens a small calendar navigator that
 * teleports the camera to any day's wall. Empty walls show a gentle prompt
 * ("What mattered today?"); you write your own remarks in any style/size/color
 * and can delete any remark with ✕.
 *
 * Journaling ONLY — it deliberately does NOT pull in calendar events/notes.
 *
 * Self-contained: renders into the shared scene via the shared camera/controls.
 */
import * as THREE from "three";
import { createReal3DText, preloadReal3DFont, isReal3DFontReady } from "./Real3DText.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// --- World geometry constants ---
const CW = 5;        // day wall width
const CH = 5;        // day wall height
const GAP = 0.8;     // gap between day cells
const PX = CW + GAP; // cell pitch x
const PY = CH + GAP; // cell pitch y
const DAY_COLS = 7;  // days per wall-row inside a month
const DAY_ROWS = 5;  // max rows (ceil(31/7))
const MW = DAY_COLS * PX;        // month cluster width
const MH = DAY_ROWS * PY;        // month cluster height
const MGAP_X = 12;
const MGAP_Y = 16;
const MX = MW + MGAP_X;          // month pitch x
const MY = MH + MGAP_Y;          // month pitch y

/** Gentle placeholder prompts for an empty wall — rotates per day (stable). */
const PROMPTS = [
  "What mattered today?",
  "Remember today…",
  "Today, in your words",
  "One good moment?",
  "What are you grateful for?",
  "How did today feel?",
  "Worth remembering…"
];

/**
 * 3D "look" presets → Real3DText material/geometry params. `s` is the world font
 * size; depth/metalness/glow are derived so each style reads distinctly.
 */
const STYLE_PRESETS = {
  flat: (s) => ({ fontSize: s, depth: 0.03, metalness: 0.0, roughness: 0.95, emissiveIntensity: 0.0 }),
  beveled: (s) => ({ fontSize: s, depth: s * 0.18, metalness: 0.35, roughness: 0.4, emissiveIntensity: 0.3 }),
  extrude: (s) => ({ fontSize: s, depth: s * 0.55, metalness: 0.25, roughness: 0.5, emissiveIntensity: 0.2 }),
  neon: (s) => ({ fontSize: s, depth: s * 0.12, metalness: 0.0, roughness: 0.3, emissiveIntensity: 1.7 }),
  chrome: (s) => ({ fontSize: s, depth: s * 0.2, metalness: 0.98, roughness: 0.08, emissiveIntensity: 0.12 })
};
const STYLE_LABELS = [
  ["beveled", "Beveled"], ["extrude", "Deep extrude"],
  ["neon", "Neon glow"], ["chrome", "Chrome"], ["flat", "Flat"]
];
/** Color swatches for the composer (label-friendly journaling palette). */
const SWATCHES = [
  "#4DA6FF", "#FF4D4D", "#4DFF88", "#FFD24D",
  "#B84DFF", "#FF884D", "#FFFFFF", "#0B1020"
];

function isoFor(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Sprite label (canvas texture) that always faces the camera. */
function makeLabelSprite(text, worldHeight, color = "#e8edf6") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontPx = 96;
  ctx.font = `700 ${fontPx}px Outfit, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + 48);
  const h = Math.ceil(fontPx * 1.4);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `700 ${fontPx}px Outfit, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(99,102,241,0.9)";
  ctx.shadowBlur = 18;
  ctx.fillText(text, 24, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((w / h) * worldHeight, worldHeight, 1);
  return { sprite, tex, mat };
}

export class WeaverJournal {
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
    this.root.name = "weaver-journal";
    this.root.visible = false;
    scene.add(this.root);

    this._built = false;
    this._active = false;
    this._savedCam = null;
    this._ui = null;
    this._dayLayer = new THREE.Group();
    this.root.add(this._dayLayer);
    /** @type {import("./Real3DText.js").Real3DText[]} */
    this._dayTexts = [];
    this._selectedIso = null;
    /** iso -> instanced-wall index, for re-tinting journaled days. */
    this._isoWallIndex = new Map();
    /** Whether the calendar navigator is collapsed to the left edge. */
    this._calMinimized = false;
    /** iso -> array of placed-note specs {text,style,color,size,x,y}. */
    this._placed = new Map();
    /** Composer DOM + live preview state. */
    this._composer = null;
    this._composerInput = null;
    this._preview = null;
    this._composeState = { text: "", style: "beveled", color: 0x4da6ff, size: 0.9 };
    /** Camera tween state. */
    this._tween = null;
    // Picker month (display only)
    const now = new Date();
    this._calYear = now.getFullYear();
    this._calMonth = now.getMonth();

    this._onFontReady = () => {
      if (this._active && this._selectedIso) this._renderDayText(this._selectedIso);
    };
  }

  // --- World ---

  /** Top-left cell origin → world position of a given day's wall center. */
  _cellPos(monthIndex, day, out = new THREE.Vector3()) {
    const mcol = monthIndex % 4;
    const mrow = Math.floor(monthIndex / 4);
    const monthOriginX = (mcol - 1.5) * MX;
    const monthOriginY = (1 - mrow) * MY;
    const dcol = (day - 1) % DAY_COLS;
    const drow = Math.floor((day - 1) / DAY_COLS);
    const x = monthOriginX + (dcol - (DAY_COLS - 1) / 2) * PX;
    const y = monthOriginY + ((DAY_ROWS - 1) / 2 - drow) * PY;
    return out.set(x, y, 0);
  }

  _build() {
    if (this._built) return;
    void preloadReal3DFont();
    window.addEventListener("wordweaver:font-ready", this._onFontReady);

    // Count total days in the year.
    let total = 0;
    for (let m = 0; m < 12; m++) total += daysInMonth(this.year, m);

    // Instanced white walls + platform ledges.
    const wallGeom = new THREE.PlaneGeometry(1, 1);
    const wallMat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
    const walls = new THREE.InstancedMesh(wallGeom, wallMat, total);
    walls.name = "journal-walls";

    const plGeom = new THREE.BoxGeometry(1, 1, 1);
    const plMat = new THREE.MeshBasicMaterial({ color: 0x2b3550, toneMapped: false });
    const platforms = new THREE.InstancedMesh(plGeom, plMat, total);
    platforms.name = "journal-platforms";

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const baseWhite = new THREE.Color(0xeef1f7);

    let i = 0;
    for (let mo = 0; mo < 12; mo++) {
      const dim = daysInMonth(this.year, mo);
      for (let d = 1; d <= dim; d++) {
        this._cellPos(mo, d, pos);
        // wall — all start plain white; journaled days get tinted on write.
        m.compose(pos, q, new THREE.Vector3(CW, CH, 1));
        walls.setMatrixAt(i, m);
        const iso = isoFor(this.year, mo, d);
        this._isoWallIndex.set(iso, i);
        walls.setColorAt(i, baseWhite);
        // platform ledge jutting toward viewer at the wall base
        m.compose(
          new THREE.Vector3(pos.x, pos.y - CH / 2 - 0.25, 1.4),
          q,
          new THREE.Vector3(CW, 0.4, 2.8)
        );
        platforms.setMatrixAt(i, m);
        i++;
      }
    }
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    platforms.instanceMatrix.needsUpdate = true;
    // Instance transforms aren't reflected in the geometry's bounding sphere, so
    // the default frustum cull would drop the whole grid when looking off-origin.
    walls.frustumCulled = false;
    platforms.frustumCulled = false;
    walls.computeBoundingSphere?.();
    platforms.computeBoundingSphere?.();

    this.root.add(walls, platforms);
    this._walls = walls;
    this._platforms = platforms;

    // Month labels above each cluster.
    this._labels = [];
    for (let mo = 0; mo < 12; mo++) {
      const mcol = mo % 4;
      const mrow = Math.floor(mo / 4);
      const ox = (mcol - 1.5) * MX;
      const oy = (1 - mrow) * MY;
      const { sprite, tex, mat } = makeLabelSprite(`${MONTHS[mo]} ${this.year}`, 4.4);
      sprite.position.set(ox, oy + (DAY_ROWS / 2) * PY + 3.4, 1);
      this.root.add(sprite);
      this._labels.push({ sprite, tex, mat });
    }

    // Lights so the 3D text reads regardless of scene lighting.
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(0, 30, 60);
    this.root.add(amb, dir);
    this._lights = [amb, dir];

    this._built = true;
  }

  // --- Day text (LOD: only the focused day is mounted) ---

  _clearDayText() {
    for (const t of this._dayTexts) {
      try { t.dispose(); } catch { /* ignore */ }
    }
    this._dayTexts = [];
    if (this._preview) {
      try { this._preview.dispose(); } catch { /* ignore */ }
      this._preview = null;
    }
    this._dayLayer.clear();
  }

  /** Real3DText options for a (style, size, color) selection. */
  _styleParams(style, size, color) {
    const base = (STYLE_PRESETS[style] ?? STYLE_PRESETS.beveled)(size);
    return { ...base, color, glowColor: style === "neon" ? color : color };
  }

  _journaledCount(iso) {
    return (this._placed.get(iso) ?? []).length;
  }

  /** Stable gentle prompt for a given day. */
  _promptFor(iso) {
    let h = 0;
    for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) >>> 0;
    return PROMPTS[h % PROMPTS.length];
  }

  /** Re-tint a wall instance to reflect whether the day has been journaled. */
  _refreshWall(iso) {
    const idx = this._isoWallIndex.get(iso);
    if (idx == null || !this._walls) return;
    const c = new THREE.Color(0xeef1f7);
    if (this._journaledCount(iso) > 0) c.lerp(new THREE.Color(0xffe0a8), 0.55);
    this._walls.setColorAt(idx, c);
    if (this._walls.instanceColor) this._walls.instanceColor.needsUpdate = true;
  }

  /** Mount the user-placed remarks for a day from their saved specs. */
  _renderPlaced(iso) {
    const specs = this._placed.get(iso);
    if (!specs?.length) return;
    for (const s of specs) {
      const t = createReal3DText(s.text, this._styleParams(s.style, s.size, s.color));
      t.setPosition(s.x, s.y, 0.45);
      this._dayLayer.add(t.getGroup());
      this._dayTexts.push(t);
    }
  }

  _renderDayText(iso) {
    this._clearDayText();
    const [y, mo, d] = iso.split("-").map(Number);
    const center = this._cellPos(mo - 1, d, new THREE.Vector3());
    const ready = isReal3DFontReady();

    // Header — day number + weekday, pinned at the very top of the wall.
    const dateObj = new Date(y, mo - 1, d);
    const header = `${d} ${WEEKDAYS_FULL[dateObj.getDay()]}`;
    const headText = createReal3DText(header, {
      fontSize: ready ? 0.5 : 0.42, depth: 0.12, color: 0x0b1020,
      glowColor: 0x6366f1, metalness: 0.3, roughness: 0.4, emissiveIntensity: 0.6
    });
    headText.setPosition(center.x, center.y + CH * 0.42, 0.34);
    this._dayLayer.add(headText.getGroup());
    this._dayTexts.push(headText);

    if (this._journaledCount(iso) > 0) {
      this._renderPlaced(iso);
    } else {
      // Gentle prompt placeholder on an empty wall.
      const prompt = createReal3DText(this._promptFor(iso), {
        fontSize: 0.34, depth: 0.05, color: 0x94a3b8, glowColor: 0xcbd5e1,
        metalness: 0.05, roughness: 0.7, emissiveIntensity: 0.22
      });
      prompt.setPosition(center.x, center.y, 0.3);
      this._dayLayer.add(prompt.getGroup());
      this._dayTexts.push(prompt);
    }
  }

  // --- Composer (pencil → text box → live wall paint) ---

  _openComposer() {
    if (!this._selectedIso) return;
    this._focusWallForWriting(this._selectedIso);
    this._setCalMinimized(true); // calendar auto-hides while writing
    this._buildComposer();
    this._composer.style.display = "block";
    this._refreshRemarksList();
    this._updatePreview();
    this._composerInput?.focus();
  }

  /** Zoom all the way in so the wall fills the screen (edges touching the top). */
  _focusWallForWriting(iso) {
    this._build();
    this._selectedIso = iso;
    const [y, mo, d] = iso.split("-").map(Number);
    const center = this._cellPos(mo - 1, d, new THREE.Vector3());
    this._saveCamOnce();
    const fov = ((this.camera.fov ?? 60) * Math.PI) / 180;
    let dist = (CH * 0.54) / Math.tan(fov / 2);
    dist = Math.max(dist, (this.controls.minDistance ?? 4) + 0.5);
    this._tweenCamera(
      new THREE.Vector3(center.x, center.y, dist),
      new THREE.Vector3(center.x, center.y, 0),
      600
    );
    this._renderDayText(iso);
    this._syncCalendarSelection(iso);
  }

  _closeComposer() {
    if (this._composer) this._composer.style.display = "none";
    this._setCalMinimized(false); // bring the calendar back to pick another day
    if (this._preview) {
      try { this._preview.dispose(); } catch { /* ignore */ }
      const g = this._preview.getGroup?.();
      g?.parent?.remove(g);
      this._preview = null;
    }
  }

  /** Create/update the live preview text on the selected wall. */
  _updatePreview() {
    if (!this._selectedIso) return;
    const st = this._composeState;
    if (this._preview) {
      try { this._preview.dispose(); } catch { /* ignore */ }
      const g = this._preview.getGroup?.();
      g?.parent?.remove(g);
      this._preview = null;
    }
    const [y, mo, d] = this._selectedIso.split("-").map(Number);
    const center = this._cellPos(mo - 1, d, new THREE.Vector3());
    const placedCount = (this._placed.get(this._selectedIso) ?? []).length;
    // Flow remarks downward from just under the header (upper area), so the live
    // text shows in the clear top/right of the wall, above the bottom-left box.
    const yOff = center.y + CH * 0.18 - placedCount * (st.size * 0.95);
    const t = createReal3DText(st.text || "Type here…", this._styleParams(st.style, st.size, st.color));
    t.setPosition(center.x, yOff, 0.5);
    this._dayLayer.add(t.getGroup());
    this._preview = t;
  }

  /** Commit the current preview as a placed note and reset for the next. */
  _placeCurrent() {
    const st = this._composeState;
    const text = st.text.trim();
    if (!text || !this._selectedIso) return;
    const [y, mo, d] = this._selectedIso.split("-").map(Number);
    const center = this._cellPos(mo - 1, d, new THREE.Vector3());
    const arr = this._placed.get(this._selectedIso) ?? [];
    const yOff = center.y + CH * 0.18 - arr.length * (st.size * 0.95);
    arr.push({ text, style: st.style, color: st.color, size: st.size, x: center.x, y: yOff });
    this._placed.set(this._selectedIso, arr);
    st.text = "";
    if (this._composerInput) this._composerInput.value = "";
    this._renderDayText(this._selectedIso); // rebuild incl. the new placed remark
    this._refreshWall(this._selectedIso);
    this._renderCalendarGrid();
    this._refreshRemarksList();
    this._updatePreview();
    this._composerInput?.focus();
  }

  /** Delete a placed remark by index, then re-render the wall. */
  _deleteRemark(index) {
    const iso = this._selectedIso;
    const arr = this._placed.get(iso);
    if (!arr || index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    if (arr.length) this._placed.set(iso, arr);
    else this._placed.delete(iso);
    this._renderDayText(iso);
    this._refreshWall(iso);
    this._renderCalendarGrid();
    this._refreshRemarksList();
    this._updatePreview();
  }

  /** Refresh the composer's list of this day's remarks (each with ✕ delete). */
  _refreshRemarksList() {
    if (!this._remarksList) return;
    const arr = this._placed.get(this._selectedIso) ?? [];
    this._remarksList.textContent = "";
    if (!arr.length) { this._remarksList.style.display = "none"; return; }
    this._remarksList.style.display = "flex";
    arr.forEach((s, i) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;background:#0f1726;border-radius:7px;padding:4px 6px";
      const dot = document.createElement("span");
      dot.style.cssText =
        `width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#${s.color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("span");
      label.textContent = s.text;
      label.style.cssText = "flex:1;font-size:11px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      const x = document.createElement("button");
      x.textContent = "✕";
      x.title = "Delete this remark";
      x.style.cssText = "background:#3b1d2b;color:#fca5a5;border:0;border-radius:6px;width:22px;height:22px;cursor:pointer;flex:0 0 auto";
      x.addEventListener("click", () => this._deleteRemark(i));
      row.append(dot, label, x);
      this._remarksList.appendChild(row);
    });
  }

  _buildComposer() {
    if (this._composer) return;
    const wrap = document.createElement("div");
    wrap.id = "weaver-journal-composer";
    // Bottom-left overlay: the wall fills the screen behind it, your live text
    // showing through. Slightly translucent so the 3D text reads behind.
    wrap.style.cssText =
      "position:fixed;left:12px;bottom:88px;z-index:10270;" +
      "width:min(300px,82vw);background:rgba(8,12,22,0.82);backdrop-filter:blur(10px);" +
      "border:1px solid rgba(99,102,241,0.45);border-radius:14px;padding:10px;color:#e2e8f0;" +
      "font:600 12px system-ui;box-shadow:0 14px 50px rgba(0,0,0,0.6)";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
    const ttl = document.createElement("div");
    ttl.textContent = "✎ Write on this wall";
    ttl.style.cssText = "font-weight:700;font-size:14px";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:28px;height:28px;cursor:pointer";
    close.addEventListener("click", () => this._closeComposer());
    head.append(ttl, close);

    const input = document.createElement("textarea");
    input.rows = 2;
    input.placeholder = "Type your journal text…";
    input.style.cssText =
      "width:100%;box-sizing:border-box;background:#0f1726;color:#e2e8f0;border:1px solid #334155;" +
      "border-radius:9px;padding:8px;font:600 14px system-ui;resize:vertical;margin-bottom:9px";
    input.addEventListener("input", () => { this._composeState.text = input.value; this._updatePreview(); });
    this._composerInput = input;

    // Style + Size row
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:9px";
    const style = document.createElement("select");
    style.style.cssText = "flex:1;background:#0f1726;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:7px";
    for (const [val, label] of STYLE_LABELS) {
      const o = document.createElement("option");
      o.value = val; o.textContent = label;
      if (val === this._composeState.style) o.selected = true;
      style.appendChild(o);
    }
    style.addEventListener("change", () => { this._composeState.style = style.value; this._updatePreview(); });
    const sizeWrap = document.createElement("label");
    sizeWrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;opacity:0.85";
    sizeWrap.textContent = "Size";
    const size = document.createElement("input");
    size.type = "range"; size.min = "0.4"; size.max = "3.2"; size.step = "0.1";
    size.value = String(this._composeState.size);
    size.style.cssText = "width:120px";
    size.addEventListener("input", () => { this._composeState.size = Number(size.value); this._updatePreview(); });
    sizeWrap.appendChild(size);
    row1.append(style, sizeWrap);

    // Color row
    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px";
    for (const hex of SWATCHES) {
      const sw = document.createElement("button");
      sw.style.cssText =
        `width:22px;height:22px;border-radius:50%;border:2px solid #1e293b;cursor:pointer;background:${hex}`;
      sw.addEventListener("click", () => {
        this._composeState.color = parseInt(hex.replace("#", ""), 16);
        picker.value = hex;
        this._updatePreview();
      });
      row2.appendChild(sw);
    }
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = "#4da6ff";
    picker.title = "Custom color";
    picker.style.cssText = "width:30px;height:26px;border:0;background:none;cursor:pointer";
    picker.addEventListener("input", () => {
      this._composeState.color = parseInt(picker.value.replace("#", ""), 16);
      this._updatePreview();
    });
    row2.appendChild(picker);

    // Actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px";
    const place = document.createElement("button");
    place.textContent = "Place on wall";
    place.style.cssText =
      "flex:1;background:#6366f1;color:#fff;border:0;border-radius:9px;padding:9px;cursor:pointer;font:700 13px system-ui";
    place.addEventListener("click", () => this._placeCurrent());
    const done = document.createElement("button");
    done.textContent = "Done";
    done.style.cssText =
      "background:#1e293b;color:#cbd5e1;border:0;border-radius:9px;padding:9px 14px;cursor:pointer;font:600 13px system-ui";
    done.addEventListener("click", () => this._closeComposer());
    actions.append(place, done);

    // This day's remarks, each with ✕ to delete.
    const remarks = document.createElement("div");
    remarks.style.cssText = "display:none;flex-direction:column;gap:4px;margin-top:10px;max-height:120px;overflow:auto";
    this._remarksList = remarks;

    wrap.append(head, input, row1, row2, actions, remarks);
    document.body.appendChild(wrap);
    this._composer = wrap;
  }

  // --- Camera ---

  _saveCamOnce() {
    if (this._savedCam) return;
    this._savedCam = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      near: this.camera.near, far: this.camera.far,
      minD: this.controls.minDistance, maxD: this.controls.maxDistance
    };
    this.controls.minDistance = 4;
    this.controls.maxDistance = 1200;
    this.camera.far = Math.max(this.camera.far, 2000);
    this.camera.updateProjectionMatrix();
  }

  _tweenCamera(toPos, toTarget, dur = 700) {
    this._tween = {
      p0: this.camera.position.clone(),
      p1: toPos.clone(),
      t0: this.controls.target.clone(),
      t1: toTarget.clone(),
      start: performance.now(),
      dur
    };
  }

  /** Frame the whole hall. */
  _overview() {
    this._saveCamOnce();
    this._tweenCamera(new THREE.Vector3(0, 2, 185), new THREE.Vector3(0, 0, 0), 600);
  }

  /** Fly to a single day's wall and render its journal text. */
  teleportToDate(iso) {
    this._build();
    this._selectedIso = iso;
    const [y, mo, d] = iso.split("-").map(Number);
    const center = this._cellPos(mo - 1, d, new THREE.Vector3());
    this._saveCamOnce();
    // Pan the view left so the focused wall renders right-of-center, clear of the
    // calendar navigator panel on the left edge. Camera stays perpendicular (no skew).
    const panX = 6.5;
    this._tweenCamera(
      new THREE.Vector3(center.x - panX, center.y + 0.4, 13.5),
      new THREE.Vector3(center.x - panX, center.y, 0)
    );
    this._renderDayText(iso);
    this._syncCalendarSelection(iso);
  }

  // --- Calendar navigator UI ---

  _buildUi() {
    if (this._ui) return;
    const wrap = document.createElement("div");
    wrap.id = "weaver-journal-ui";
    wrap.style.cssText =
      "position:fixed;top:calc(60px + env(safe-area-inset-top,0px));left:12px;z-index:10260;" +
      "width:248px;background:rgba(8,12,22,0.86);backdrop-filter:blur(8px);" +
      "border:1px solid rgba(99,102,241,0.4);border-radius:14px;padding:10px;" +
      "color:#e2e8f0;font:600 13px system-ui;box-shadow:0 10px 40px rgba(0,0,0,0.5)";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:8px";
    const mini = document.createElement("button");
    const prev = document.createElement("button");
    const next = document.createElement("button");
    const title = document.createElement("div");
    for (const b of [mini, prev, next]) {
      b.style.cssText = "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:15px;flex:0 0 auto";
    }
    mini.textContent = "«";
    mini.title = "Minimize";
    prev.textContent = "‹";
    next.textContent = "›";
    title.style.cssText = "flex:1;text-align:center;font-weight:700;font-size:13px";
    mini.addEventListener("click", () => this._setCalMinimized(true));
    prev.addEventListener("click", () => this._stepMonth(-1));
    next.addEventListener("click", () => this._stepMonth(1));
    head.append(mini, prev, title, next);
    this._calTitle = title;

    const dow = document.createElement("div");
    dow.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:3px;opacity:0.55;font-size:10px;text-align:center";
    for (const w of WEEKDAYS) {
      const c = document.createElement("div");
      c.textContent = w;
      dow.appendChild(c);
    }

    const grid = document.createElement("div");
    grid.id = "weaver-journal-grid";
    grid.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px";
    this._calGrid = grid;

    const write = document.createElement("button");
    write.textContent = "✎  Write on this wall";
    write.style.cssText =
      "margin-top:9px;width:100%;background:#6366f1;color:#fff;border:0;border-radius:9px;" +
      "padding:9px;cursor:pointer;font:700 13px system-ui";
    write.addEventListener("click", () => this._openComposer());

    const overview = document.createElement("button");
    overview.textContent = "⤢  Year overview";
    overview.style.cssText =
      "margin-top:7px;width:100%;background:#312e81;color:#e0e7ff;border:0;border-radius:9px;" +
      "padding:8px;cursor:pointer;font:600 12px system-ui";
    overview.addEventListener("click", () => this._overview());

    const hint = document.createElement("div");
    hint.style.cssText = "margin-top:6px;font-size:10px;opacity:0.5;line-height:1.35";
    hint.textContent = "Pick a day to teleport to its wall. Dots = days with entries.";

    wrap.append(head, dow, grid, write, overview, hint);
    document.body.appendChild(wrap);
    this._ui = wrap;

    // Collapsed handle on the left edge — tap to re-expand the calendar.
    const handle = document.createElement("button");
    handle.id = "weaver-journal-handle";
    handle.innerHTML = "📅<br>»";
    handle.style.cssText =
      "position:fixed;top:calc(60px + env(safe-area-inset-top,0px));left:0;z-index:10260;display:none;" +
      "background:rgba(99,102,241,0.92);color:#fff;border:0;border-radius:0 12px 12px 0;padding:12px 8px;" +
      "cursor:pointer;font:700 12px system-ui;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,0.5)";
    handle.addEventListener("click", () => this._setCalMinimized(false));
    document.body.appendChild(handle);
    this._calHandle = handle;

    this._renderCalendarGrid();
  }

  _setCalMinimized(min) {
    this._calMinimized = min;
    if (this._ui) this._ui.style.display = min ? "none" : "block";
    if (this._calHandle) this._calHandle.style.display = min ? "block" : "none";
  }

  // --- Free-move controls (pan + zoom) ---

  /** Pan (dx,dy in world units) and/or zoom (dz>0 = closer). Cancels any tween. */
  _nudge(dx, dy, dz) {
    this._tween = null;
    const cam = this.camera;
    const ctr = this.controls;
    cam.position.x += dx; ctr.target.x += dx;
    cam.position.y += dy; ctr.target.y += dy;
    if (dz) {
      const dir = new THREE.Vector3().subVectors(ctr.target, cam.position);
      const dist = dir.length();
      if (dist > 1e-3) {
        dir.normalize();
        const minD = ctr.minDistance ?? 2;
        const maxD = ctr.maxDistance ?? 2000;
        const newDist = Math.min(Math.max(dist - dz, minD), maxD);
        cam.position.addScaledVector(dir, dist - newDist);
      }
    }
    ctr.update();
  }

  /** Press-and-hold repeats `fn` while held. */
  _holdButton(btn, fn) {
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fn();
      stop();
      timer = setInterval(fn, 40);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
      btn.addEventListener(ev, stop);
    }
  }

  _buildMoveControls() {
    if (this._movePad) return;
    const pad = document.createElement("div");
    pad.id = "weaver-journal-move";
    pad.style.cssText =
      "position:fixed;right:12px;bottom:88px;z-index:10260;display:grid;gap:6px;" +
      "grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px);" +
      "background:rgba(8,12,22,0.72);backdrop-filter:blur(8px);" +
      "border:1px solid rgba(99,102,241,0.35);border-radius:14px;padding:8px";
    const mk = (label, area, title, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        "width:40px;height:40px;border:0;border-radius:9px;background:#1e293b;color:#e2e8f0;" +
        `font:700 16px system-ui;cursor:pointer;touch-action:none;grid-area:${area}`;
      this._holdButton(b, fn);
      return b;
    };
    const STEP = 2.4;
    const ZOOM = 1.8;
    pad.append(
      mk("▲", "1 / 2 / 2 / 3", "Up", () => this._nudge(0, STEP, 0)),
      mk("◀", "2 / 1 / 3 / 2", "Left", () => this._nudge(-STEP, 0, 0)),
      mk("＋", "2 / 2 / 3 / 3", "Zoom in", () => this._nudge(0, 0, ZOOM)),
      mk("▶", "2 / 3 / 3 / 4", "Right", () => this._nudge(STEP, 0, 0)),
      mk("▼", "3 / 2 / 4 / 3", "Down", () => this._nudge(0, -STEP, 0)),
      mk("－", "3 / 3 / 4 / 4", "Zoom out", () => this._nudge(0, 0, -ZOOM))
    );
    document.body.appendChild(pad);
    this._movePad = pad;
  }

  _stepMonth(delta) {
    let mo = this._calMonth + delta;
    let yr = this._calYear;
    if (mo < 0) { mo = 11; yr--; }
    if (mo > 11) { mo = 0; yr++; }
    this._calMonth = mo;
    this._calYear = yr;
    this._renderCalendarGrid();
  }

  _renderCalendarGrid() {
    if (!this._calGrid) return;
    this._calTitle.textContent = `${MONTHS[this._calMonth]} ${this._calYear}`;
    this._calGrid.textContent = "";
    const first = new Date(this._calYear, this._calMonth, 1).getDay();
    const dim = daysInMonth(this._calYear, this._calMonth);
    const todayIso = (() => {
      const n = new Date();
      return isoFor(n.getFullYear(), n.getMonth(), n.getDate());
    })();

    for (let b = 0; b < first; b++) {
      this._calGrid.appendChild(document.createElement("div"));
    }
    for (let d = 1; d <= dim; d++) {
      const iso = isoFor(this._calYear, this._calMonth, d);
      const cell = document.createElement("button");
      cell.dataset.iso = iso;
      cell.textContent = String(d);
      const busy = this._journaledCount(iso) > 0;
      const isToday = iso === todayIso;
      const isSel = iso === this._selectedIso;
      cell.style.cssText =
        "position:relative;aspect-ratio:1;border:0;border-radius:7px;cursor:pointer;font:600 11px system-ui;" +
        `background:${isSel ? "#6366f1" : "#0f1726"};color:${isSel ? "#fff" : "#cbd5e1"};` +
        `${isToday ? "outline:1.5px solid #fbbf24;outline-offset:-1.5px;" : ""}`;
      if (busy) {
        const dot = document.createElement("span");
        dot.style.cssText =
          "position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;" +
          `background:${isSel ? "#fff" : "#f59e0b"}`;
        cell.appendChild(dot);
      }
      cell.addEventListener("click", () => this.teleportToDate(iso));
      this._calGrid.appendChild(cell);
    }
  }

  _syncCalendarSelection(iso) {
    const [y, mo] = iso.split("-").map(Number);
    if (y !== this._calYear || mo - 1 !== this._calMonth) {
      this._calYear = y;
      this._calMonth = mo - 1;
    }
    this._renderCalendarGrid();
  }

  // --- Lifecycle ---

  show() {
    this._build();
    this.root.visible = true;
    this._active = true;
    // Own stable body class — the shell's inkling-tab-constellation class gets
    // stripped by nav churn, so the journal owns its own flag for CSS gating.
    document.body.classList.add("weaver-journal-active");
    this._buildUi();
    this._setCalMinimized(false);
    this._buildMoveControls();
    if (this._movePad) this._movePad.style.display = "grid";
    // Start at overview, but seed today's wall so the concept is visible.
    const n = new Date();
    const todayIso = isoFor(n.getFullYear(), n.getMonth(), n.getDate());
    this._selectedIso = todayIso;
    this._renderDayText(todayIso);
    this._syncCalendarSelection(todayIso);
    this._overview();
  }

  hide() {
    this.root.visible = false;
    this._active = false;
    this._tween = null;
    document.body.classList.remove("weaver-journal-active");
    this._closeComposer();
    if (this._ui) this._ui.style.display = "none";
    if (this._calHandle) this._calHandle.style.display = "none";
    if (this._movePad) this._movePad.style.display = "none";
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

  update() {
    if (!this._active) return;
    if (this._tween) {
      const t = Math.min(1, (performance.now() - this._tween.start) / this._tween.dur);
      const e = t * t * (3 - 2 * t); // smoothstep
      this.camera.position.lerpVectors(this._tween.p0, this._tween.p1, e);
      this.controls.target.lerpVectors(this._tween.t0, this._tween.t1, e);
      this.controls.update();
      if (t >= 1) this._tween = null;
    }
    // Gentle shimmer on the focused day's text.
    for (const txt of this._dayTexts) {
      if (typeof txt.animatePulse === "function") txt.animatePulse(0.18);
    }
  }

  dispose() {
    window.removeEventListener("wordweaver:font-ready", this._onFontReady);
    this._clearDayText();
    this._walls?.geometry.dispose();
    this._walls?.material.dispose();
    this._walls?.dispose?.();
    this._platforms?.geometry.dispose();
    this._platforms?.material.dispose();
    this._platforms?.dispose?.();
    for (const l of this._labels ?? []) {
      l.tex.dispose();
      l.mat.dispose();
    }
    this._ui?.remove();
    this._ui = null;
    this._calHandle?.remove();
    this._calHandle = null;
    this._movePad?.remove();
    this._movePad = null;
    this._composer?.remove();
    this._composer = null;
    this.scene.remove(this.root);
    this._built = false;
  }
}
