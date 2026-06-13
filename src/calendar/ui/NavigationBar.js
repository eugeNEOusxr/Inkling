/**
 * Top chrome — view levels (Today / Week / Month / Year) + bell Alerts.
 */
import * as bus from "../../utils/EventBus.js";
import { syncAlertsBadge } from "../alerts/alertsModel.js";
import { getAlertsDropdown, openAlertsDropdown } from "../alerts/AlertsDropdown.js";
import { openPanel } from "./AppLauncher.js";
import { iconBell } from "./IconLibrary.js";
import { todayIsoDate } from "../../wordweaver/timelineModel.js";
import "../views/WeekView.js";
import "../views/MonthView.js";

/** @type {import("./WindowManager.js").WindowManager | null} */
let shellWindowManager = null;

/**
 * @param {import("./WindowManager.js").WindowManager | null} wm
 */
export function registerShellWindowManager(wm) {
  shellWindowManager = wm;
}

/**
 * @param {string} panelId
 */
export function openViewPanel(panelId) {
  if (shellWindowManager?.openPanel) {
    shellWindowManager.openPanel(panelId);
    return;
  }
  openPanel(panelId);
}

/**
 * @param {{ windowManager?: import("./WindowManager.js").WindowManager | null }} [opts]
 */
export function mountAlertsNavigation(opts = {}) {
  if (opts.windowManager) registerShellWindowManager(opts.windowManager);
  mountViewNavigation(opts);
}

/**
 * @param {string} dateIso
 * @param {"day"|"week"|"month"|"year"} level
 */
function emitNavigateTo(dateIso, level) {
  bus.emit("navigateTo", { date: dateIso, level });
}

/**
 * Today · Week · Month · Year · Alerts (view levels — not app tabs).
 */
function mountViewNavigation() {
  const topBar = document.querySelector(".top-chrome__bar");
  if (!topBar || topBar.querySelector(".inkling-view-nav")) return;

  getAlertsDropdown()._mount();

  const nav = document.createElement("nav");
  nav.className = "inkling-view-nav";
  nav.setAttribute("aria-label", "Calendar view level");

  const views = [
    { id: "today", label: "Today", level: "day" },
    { id: "weekView", label: "Week", level: "week", panel: "weekView" },
    { id: "monthView", label: "Month", level: "month", panel: "monthView" },
    { id: "year", label: "Year", level: "year" }
    // Alerts removed here — it's now the top-bar bell (btn-top-alerts).
  ];

  for (const v of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inkling-view-nav__btn";
    btn.dataset.view = v.id;
    if (v.id === "alerts") {
      btn.id = "btn-inkling-alerts";
      btn.setAttribute("aria-label", "Alerts");
      btn.innerHTML = `<span class="inkling-view-nav__bell" aria-hidden="true">${iconBell}</span><span class="sr-only">Alerts</span><span class="inkling-alerts-badge hidden" data-inkling-alerts-badge>0</span>`;
    } else {
      btn.textContent = v.label;
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      topBar.querySelectorAll(".inkling-view-nav__btn").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      if (v.isAlerts) {
        openAlertsDropdown();
        return;
      }
      const date = todayIsoDate();
      if (v.level) emitNavigateTo(date, v.level);
      if (v.panel) openViewPanel(v.panel);
    });
    nav.appendChild(btn);
  }

  const settings = document.getElementById("btn-top-settings");
  if (settings?.parentElement === topBar) {
    topBar.insertBefore(nav, settings);
  } else {
    topBar.appendChild(nav);
  }

  const rail = document.querySelector(".calendar-sidebar__rail-alerts");
  if (rail && !rail.querySelector("[data-inkling-alerts-rail]")) {
    const railBtn = document.createElement("button");
    railBtn.type = "button";
    railBtn.className = "inkling-alerts-rail-btn";
    railBtn.dataset.inklingAlertsRail = "1";
    railBtn.setAttribute("aria-label", "Alerts");
    railBtn.title = "Alerts";
    railBtn.innerHTML = `
      <span class="inkling-view-nav__bell" aria-hidden="true">${iconBell}</span>
      <span class="inkling-alerts-badge hidden" data-inkling-alerts-badge>0</span>
    `;
    railBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openAlertsDropdown();
    });
    rail.appendChild(railBtn);
  }

  syncAlertsBadge();
  bus.on("alertTriggered", () => syncAlertsBadge());
  bus.on("eventUpdated", () => syncAlertsBadge());
  bus.on("eventDeleted", () => syncAlertsBadge());
  bus.on("eventCreated", () => syncAlertsBadge());
  document.addEventListener("inkling:alerts-dropdown-toggle", () => {
    const btn = document.getElementById("btn-inkling-alerts");
    const dd = getAlertsDropdown();
    if (btn) btn.setAttribute("aria-expanded", String(dd.isOpen()));
  });

  document.addEventListener("inkling:open-panel", (e) => {
    const id = e.detail?.panelId;
    if (!id) return;
    topBar.querySelectorAll(".inkling-view-nav__btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.view === id);
    });
  });

  document.addEventListener("inkling:close-all-panels", () => {
    topBar.querySelectorAll(".inkling-view-nav__btn").forEach((b) => {
      b.classList.remove("is-active");
    });
  });
}

export { openAlertsDropdown };
