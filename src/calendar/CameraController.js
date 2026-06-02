import * as THREE from "three";

/**
 * Smooth camera transitions between month overview and day detail.
 */
export class CameraController {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this._animating = false;
    this.mode = "overview";
  }

  get isAnimating() {
    return this._animating;
  }

  /**
   * @param {THREE.Vector3} targetWorld
   * @param {THREE.Vector3} [offset]
   */
  zoomToDay(targetWorld, offset = new THREE.Vector3(0, 0.8, 5.5)) {
    const desired = targetWorld.clone().add(offset);
    return this._animate(desired, targetWorld.clone(), 900);
  }

  /**
   * @param {THREE.Vector3} overviewCenter
   * @param {THREE.Vector3} [offset]
   */
  zoomToOverview(overviewCenter, offset = new THREE.Vector3(0, 1.2, 13)) {
    const desired = overviewCenter.clone().add(offset);
    return this._animate(desired, overviewCenter.clone(), 800);
  }

  /**
   * Restore a previously saved overview camera pose.
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} target
   */
  restoreCamera(position, target) {
    return this._animate(position.clone(), target.clone(), 800);
  }

  _animate(desiredPos, desiredTarget, duration) {
    if (this._animating) return Promise.resolve();

    this._animating = true;
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);

        this.camera.position.lerpVectors(fromPos, desiredPos, e);
        this.controls.target.lerpVectors(fromTarget, desiredTarget, e);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this._animating = false;
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
