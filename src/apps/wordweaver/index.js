/**
 * WordWeaver — satellite 3D thought-weaving for one day segment.
 */
import { DAY_SEGMENTS } from "../../inkling-core/timelineNode.js";
import { WordWeaverScene } from "../../wordweaver/WordWeaverScene.js";
import { WEAVE_LAYOUT_MODES } from "../../wordweaver/layoutModes.js";
import { buildSegmentModule } from "../../inkling-core/timelineNode.js";
import { syncCalendarDayToWeaver, getWeaverNodesForSegment } from "../../wordweaver/calendarWordWeaverSync.js";
import { buildRemarkNodes } from "../../wordweaver/wordweaverRemarks.js";
import { getAllTimelineNodes } from "../../inkling-core/timelineStorage.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateHeader(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 */
export async function mount(container, opts = {}) {
  let date = opts.dayId ?? opts.getState?.()?.date ?? todayIso();
  let segment = opts.initialView === "morning" || opts.initialView === "night" ? opts.initialView : "afternoon";
  let layoutMode = "street";

  container.innerHTML = `
    <div class="wordweaver-shell">
      <header class="wordweaver-shell__header">
        <p class="wordweaver-shell__date" data-date-label></p>
        <label class="wordweaver-shell__layout">
          Layout
          <select data-layout-select aria-label="3D layout mode"></select>
        </label>
        <div class="wordweaver-shell__segments" role="tablist" aria-label="Day segment">
          ${DAY_SEGMENTS.map(
            (s) =>
              `<button type="button" class="wordweaver-segment-btn" role="tab" data-segment="${s}">${s}</button>`
          ).join("")}
        </div>
        <button type="button" class="wordweaver-shell__close os-window__btn os-window__btn--close" aria-label="Close">×</button>
      </header>
      <p class="wordweaver-shell__hint">WordWeaver — spatial layouts for notes, calendar, and AI insights.</p>
      <div class="wordweaver-canvas-wrap" data-canvas-wrap></div>
      <ul class="wordweaver-node-list" data-node-list aria-label="Nodes in segment"></ul>
    </div>
  `;

  const dateLabel = container.querySelector("[data-date-label]");
  const canvasWrap = container.querySelector("[data-canvas-wrap]");
  const nodeList = container.querySelector("[data-node-list]");
  const segmentBtns = container.querySelectorAll("[data-segment]");
  const layoutSelect = container.querySelector("[data-layout-select]");

  for (const m of WEAVE_LAYOUT_MODES) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    layoutSelect?.appendChild(opt);
  }

  const scene = new WordWeaverScene(canvasWrap);

  const syncSegmentTabs = () => {
    segmentBtns.forEach((btn) => {
      const active = btn.getAttribute("data-segment") === segment;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
  };

  const renderModule = () => {
    const calState = opts.getCalendarState?.();
    if (calState) syncCalendarDayToWeaver(calState, date);
    const allDay = getAllTimelineNodes().filter((n) => n.date === date);
    const baseNodes = calState
      ? getWeaverNodesForSegment(calState, date, segment)
      : allDay.filter((n) => n.segment === segment);
    const remarks = buildRemarkNodes(allDay, date).filter((r) => r.segment === segment);
    const mod = buildSegmentModule(date, segment, [...baseNodes, ...remarks]);

    if (dateLabel) dateLabel.textContent = `${formatDateHeader(date)} · ${mod.label}`;
    scene.setLayoutMode(layoutMode);
    scene.setModule(mod, { immersive: true });
    if (nodeList) {
      nodeList.innerHTML = mod.nodes
        .map(
          (n) =>
            `<li><span class="wordweaver-node-list__time">${n.time ?? "—"}</span> ${n.text}` +
            (n.kind === "insight" ? " <em>(insight)</em>" : "") +
            (n.tags?.length ? ` <em class="wordweaver-node-list__tags">${n.tags.join(", ")}</em>` : "") +
            `</li>`
        )
        .join("");
    }
    syncSegmentTabs();
  };

  segmentBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-segment");
      if (next === "morning" || next === "afternoon" || next === "night") segment = next;
      renderModule();
    });
  });

  layoutSelect?.addEventListener("change", () => {
    layoutMode = layoutSelect.value;
    renderModule();
  });

  container.querySelector(".wordweaver-shell__close")?.addEventListener("click", () => {
    opts.onCloseWindow?.();
  });

  renderModule();

  return () => {
    scene.dispose();
    container.innerHTML = "";
  };
}
