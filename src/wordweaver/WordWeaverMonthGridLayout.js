/**
 * Pure wall-calendar layout math (no Three.js) — Phase 5 REDESIGN M1.
 */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/** @typedef {{ iso: string, day: number, col: number, row: number, x: number, y: number }} MonthGridDayCell */

const COL_COUNT = 7;
const COL_SPACING = 1.5;
const ROW_STEP = 2.0;
const WEEK_ROW_GAP = 0.55;
export const GRID_RADIUS = { month: 0.88, day: 0.38, note: 0.14 };
/** Year overview: month sphere 2× M1 single-month size. */
export const YEAR_GRID_RADIUS = { month: GRID_RADIUS.month * 2, day: GRID_RADIUS.day, note: GRID_RADIUS.note };
export const YEAR_PANEL_COLS = 4;
export const YEAR_PANEL_ROWS = 3;
/** Generous cluster spacing — separation without borders. */
export const YEAR_CLUSTER_SPACING = { x: 16, y: 20 };

/** @typedef {{
 *   monthIndex: number,
 *   panelCol: number,
 *   panelRow: number,
 *   origin: { x: number, y: number },
 *   monthLayout: ReturnType<typeof computeMonthGridLayout>,
 *   monthCenter: { x: number, y: number, z: number }
 * }} YearGridMonthCluster */

/**
 * Wall-calendar cell layout — Monday-start, empty leading/trailing weeks, deterministic.
 *
 * @param {number} year
 * @param {number} monthIndex 0–11
 * @param {{ monthRadius?: number }} [opts]
 * @returns {{
 *   year: number,
 *   monthIndex: number,
 *   weekCount: number,
 *   monOffset: number,
 *   daysInMonth: number,
 *   cells: MonthGridDayCell[],
 *   monthCenter: { x: number, y: number, z: number },
 *   bounds: { width: number, height: number }
 * }}
 */
export function computeMonthGridLayout(year, monthIndex, opts = {}) {
  const monthRadius = opts.monthRadius ?? GRID_RADIUS.month;
  const month = monthIndex + 1;
  const first = new Date(year, monthIndex, 1);
  const monOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekCount = Math.ceil((monOffset + daysInMonth) / 7);
  const rowStride = ROW_STEP + WEEK_ROW_GAP;

  /** @type {MonthGridDayCell[]} */
  const cells = [];

  const isoOf = (dObj) =>
    `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, "0")}-${String(dObj.getDate()).padStart(2, "0")}`;
  const placeCell = (cellIndex, dObj, inMonth) => {
    const col = cellIndex % COL_COUNT;
    const row = Math.floor(cellIndex / COL_COUNT);
    cells.push({
      iso: isoOf(dObj),
      day: dObj.getDate(),
      col,
      row,
      x: (col - 3) * COL_SPACING,
      y: -row * rowStride,
      inMonth
    });
  };

  // Leading days from the previous month + trailing days from the next month
  // fill the grid so weekday columns line up (opt-in: month view only, not the
  // 12-up year panel).
  if (opts.includeAdjacent) {
    for (let i = 0; i < monOffset; i++) {
      placeCell(i, new Date(year, monthIndex, 1 - (monOffset - i)), false);
    }
  }
  for (let day = 1; day <= daysInMonth; day++) {
    placeCell(monOffset + day - 1, new Date(year, monthIndex, day), true);
  }
  if (opts.includeAdjacent) {
    const total = weekCount * COL_COUNT;
    for (let i = monOffset + daysInMonth; i < total; i++) {
      placeCell(i, new Date(year, monthIndex, daysInMonth + (i - (monOffset + daysInMonth) + 1)), false);
    }
  }

  const gridHeight = (weekCount - 1) * rowStride + ROW_STEP;
  const monthCenter = {
    x: 0,
    y: monthRadius + 1.35,
    z: 0.05
  };

  return {
    year,
    monthIndex,
    weekCount,
    monOffset,
    daysInMonth,
    cells,
    monthCenter,
    bounds: {
      width: COL_COUNT * COL_SPACING + 1.2,
      height: gridHeight + monthRadius * 2 + 2.8
    }
  };
}

/**
 * 4×3 year panel — Jan top-left → Dec bottom-right, generous cluster spacing.
 *
 * @param {number} year
 * @returns {{
 *   year: number,
 *   clusters: YearGridMonthCluster[],
 *   bounds: { width: number, height: number, minX: number, maxX: number, minY: number, maxY: number }
 * }}
 */
export function computeYearGridLayout(year) {
  /** @type {YearGridMonthCluster[]} */
  const clusters = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const panelCol = monthIndex % YEAR_PANEL_COLS;
    const panelRow = Math.floor(monthIndex / YEAR_PANEL_COLS);
    const originX = (panelCol - (YEAR_PANEL_COLS - 1) / 2) * YEAR_CLUSTER_SPACING.x;
    const originY = ((YEAR_PANEL_ROWS - 1) / 2 - panelRow) * YEAR_CLUSTER_SPACING.y;
    const monthLayout = computeMonthGridLayout(year, monthIndex, {
      monthRadius: YEAR_GRID_RADIUS.month
    });
    const monthCenter = {
      x: originX + monthLayout.monthCenter.x,
      y: originY + monthLayout.monthCenter.y,
      z: monthLayout.monthCenter.z
    };

    for (const cell of monthLayout.cells) {
      const wx = originX + cell.x;
      const wy = originY + cell.y;
      minX = Math.min(minX, wx - GRID_RADIUS.day);
      maxX = Math.max(maxX, wx + GRID_RADIUS.day);
      minY = Math.min(minY, wy - GRID_RADIUS.day);
      maxY = Math.max(maxY, wy + GRID_RADIUS.day);
    }

    const halfW = monthLayout.bounds.width / 2;
    const halfH = monthLayout.bounds.height / 2;
    minX = Math.min(minX, originX - halfW);
    maxX = Math.max(maxX, originX + halfW);
    minY = Math.min(minY, originY - halfH);
    maxY = Math.max(maxY, originY + halfH + YEAR_GRID_RADIUS.month);

    clusters.push({
      monthIndex,
      panelCol,
      panelRow,
      origin: { x: originX, y: originY },
      monthLayout,
      monthCenter
    });
  }

  return {
    year,
    clusters,
    bounds: {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      maxX,
      minY,
      maxY
    }
  };
}

/**
 * Poster/backboard frame for a single month cluster (slightly larger than cluster bounds).
 * @param {YearGridMonthCluster} cluster
 */
export function clusterBackboardFrame(cluster) {
  const { monthCenter, monthLayout } = cluster;
  return {
    cx: monthCenter.x,
    // Drop the center toward the grid + trim the height so the top doesn't poke up
    // into the month row above (it used to extend ~0.35*height above the sphere).
    cy: monthCenter.y - monthLayout.bounds.height * 0.45,
    w: monthLayout.bounds.width * 1.2,
    h: monthLayout.bounds.height * 1.0
  };
}
