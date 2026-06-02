const DISMISS_KEY = "calendar3d-install-prompt-dismissed-v1";

/**
 * Injected PWA install prompt UI.
 * Remove by deleting this file and its CalendarApp bootstrap hook.
 */
export class InstallPrompt {
  constructor() {
    this._deferredEvent = null;
    this._root = null;
    this._visible = false;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this._deferredEvent = event;
      this._maybeShow();
    });

    window.addEventListener("appinstalled", () => {
      this._deferredEvent = null;
      this.hide();
      localStorage.setItem(DISMISS_KEY, "installed");
    });
  }

  mount() {
    if (this._root) return;

    // Dynamic injection keeps index.html unchanged aside from manifest/meta wiring.
    const root = document.createElement("aside");
    root.className = "install-prompt hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <div class="install-prompt__content">
        <strong class="install-prompt__title">Install Inkling</strong>
        <p class="install-prompt__text">Use Inkling as an app with offline support.</p>
        <div class="install-prompt__actions">
          <button type="button" class="install-prompt__btn install-prompt__btn--primary" data-action="install">Install</button>
          <button type="button" class="install-prompt__btn" data-action="dismiss">Not now</button>
        </div>
      </div>
    `;

    root.querySelector('[data-action="install"]')?.addEventListener("click", () => this._install());
    root.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => this._dismiss());

    document.body.appendChild(root);
    this._root = root;
    this._maybeShow();
  }

  _maybeShow() {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      navigator.standalone === true;
    if (dismissed || standalone || !this._deferredEvent) return;
    this.show();
  }

  show() {
    if (!this._root || this._visible) return;
    this._visible = true;
    this._root.classList.remove("hidden");
  }

  hide() {
    if (!this._root || !this._visible) return;
    this._visible = false;
    this._root.classList.add("hidden");
  }

  async _install() {
    if (!this._deferredEvent) return;
    this._deferredEvent.prompt();
    try {
      await this._deferredEvent.userChoice;
    } finally {
      this._deferredEvent = null;
      this.hide();
    }
  }

  _dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    this.hide();
  }
}
