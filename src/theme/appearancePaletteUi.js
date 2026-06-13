import { APPEARANCE_GROUPS } from "./appearancePalettes.js";

/**
 * Appearance palettes (feminine/masculine/neutral) are all hidden for now — TBD
 * once sphere colors are settled. Empty list = the picker renders no chips.
 * Re-add ids here to restore the chooser.
 * @type {import('./appearancePalettes.js').AppearancePaletteId[]}
 */
export const APPEARANCE_DISPLAY_ORDER = [];

/**
 * @param {HTMLElement} root
 * @param {{ selectedId?: string, onSelect?: (id: import('./appearancePalettes.js').AppearancePaletteId) => void }} opts
 */
export function renderAppearancePalettePicker(root, opts = {}) {
  const byId = Object.fromEntries(APPEARANCE_GROUPS.map((g) => [g.id, g]));
  let selectedId = opts.selectedId ?? "neutral";

  root.innerHTML = "";
  root.classList.add("appearance-palette-picker");

  /** @type {Map<string, HTMLButtonElement>} */
  const chips = new Map();

  const setSelected = (id) => {
    selectedId = id;
    for (const [pid, btn] of chips) {
      btn.classList.toggle("is-active", pid === id);
      btn.setAttribute("aria-pressed", String(pid === id));
    }
  };

  for (const id of APPEARANCE_DISPLAY_ORDER) {
    const g = byId[id];
    if (!g) continue;

    const groupEl = document.createElement("div");
    groupEl.className = "appearance-palette-group";

    const title = document.createElement("h5");
    title.className = "appearance-palette-group__title";
    title.textContent = g.label;
    groupEl.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "appearance-palette-grid";

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `appearance-palette-chip appearance-palette-chip--${id}`;
    chip.dataset.paletteId = id;
    chip.setAttribute("aria-pressed", "false");
    chip.innerHTML = `
      <span class="appearance-palette-chip__swatch" aria-hidden="true"></span>
      <span class="appearance-palette-chip__name">${g.label}</span>
      <span class="appearance-palette-chip__hint">${g.hint}</span>
    `;
    chip.addEventListener("click", () => {
      setSelected(id);
      opts.onSelect?.(/** @type {import('./appearancePalettes.js').AppearancePaletteId} */ (id));
    });

    chips.set(id, chip);
    grid.appendChild(chip);
    groupEl.appendChild(grid);
    root.appendChild(groupEl);
  }

  setSelected(selectedId);
  return { setSelected, getSelected: () => selectedId };
}
