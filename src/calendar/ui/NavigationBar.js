/**
 * Top chrome + sidebar rail — Alerts entry with badge counter.
 */
import { syncAlertsBadge } from "../alerts/alertsModel.js";

/**
 * @param {{ onOpenAlerts: () => void }} opts
 */
export function mountAlertsNavigation(opts) {
  const onOpen = opts.onOpenAlerts ?? (() => {});

  const topBar = document.querySelector(".top-chrome__bar");
  if (topBar && !document.getElementById("btn-inkling-alerts")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-inkling-alerts";
    btn.className = "inkling-alerts-nav-btn top-chrome__alerts";
    btn.setAttribute("aria-label", "Alerts");
    btn.title = "Alerts";
    btn.innerHTML = `
      <span class="inkling-alerts-nav-btn__icon" aria-hidden="true">⏰</span>
      <span class="inkling-alerts-nav-btn__label">Alerts</span>
      <span class="inkling-alerts-badge hidden" data-inkling-alerts-badge>0</span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpen();
    });
    const settings = document.getElementById("btn-top-settings");
    if (settings?.parentElement === topBar) {
      topBar.insertBefore(btn, settings);
    } else {
      topBar.appendChild(btn);
    }
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
      <span aria-hidden="true">⏰</span>
      <span class="inkling-alerts-badge hidden" data-inkling-alerts-badge>0</span>
    `;
    railBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpen();
    });
    rail.appendChild(railBtn);
  }

  syncAlertsBadge();
  document.addEventListener("inkling:alerts-updated", () => syncAlertsBadge());
}
