/**
 * Alerts panel (Milestone 2.3): delegates to the canonical AlertsDropdown list/sheet.
 * The former full-screen list + duplicate toast are retired — one list, one toast (InAppAlert).
 */

import { openAlertsDropdown, closeAlertsDropdown, getAlertsDropdown } from "./AlertsDropdown.js";
import { syncAlertsBadge } from "./alertsModel.js";

/**
 * Thin wrapper so CalendarApp / bottom nav keep the same API while using AlertsDropdown.
 */
export class AlertsPanel {
  /**
   * @param {{
   *   windowManager?: import("../ui/WindowManager.js").WindowManager | null,
   *   onClose?: () => void
   * }} opts
   */
  constructor(opts = {}) {
    this.windowManager = opts.windowManager ?? null;
    this.onClose = opts.onClose ?? (() => {});
    this._open = false;
    document.addEventListener("inkling:alerts-dropdown-toggle", () => {
      if (!getAlertsDropdown().isOpen() && this._open) {
        this._open = false;
        this.onClose();
      }
    });
  }

  open() {
    this.windowManager?.closeAllPanels();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
    openAlertsDropdown();
    this._open = true;
  }

  close() {
    closeAlertsDropdown();
    if (this._open) this.onClose();
    this._open = false;
  }

  isOpen() {
    return getAlertsDropdown().isOpen();
  }

  /** @deprecated List lives in AlertsDropdown */
  render() {
    syncAlertsBadge();
  }
}
