/**
 * Dock for minimized OS windows and panels.
 * Rollback: delete file and WindowManager minimize wiring.
 */
export class MinimizeBar {
  constructor() {
    this.el = document.createElement("aside");
    this.el.className = "minimize-bar";
    this.el.setAttribute("aria-label", "Minimized windows");
    this.items = new Map();
  }

  mount(container) {
    if (!container.contains(this.el)) container.appendChild(this.el);
  }

  /**
   * @param {string} id
   * @param {string} title
   * @param {() => void} onRestore
   */
  add(id, title, onRestore) {
    this.remove(id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "minimize-bar__item";
    btn.textContent = title;
    btn.setAttribute("aria-label", `Restore ${title}`);
    btn.addEventListener("click", () => onRestore());
    this.el.appendChild(btn);
    this.items.set(id, { btn, onRestore });
    this.el.classList.toggle("is-empty", this.items.size === 0);
  }

  remove(id) {
    const entry = this.items.get(id);
    if (!entry) return;
    entry.btn.remove();
    this.items.delete(id);
    this.el.classList.toggle("is-empty", this.items.size === 0);
  }

  has(id) {
    return this.items.has(id);
  }
}
