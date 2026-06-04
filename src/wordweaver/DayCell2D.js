import { CategoryColors } from "./timelineModel.js";

/**
 * Single day cell — date number, category dots, optional alert.
 * @param {{
 *   day: number,
 *   dateIso: string,
 *   events?: { category?: string, alertId?: string, id?: string }[],
 *   compact?: boolean,
 *   isToday?: boolean,
 *   onSelect?: (dateIso: string) => void
 * }} opts
 * @returns {HTMLButtonElement}
 */
export function createDayCell2D(opts) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ww-day-cell-2d";
  if (opts.compact) btn.classList.add("ww-day-cell-2d--compact");
  if (opts.isToday) btn.classList.add("is-today");
  btn.dataset.date = opts.dateIso;

  const cats = [
    ...new Set(
      (opts.events ?? []).map((e) => (e.category === "errand" ? "errands" : e.category ?? "personal"))
    )
  ];
  const hasAlert = (opts.events ?? []).some((e) => e.alertId);

  const dominant = cats[0] ?? "personal";
  const borderColor = CategoryColors[dominant] ?? CategoryColors.default;
  btn.style.borderColor = `${borderColor}66`;

  btn.innerHTML = `
    <span class="ww-day-cell-2d__num">${opts.day}</span>
    <span class="ww-day-cell-2d__dots"></span>
    ${hasAlert ? '<span class="ww-day-cell-2d__alert" title="Alert">⏰</span>' : ""}
  `;

  const dots = btn.querySelector(".ww-day-cell-2d__dots");
  for (const cat of cats.slice(0, opts.compact ? 3 : 5)) {
    const dot = document.createElement("span");
    dot.className = "category-dot";
    dot.style.backgroundColor = CategoryColors[cat] ?? CategoryColors.default;
    dots?.appendChild(dot);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    opts.onSelect?.(opts.dateIso);
  });

  return btn;
}
