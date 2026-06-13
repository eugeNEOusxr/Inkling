/**
 * Fixed bottom icon bar — Calendar (3D, data-tab="wordweaver"), Schedule
 * (data-tab="writer"), Inkling, Alerts.
 */
export class InklingBottomNav {
  /**
   * @param {{ onTab: (tab: string, meta: { toggle: boolean }) => void }} opts
   */
  constructor(opts = {}) {
    this.onTab = opts.onTab ?? (() => {});
    this.el = document.getElementById("inkling-bottom-nav");
    this._activeTab = null;

    this.el?.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tab = btn.getAttribute("data-tab");
        if (!tab) return;
        const toggle = this._activeTab === tab;
        this.onTab(tab, { toggle });
      });
    });
  }

  /**
   * @param {string | null} tab
   */
  setActiveTab(tab) {
    this._activeTab = tab;
    this.el?.querySelectorAll("[data-tab]").forEach((btn) => {
      const isActive = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    document.body.classList.toggle("inkling-bottom-tab-active", Boolean(tab));
    if (tab) {
      document.body.dataset.inklingBottomTab = tab;
    } else {
      delete document.body.dataset.inklingBottomTab;
    }
  }

  getActiveTab() {
    return this._activeTab;
  }

  show() {
    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
  }

  hide() {
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
  }
}
