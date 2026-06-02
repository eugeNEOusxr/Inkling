/**
 * Fade between notebook and appointments walls.
 */
export class WallTransitionController {
  /**
   * @param {import("./CalendarWall.js").CalendarWall} notebookWall
   * @param {import("./AppointmentWall.js").AppointmentWall} appointmentWall
   */
  constructor(notebookWall, appointmentWall) {
    this.notebookWall = notebookWall;
    this.appointmentWall = appointmentWall;
    this._busy = false;
  }

  get isBusy() {
    return this._busy;
  }

  /**
   * @param {'notebook'|'appointments'} target
   */
  async switchTo(target) {
    if (this._busy) return;

    const showNotebook = target === "notebook";
    const fromWall = showNotebook ? this.appointmentWall : this.notebookWall;
    const toWall = showNotebook ? this.notebookWall : this.appointmentWall;

    if (showNotebook) {
      if (this.notebookWall.group.visible && !this.appointmentWall.group.visible) {
        this.notebookWall.setGroupOpacity(1);
        return;
      }
    } else if (this.appointmentWall.group.visible && !this.notebookWall.group.visible) {
      this.appointmentWall.setGroupOpacity(1);
      return;
    }

    this._busy = true;
    await this._fadeWall(fromWall, 0);
    fromWall.setVisible(false);
    fromWall.setGroupOpacity(1);

    toWall.setVisible(true);
    toWall.setGroupOpacity(0);
    await this._fadeWall(toWall, 1);
    this._busy = false;
  }

  _fadeWall(wall, targetOpacity) {
    const startOpacity = targetOpacity === 0 ? 1 : 0;
    const duration = 380;
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const o = startOpacity + (targetOpacity - startOpacity) * e;
        wall.setGroupOpacity(o);

        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
}
