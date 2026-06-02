/**
 * Shell launcher icon for one registered satellite app.
 * Rollback: remove this file and AppLauncher imports that reference it.
 */
export class AppIcon {
  constructor(app, { onOpen }) {
    this.app = app;
    this.onOpen = onOpen;
    this.el = null;
  }

  mount(container) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "os-app-icon";
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", `Open ${this.app.title}`);
    button.innerHTML = `
      <img class="os-app-icon__image" src="${this.app.icon}" alt="" aria-hidden="true" />
      <span class="os-app-icon__label">${this.app.title}</span>
    `;
    const triggerOpen = () => this.onOpen(this.app.id);
    button.addEventListener("click", triggerOpen);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        triggerOpen();
      }
    });
    container.appendChild(button);
    this.el = button;
  }
}
