/**
 * In-app "update available" banner for the installed PWA. When a new service
 * worker is waiting, this lets the user apply the update with one tap instead of
 * deleting + reinstalling the home-screen app. Reuses the .install-prompt styles.
 *
 * Remove by deleting this file and its CalendarApp bootstrap hook.
 */
export class UpdatePrompt {
  constructor() {
    this._root = null;
    this._onUpdate = null;
  }

  mount() {
    if (this._root) return;
    const root = document.createElement("aside");
    root.className = "install-prompt update-prompt hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <div class="install-prompt__content">
        <strong class="install-prompt__title">Update available</strong>
        <p class="install-prompt__text" data-update-text>A new version of Inkling is ready.</p>
        <div class="install-prompt__actions">
          <button type="button" class="install-prompt__btn install-prompt__btn--primary" data-action="update">Update</button>
          <button type="button" class="install-prompt__btn" data-action="later">Later</button>
        </div>
      </div>
    `;
    root.querySelector('[data-action="update"]')?.addEventListener("click", () => {
      this._onUpdate?.();
    });
    root.querySelector('[data-action="later"]')?.addEventListener("click", () => this.hide());
    document.body.appendChild(root);
    this._root = root;
  }

  /**
   * Show the banner with an "Update" button.
   * @param {() => void} onUpdate
   */
  showAvailable(onUpdate) {
    this.mount();
    this._onUpdate = onUpdate;
    this._setText("A new version of Inkling is ready.");
    this._setUpdateVisible(true);
    this._root.classList.remove("hidden");
  }

  /**
   * Transient status (used by the manual "Check for updates" action).
   * @param {string} message
   * @param {number} [autoHideMs]
   */
  showStatus(message, autoHideMs = 0) {
    this.mount();
    this._setText(message);
    this._setUpdateVisible(false);
    this._root.classList.remove("hidden");
    if (this._statusTimer) clearTimeout(this._statusTimer);
    if (autoHideMs > 0) {
      this._statusTimer = setTimeout(() => this.hide(), autoHideMs);
    }
  }

  hide() {
    this._root?.classList.add("hidden");
  }

  _setText(text) {
    const el = this._root?.querySelector("[data-update-text]");
    if (el) el.textContent = text;
  }

  _setUpdateVisible(visible) {
    const btn = this._root?.querySelector('[data-action="update"]');
    if (btn) btn.style.display = visible ? "" : "none";
  }
}
