/**
 * Compact month grid (7×N) for dock / OS notebook-calendar shell.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * @param {string} iso YYYY-MM-DD
 */
function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function todayIso() {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   year: number,
 *   month: number,
 *   selectedDate?: string,
 *   onSelect?: (iso: string) => void,
 *   onMonthChange?: (year: number, month: number) => void
 * }} opts
 */
export function renderMiniMonthCalendar(container, opts) {
  let year = opts.year;
  let month = opts.month;
  let selected = opts.selectedDate ?? todayIso();

  const root = document.createElement("div");
  root.className = "mini-month-cal";

  const header = document.createElement("div");
  header.className = "mini-month-cal__header";

  const btnPrev = document.createElement("button");
  btnPrev.type = "button";
  btnPrev.className = "mini-month-cal__nav";
  btnPrev.textContent = "‹";
  btnPrev.setAttribute("aria-label", "Previous month");

  const title = document.createElement("span");
  title.className = "mini-month-cal__title";

  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.className = "mini-month-cal__nav";
  btnNext.textContent = "›";
  btnNext.setAttribute("aria-label", "Next month");

  header.append(btnPrev, title, btnNext);

  const weekdays = document.createElement("div");
  weekdays.className = "mini-month-cal__weekdays";
  weekdays.innerHTML = WEEKDAYS.map((d) => `<span>${d}</span>`).join("");

  const grid = document.createElement("div");
  grid.className = "mini-month-cal__grid";
  grid.setAttribute("role", "grid");

  root.append(header, weekdays, grid);
  container.innerHTML = "";
  container.appendChild(root);

  const paint = () => {
    const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric"
    });
    title.textContent = label;

    const firstDow = new Date(year, month - 1, 1).getDay();
    const total = daysInMonth(year, month);
    const today = todayIso();
    grid.innerHTML = "";

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("span");
      pad.className = "mini-month-cal__pad";
      pad.setAttribute("aria-hidden", "true");
      grid.appendChild(pad);
    }

    for (let d = 1; d <= total; d++) {
      const iso = toIso(year, month, d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-month-cal__day";
      btn.textContent = String(d);
      btn.setAttribute("data-date", iso);
      btn.setAttribute("aria-label", iso);
      if (iso === today) btn.classList.add("is-today");
      if (iso === selected) btn.classList.add("is-selected");
      btn.addEventListener("click", () => {
        selected = iso;
        paint();
        opts.onSelect?.(iso);
      });
      grid.appendChild(btn);
    }
  };

  btnPrev.addEventListener("click", () => {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    opts.onMonthChange?.(year, month);
    paint();
  });

  btnNext.addEventListener("click", () => {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    opts.onMonthChange?.(year, month);
    paint();
  });

  paint();

  return {
    setSelectedDate(iso) {
      selected = iso;
      const p = parseIso(iso);
      year = p.year;
      month = p.month;
      paint();
    },
    getSelectedDate: () => selected
  };
}
