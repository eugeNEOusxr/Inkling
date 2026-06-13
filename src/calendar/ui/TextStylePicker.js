/**
 * TextStylePicker — pick how note text looks: 3D, 2.5D, or flat 2D.
 *
 * 15 clean styles (5 per dimension) shown as live previews on backdrop sprites.
 * Selecting one stores the preference (localStorage `inkling-text-style`) and
 * fires `inkling:text-style` so renderers can pick it up. Openable from the
 * Inkling orb and from the 🎨 paint-canvas button.
 */

const PREF_KEY = "inkling-text-style";
const SAMPLE = "Today";

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
