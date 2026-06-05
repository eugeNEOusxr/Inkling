import * as THREE from "three";
import { loadTimeline } from "./timelineModel.js";
import { Timeline3DScene } from "./timeline3d/Timeline3DScene.js";
import { onTimelineDataChange, disposeTimelineDataChange } from "../utils/EventBus.js";

const MOVE_SPEED = 5;

/**
 * WASD / Q-E flight on top of OrbitControls (mouse drag + scroll).
 * @param {THREE.PerspectiveCamera} camera
 * @param {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} controls
 */
function createFreeCameraMovement(camera, controls) {
  /** @type {Record<string, boolean>} */
  const keys = {};
  let extForward = 0;
  let extStrafe = 0;
  let extLift = 0;
  let enabled = true;

  const onKeyDown = (e) => {
    if (!enabled) return;
    keys[e.code] = true;
  };
  const onKeyUp = (e) => {
    if (!enabled) return;
    keys[e.code] = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    /**
     * @param {boolean} on
     */
    setEnabled(on) {
      enabled = on;
      if (!enabled) {
        for (const k of Object.keys(keys)) delete keys[k];
        extForward = 0;
        extStrafe = 0;
        extLift = 0;
      }
    },
    /**
     * @param {number} forward -1..1
     * @param {number} strafe -1..1
     * @param {number} lift -1..1
     */
    setFlightInput(forward, strafe, lift) {
      if (!enabled) return;
      extForward = forward;
      extStrafe = strafe;
      extLift = lift;
    },
    /**
     * @param {number} delta
     */
    update(delta) {
      if (!enabled) return;
      const speed = MOVE_SPEED * delta;
      const forward =
        (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + extForward;
      const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + extStrafe;
      const vertical = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0) + extLift;
      if (!forward && !strafe && !vertical) return;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      else dir.normalize();

      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();

      if (forward) {
        camera.position.addScaledVector(dir, forward * speed);
        controls.target.addScaledVector(dir, forward * speed);
        camera.translateZ(-forward * speed * 0.35);
      }
      if (strafe) {
        camera.position.addScaledVector(right, strafe * speed);
        controls.target.addScaledVector(right, strafe * speed);
      }
      if (vertical) {
        camera.position.y += vertical * speed;
        controls.target.y += vertical * speed;
      }
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };
}

/**
 * Mount Depth Staircase timeline into an existing WordWeaver Three.js scene.
 * @param {{
 *   scene: import("three").Scene,
 *   camera?: import("three").PerspectiveCamera,
 *   renderer?: import("three").WebGLRenderer,
 *   controls?: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls,
 *   domElement?: HTMLElement
 * }} opts
 */
export function mountWordWeaverTimeline(opts) {
  const { scene, camera, controls, domElement } = opts;
  const timeline3d = new Timeline3DScene({ scene });
  timeline3d.buildFromTimeline(loadTimeline());

  let selectedIndex = 0;
  const movement = camera && controls ? createFreeCameraMovement(camera, controls) : null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const clampIndex = () => {
    const n = timeline3d.entries3D.length;
    if (!n) {
      selectedIndex = 0;
      return;
    }
    selectedIndex = Math.max(0, Math.min(selectedIndex, n - 1));
  };

  const fitSelected = () => {
    clampIndex();
    const entry = timeline3d.entries3D[selectedIndex];
    if (entry && camera && controls) {
      timeline3d.fitToEntry(entry, camera, controls);
    }
  };

  const selectByIndex = (index) => {
    selectedIndex = index;
    fitSelected();
  };

  const selectById = (id) => {
    const idx = timeline3d.entries3D.findIndex((e) => e.entry.id === id);
    if (idx >= 0) selectByIndex(idx);
  };

  const onWheel = (e) => {
    if (!timeline3d.entries3D.length || !e.shiftKey) return;
    e.preventDefault();
    selectedIndex += e.deltaY > 0 ? 1 : -1;
    fitSelected();
  };

  const onPointerDown = (e) => {
    if (!camera || !domElement) return;
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      timeline3d.entries3D.map((en) => en.group),
      true
    );
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && !obj.name?.startsWith("timeline-entry-3d-")) {
      obj = obj.parent;
    }
    if (!obj?.name) return;
    const id = obj.name.replace("timeline-entry-3d-", "");
    selectById(id);
  };

  const onKeyDownNav = (e) => {
    if (!timeline3d.entries3D.length) return;
    if (e.code === "ArrowUp" || e.code === "PageUp") {
      e.preventDefault();
      selectByIndex(selectedIndex - 1);
    } else if (e.code === "ArrowDown" || e.code === "PageDown") {
      e.preventDefault();
      selectByIndex(selectedIndex + 1);
    } else if (e.code === "Home") {
      e.preventDefault();
      selectByIndex(0);
    } else if (e.code === "End") {
      e.preventDefault();
      selectByIndex(timeline3d.entries3D.length - 1);
    }
  };

  const onTimelineUpdated = () => {
    timeline3d.buildFromTimeline(loadTimeline());
    clampIndex();
    fitSelected();
  };

  const timelineBusDisposers = onTimelineDataChange(onTimelineUpdated);

  if (domElement) {
    domElement.addEventListener("wheel", onWheel, { passive: false });
    domElement.addEventListener("pointerdown", onPointerDown);
  }
  window.addEventListener("keydown", onKeyDownNav);

  if (camera && controls) {
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 0.4;
    controls.maxDistance = 80;
    fitSelected();
  }

  return {
    timeline3d,
    /**
     * @param {number} forward
     * @param {number} strafe
     * @param {number} lift
     */
    setFlightInput(forward, strafe, lift) {
      movement?.setFlightInput(forward, strafe, lift);
    },
    /**
     * @param {boolean} on
     */
    setMovementEnabled(on) {
      movement?.setEnabled(on);
    },
    /**
     * @param {number} delta
     */
    update(delta) {
      movement?.update(delta);
      timeline3d.update(delta);
      controls?.update();
    },
    dispose() {
      disposeTimelineDataChange(timelineBusDisposers);
      movement?.dispose();
      if (domElement) {
        domElement.removeEventListener("wheel", onWheel);
        domElement.removeEventListener("pointerdown", onPointerDown);
      }
      window.removeEventListener("keydown", onKeyDownNav);
      timeline3d.dispose();
    }
  };
}
