/**
 * Full 48 half-hour time slots for Inkling time-entry UI.
 */

const times = [];
for (let h = 0; h < 24; h++) {
  times.push(`${String(h).padStart(2, "0")}:00`);
  times.push(`${String(h).padStart(2, "0")}:30`);
}

/** @type {string[]} */
export const ALL_HALF_HOUR_TIMES = times;

/**
 * @returns {string[]}
 */
export function buildHalfHourTimes() {
  return [...ALL_HALF_HOUR_TIMES];
}

/**
 * @param {string} time HH:MM
 */
function formatListLabel(time) {
  const [h, m] = time.split(":").map(Number);
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   selectedTime?: string,
 *   onSelect?: (time: string) => void
 * }} opts
 */
export function renderTimeList(container, opts = {}) {
  if (!container) return null;

  let selectedTime = opts.selectedTime ?? "09:00";

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "time-entry-list-scroll";
  scrollWrap.setAttribute("role", "presentation");

  const list = document.createElement("div");
  list.className = "time-entry-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "All times");

  /** @type {HTMLButtonElement[]} */
  const buttons = [];

  for (const time of ALL_HALF_HOUR_TIMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-entry-list__slot";
    btn.dataset.time = time;
    btn.setAttribute("role", "option");
    btn.textContent = formatListLabel(time);
    btn.addEventListener("click", () => {
      selectedTime = time;
      buttons.forEach((b) => {
        const on = b.dataset.time === time;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-selected", String(on));
      });
      opts.onSelect?.(time);
      btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    buttons.push(btn);
    list.appendChild(btn);
  }

  scrollWrap.appendChild(list);
  container.innerHTML = "";
  container.appendChild(scrollWrap);

  const markSelected = (time) => {
    selectedTime = time;
    buttons.forEach((b) => {
      const on = b.dataset.time === time;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-selected", String(on));
    });
  };

  markSelected(selectedTime);

  return {
    getSelectedTime: () => selectedTime,
    setSelectedTime: (time) => {
      markSelected(time);
      const btn = buttons.find((b) => b.dataset.time === time);
      btn?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    listEl: list,
    slotCount: buttons.length
  };
}
