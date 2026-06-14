/**
 * TextStylePicker — pick how note text looks: 3D, 2.5D, or flat 2D.
 *
 * 15 clean styles (5 per dimension) shown as live previews on backdrop sprites.
 * Selecting one stores the preference (localStorage `inkling-text-style`) and
 * fires `inkling:text-style` so renderers can pick it up. Openable from the
 * Inkling orb and from the 🎨 paint-canvas button.
 */

const PREF_KEY = "inkling-text-style";
const ANIM_KEY = "inkling-text-anim";
const COLOR_KEY = "inkling-text-color";
const SIZE_KEY = "inkling-text-size";
const FONT_KEY = "inkling-text-font";
const SAMPLE = "Today";

/** Size presets → world-scale multiplier for the 3D day-view text. */
const SIZES = [["S", 0.8], ["M", 1.0], ["L", 1.3], ["XL", 1.7]];
/** 3D typeface options → Real3DText font key (label, key). */
const FONTS = [["Sans", "helvetiker"], ["Bold", "helvetiker-bold"], ["Serif", "optimer"], ["Elegant", "gentilis"], ["Droid", "droid-serif"]];

/** Preset text colours offered in the picker (plus a custom swatch + Auto). */
const COLORS = ["#ffffff", "#ef4444", "#f59e0b", "#fde047", "#22c55e", "#22d3ee", "#3b82f6", "#a855f7", "#ec4899"];

/** Animation options → CSS `animation` value (keyframes injected once). */
const ANIMS = [
  ["none", "None", ""],
  ["pulse", "Pulse", "ink-pulse 1.6s ease-in-out infinite"],
  ["float", "Float", "ink-float 2.6s ease-in-out infinite"],
  ["shimmer", "Shimmer", "ink-shimmer 1.8s ease-in-out infinite"],
  ["wobble", "Wobble", "ink-wobble 2.2s ease-in-out infinite"]
];

function injectAnimKeyframes() {
  if (document.getElementById("inkling-text-anim-css")) return;
  const st = document.createElement("style");
  st.id = "inkling-text-anim-css";
  st.textContent =
    "@keyframes ink-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}" +
    "@keyframes ink-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
    "@keyframes ink-shimmer{0%,100%{filter:brightness(1)}50%{filter:brightness(1.6)}}" +
    "@keyframes ink-wobble{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}";
  document.head.appendChild(st);
}

/** Each style: id, name, inline CSS for the sample, and optional tile backdrop. */
const GROUPS = [
  {
    dim: "3D",
    blurb: "Extruded, dimensional",
    styles: [
      { id: "chrome", name: "Beveled Chrome", css: "background:linear-gradient(180deg,#fff 0%,#cbd5e1 46%,#64748b 56%,#aab6c8 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 2px rgba(0,0,0,.55))" },
      { id: "emboss", name: "Deep Emboss", css: "color:#cbd5e1;text-shadow:0 1px 0 #64748b,0 2px 0 #5b6677,0 3px 0 #515c6e,0 4px 0 #475160,0 6px 9px rgba(0,0,0,.6)" },
      { id: "neon", name: "Neon Tube", css: "color:#fff;text-shadow:0 0 4px #22d3ee,0 0 11px #22d3ee,0 0 22px #0891b2,0 0 34px #0891b2" },
      { id: "gold", name: "Gold Relief", css: "background:linear-gradient(180deg,#fde68a,#f59e0b 55%,#b45309);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 2px rgba(0,0,0,.55))" },
      { id: "glass", name: "Glass Prism", css: "color:rgba(255,255,255,.82);-webkit-text-stroke:0.5px rgba(255,255,255,.45);text-shadow:0 1px 1px rgba(255,255,255,.6),0 2px 8px rgba(56,189,248,.55)" }
    ]
  },
  {
    dim: "2.5D",
    blurb: "Layered depth (clean)",
    styles: [
      { id: "longshadow", name: "Long Shadow", css: "color:#e2e8f0;text-shadow:1px 1px 0 #475569,2px 2px 0 #475569,3px 3px 0 #3b475a,4px 4px 0 #334155,5px 5px 9px rgba(0,0,0,.4)" },
      { id: "letterpress", name: "Letterpress", css: "color:#1e293b;text-shadow:0 1px 0 rgba(255,255,255,.6)", bg: "linear-gradient(135deg,#cbd5e1,#94a3b8)" },
      { id: "retro", name: "Retro Stack", css: "color:#fff;text-shadow:2px 2px 0 #f59e0b,4px 4px 0 #ef4444" },
      { id: "softlift", name: "Soft Lift", css: "color:#f1f5f9;text-shadow:0 1px 0 #cbd5e1,0 8px 14px rgba(0,0,0,.5)" },
      { id: "outline", name: "Outline Pop", css: "color:#fff;text-shadow:-1.5px -1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px 1.5px 0 #000,4px 4px 0 rgba(0,0,0,.35)" }
    ]
  },
  {
    dim: "2D",
    blurb: "Flat & crisp fonts",
    styles: [
      { id: "sans", name: "Sans Clean", css: "color:#e2e8f0;font-family:Inter,system-ui,sans-serif" },
      { id: "condensed", name: "Condensed", css: "color:#e2e8f0;font-family:'Arial Narrow',Impact,sans-serif;letter-spacing:-0.5px;font-weight:800" },
      { id: "serif", name: "Serif Editorial", css: "color:#e2e8f0;font-family:Georgia,'Times New Roman',serif" },
      { id: "mono", name: "Mono Tech", css: "color:#e2e8f0;font-family:'Courier New',monospace;letter-spacing:1px" },
      { id: "rounded", name: "Rounded", css: "color:#e2e8f0;font-family:'Trebuchet MS','Segoe UI',sans-serif" }
    ]
  }
];

let _panel = null;
let _onPick = null;

/** value (`dim:id`) → style object, for applying the look elsewhere. */
const STYLE_INDEX = {};
for (const g of GROUPS) for (const s of g.styles) STYLE_INDEX[`${g.dim}:${s.id}`] = s;

export function getTextStyle() {
  try { return localStorage.getItem(PREF_KEY) || "2.5D:longshadow"; } catch { return "2.5D:longshadow"; }
}

/** Raw stored value, or null if the user hasn't chosen one yet. */
export function getTextStyleRaw() {
  try { return localStorage.getItem(PREF_KEY); } catch { return null; }
}

/** Inline CSS for a style value (the same CSS used in the preview tiles). */
export function textStyleCss(value) {
  return STYLE_INDEX[value]?.css ?? "";
}

/** Current animation id (default "none"). */
export function getTextAnim() {
  try { return localStorage.getItem(ANIM_KEY) || "none"; } catch { return "none"; }
}

/** CSS `animation:` value for the chosen animation (empty for none). */
export function textAnimCss(value) {
  const a = ANIMS.find((x) => x[0] === (value ?? getTextAnim()));
  return a && a[2] ? `animation:${a[2]}` : "";
}

/** Chosen text colour as a #rrggbb string, or null = "Auto" (category colour). */
export function getTextColorCss() {
  try { const v = localStorage.getItem(COLOR_KEY); return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null; } catch { return null; }
}

/** Chosen text colour as a hex int, or null = "Auto" (use the category colour). */
export function getTextColor() {
  const css = getTextColorCss();
  return css ? parseInt(css.slice(1), 16) : null;
}

/** Chosen text size multiplier (default 1.0). Scales the 3D day-view note text. */
export function getTextScale() {
  try { const v = parseFloat(localStorage.getItem(SIZE_KEY)); return Number.isFinite(v) && v > 0 ? v : 1.0; } catch { return 1.0; }
}

/** Chosen 3D typeface key (default "helvetiker"). */
export function getTextFont() {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return FONTS.some(([, k]) => k === v) ? v : "helvetiker";
  } catch { return "helvetiker"; }
}

/**
 * Map a style value → Real3DText material params for extruded 3D text.
 * The 3D-group looks change material/finish; 2D/2.5D picks fall back to a clean
 * vivid solid (a flat typeface can't take a 2D font swap in 3D).
 * @param {string} value
 * @param {number} baseColor hex int — the note's category color
 */
export function text3dParams(value, baseColor) {
  switch (value) {
    case "3D:chrome":
      return { color: 0xd8dee9, glowColor: 0xffffff, metalness: 0.96, roughness: 0.08, emissiveIntensity: 0.12, depth: 0.34 };
    case "3D:emboss":
      return { color: baseColor, glowColor: baseColor, metalness: 0.2, roughness: 0.6, emissiveIntensity: 0.15, depth: 0.52 };
    case "3D:neon":
      return { color: baseColor, glowColor: baseColor, metalness: 0.0, roughness: 0.3, emissiveIntensity: 1.7, depth: 0.22 };
    case "3D:gold":
      return { color: 0xf5c542, glowColor: 0xfde68a, metalness: 0.92, roughness: 0.12, emissiveIntensity: 0.2, depth: 0.34 };
    case "3D:glass":
      return { color: 0xbfe3ff, glowColor: 0xffffff, metalness: 0.1, roughness: 0.08, emissiveIntensity: 0.25, depth: 0.3 };
    default:
      return { color: baseColor, glowColor: baseColor, metalness: 0.25, roughness: 0.4, emissiveIntensity: 0.32, depth: 0.34 };
  }
}

/**
 * @param {(value: string) => void} [onPick]
 */
export function openTextStylePicker(onPick) {
  _onPick = typeof onPick === "function" ? onPick : null;
  _build();
  _panel.style.display = "flex";
  _markSelected(getTextStyle());
}

export function closeTextStylePicker() {
  if (_panel) _panel.style.display = "none";
}

function _markSelected(value) {
  if (!_panel) return;
  _panel.querySelectorAll("[data-style]").forEach((tile) => {
    tile.style.outline = tile.dataset.style === value ? "3px solid #818cf8" : "2px solid transparent";
  });
}

function _select(value) {
  try { localStorage.setItem(PREF_KEY, value); } catch { /* ignore */ }
  _markSelected(value);
  try { window.dispatchEvent(new CustomEvent("inkling:text-style", { detail: { value } })); } catch { /* ignore */ }
  _onPick?.(value);
}

function _selectAnim(id) {
  try { localStorage.setItem(ANIM_KEY, id); } catch { /* ignore */ }
  _panel?.querySelectorAll("[data-anim]").forEach((b) => {
    const on = b.dataset.anim === id;
    b.style.background = on ? "#6366f1" : "#1e293b";
    b.style.color = on ? "#fff" : "#cbd5e1";
  });
  try { window.dispatchEvent(new CustomEvent("inkling:text-anim", { detail: { value: id } })); } catch { /* ignore */ }
}

function _markColor(hex) {
  if (!_panel) return;
  const v = hex ? hex.toLowerCase() : "auto";
  _panel.querySelectorAll("[data-color]").forEach((el) => {
    const on = el.dataset.color === v;
    if (el.dataset.color === "auto") {
      el.style.background = on ? "#6366f1" : "#1e293b";
      el.style.color = on ? "#fff" : "#cbd5e1";
    } else {
      el.style.borderColor = on ? "#fff" : "rgba(255,255,255,.25)";
    }
  });
}

function _selectColor(hex) {
  try { if (hex) localStorage.setItem(COLOR_KEY, hex); else localStorage.removeItem(COLOR_KEY); } catch { /* ignore */ }
  _markColor(hex);
  try { window.dispatchEvent(new CustomEvent("inkling:text-color", { detail: { value: hex || null } })); } catch { /* ignore */ }
}

function _markSize(mult) {
  if (!_panel) return;
  _panel.querySelectorAll("[data-size]").forEach((b) => {
    const on = Math.abs(parseFloat(b.dataset.size) - mult) < 0.001;
    b.style.background = on ? "#6366f1" : "#1e293b";
    b.style.color = on ? "#fff" : "#cbd5e1";
  });
}

function _selectSize(mult) {
  try { localStorage.setItem(SIZE_KEY, String(mult)); } catch { /* ignore */ }
  _markSize(mult);
  try { window.dispatchEvent(new CustomEvent("inkling:text-size", { detail: { value: mult } })); } catch { /* ignore */ }
}

function _markFont(key) {
  if (!_panel) return;
  _panel.querySelectorAll("[data-font]").forEach((b) => {
    const on = b.dataset.font === key;
    b.style.background = on ? "#6366f1" : "#1e293b";
    b.style.color = on ? "#fff" : "#cbd5e1";
  });
}

function _selectFont(key) {
  try { localStorage.setItem(FONT_KEY, key); } catch { /* ignore */ }
  _markFont(key);
  try { window.dispatchEvent(new CustomEvent("inkling:text-font", { detail: { value: key } })); } catch { /* ignore */ }
}

function _build() {
  if (_panel) return;
  const overlay = document.createElement("div");
  overlay.id = "inkling-text-style-picker";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:11400;display:none;flex-direction:column;" +
    "background:rgba(5,8,16,0.92);backdrop-filter:blur(8px);color:#e2e8f0;font:600 14px system-ui;" +
    "overflow:auto;padding:18px";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px";
  const title = document.createElement("div");
  title.innerHTML = "🎨 &nbsp;Text style";
  title.style.cssText = "font:800 19px system-ui";
  const done = document.createElement("button");
  done.textContent = "Done";
  done.style.cssText = "background:#6366f1;color:#fff;border:0;border-radius:9px;padding:9px 18px;font:700 14px system-ui;cursor:pointer";
  done.addEventListener("click", () => closeTextStylePicker());
  head.append(title, done);
  overlay.appendChild(head);

  // Animation selector (applies on top of any style).
  injectAnimKeyframes();
  const animRow = document.createElement("div");
  animRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px";
  const animLabel = document.createElement("span");
  animLabel.textContent = "Animation:";
  animLabel.style.cssText = "font:700 13px system-ui;color:#a5b4fc";
  animRow.appendChild(animLabel);
  const curAnim = getTextAnim();
  for (const [id, name, anim] of ANIMS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.anim = id;
    b.textContent = name;
    b.style.cssText =
      "border:0;border-radius:999px;padding:7px 13px;font:700 12px system-ui;cursor:pointer;" +
      (anim ? `animation:${anim};` : "") +
      `background:${id === curAnim ? "#6366f1" : "#1e293b"};color:${id === curAnim ? "#fff" : "#cbd5e1"}`;
    b.addEventListener("click", () => _selectAnim(id));
    animRow.appendChild(b);
  }
  overlay.appendChild(animRow);

  // Colour selector — overrides the note text colour ("Auto" = category colour).
  const colorRow = document.createElement("div");
  colorRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px";
  const colorLabel = document.createElement("span");
  colorLabel.textContent = "Colour:";
  colorLabel.style.cssText = "font:700 13px system-ui;color:#a5b4fc";
  colorRow.appendChild(colorLabel);
  const curColor = getTextColorCss();
  const autoBtn = document.createElement("button");
  autoBtn.type = "button";
  autoBtn.dataset.color = "auto";
  autoBtn.textContent = "Auto";
  autoBtn.style.cssText =
    "border:0;border-radius:999px;padding:7px 13px;font:700 12px system-ui;cursor:pointer;" +
    `background:${curColor ? "#1e293b" : "#6366f1"};color:${curColor ? "#cbd5e1" : "#fff"}`;
  autoBtn.addEventListener("click", () => _selectColor(null));
  colorRow.appendChild(autoBtn);
  for (const hex of COLORS) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.dataset.color = hex.toLowerCase();
    sw.style.cssText =
      `width:30px;height:30px;border-radius:50%;cursor:pointer;background:${hex};` +
      `border:2px solid ${curColor === hex.toLowerCase() ? "#fff" : "rgba(255,255,255,.25)"}`;
    sw.addEventListener("click", () => _selectColor(hex));
    colorRow.appendChild(sw);
  }
  const custom = document.createElement("input");
  custom.type = "color";
  custom.value = curColor || "#a5b4fc";
  custom.title = "Custom colour";
  custom.style.cssText = "width:34px;height:34px;border:0;background:transparent;cursor:pointer;padding:0";
  custom.addEventListener("input", () => _selectColor(custom.value));
  colorRow.appendChild(custom);
  overlay.appendChild(colorRow);

  // Size selector — scales the 3D day-view note text.
  const sizeRow = document.createElement("div");
  sizeRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px";
  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = "Size:";
  sizeLabel.style.cssText = "font:700 13px system-ui;color:#a5b4fc";
  sizeRow.appendChild(sizeLabel);
  const curSize = getTextScale();
  for (const [name, mult] of SIZES) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.size = String(mult);
    b.textContent = name;
    const on = Math.abs(mult - curSize) < 0.001;
    b.style.cssText =
      "border:0;border-radius:999px;padding:7px 14px;font:700 12px system-ui;cursor:pointer;" +
      `background:${on ? "#6366f1" : "#1e293b"};color:${on ? "#fff" : "#cbd5e1"}`;
    b.addEventListener("click", () => _selectSize(mult));
    sizeRow.appendChild(b);
  }
  overlay.appendChild(sizeRow);

  // Font selector — swaps the 3D day-view typeface.
  const fontRow = document.createElement("div");
  fontRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px";
  const fontLabel = document.createElement("span");
  fontLabel.textContent = "Font:";
  fontLabel.style.cssText = "font:700 13px system-ui;color:#a5b4fc";
  fontRow.appendChild(fontLabel);
  const curFont = getTextFont();
  for (const [name, key] of FONTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.font = key;
    b.textContent = name;
    const on = key === curFont;
    b.style.cssText =
      "border:0;border-radius:999px;padding:7px 13px;font:700 12px system-ui;cursor:pointer;" +
      `background:${on ? "#6366f1" : "#1e293b"};color:${on ? "#fff" : "#cbd5e1"}`;
    b.addEventListener("click", () => _selectFont(key));
    fontRow.appendChild(b);
  }
  overlay.appendChild(fontRow);

  for (const group of GROUPS) {
    const section = document.createElement("div");
    section.style.cssText = "margin-bottom:18px";
    const label = document.createElement("div");
    label.innerHTML = `<span style="font:800 15px system-ui;color:#a5b4fc">${group.dim}</span> <span style="opacity:.6;font-size:12px">${group.blurb}</span>`;
    label.style.cssText = "margin-bottom:8px";
    section.appendChild(label);

    const row = document.createElement("div");
    row.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px";
    for (const s of group.styles) {
      const value = `${group.dim}:${s.id}`;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.dataset.style = value;
      tile.style.cssText =
        "border:0;border-radius:12px;padding:0;cursor:pointer;outline:2px solid transparent;outline-offset:2px;" +
        "height:96px;display:flex;flex-direction:column;overflow:hidden";
      const sprite = document.createElement("div");
      sprite.style.cssText =
        `flex:1;display:flex;align-items:center;justify-content:center;` +
        `background:${s.bg || "linear-gradient(135deg,#1f2937,#0b1220)"};`;
      const sample = document.createElement("span");
      sample.textContent = SAMPLE;
      sample.style.cssText = `font-weight:800;font-size:26px;line-height:1;${s.css}`;
      sprite.appendChild(sample);
      const cap = document.createElement("div");
      cap.textContent = s.name;
      cap.style.cssText = "background:#0f172a;color:#cbd5e1;font:600 11px system-ui;padding:5px 6px;text-align:center";
      tile.append(sprite, cap);
      tile.addEventListener("click", () => _select(value));
      row.appendChild(tile);
    }
    section.appendChild(row);
    overlay.appendChild(section);
  }

  document.body.appendChild(overlay);
  _panel = overlay;
}
