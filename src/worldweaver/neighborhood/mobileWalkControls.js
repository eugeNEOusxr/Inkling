/**
 * Mobile touch joystick for neighborhood walking (no fly mode).
 */
export function createMobileWalkControls(container) {
  const el = document.createElement("div");
  el.className = "ww-neighborhood-controls";
  el.innerHTML = `
    <div class="ww-nb-joystick" data-joystick aria-label="Move">
      <div class="ww-nb-joystick-knob"></div>
    </div>
    <p class="ww-nb-hint">Drag to walk · Tap a house</p>
  `;
  container.appendChild(el);

  const joy = el.querySelector("[data-joystick]");
  const knob = el.querySelector(".ww-nb-joystick-knob");
  let moveX = 0;
  let moveZ = 0;
  let active = false;
  let origin = { x: 0, y: 0 };
  const maxR = 48;

  function setKnob(dx, dy) {
    const len = Math.hypot(dx, dy);
    const scale = len > maxR ? maxR / len : 1;
    const nx = dx * scale;
    const ny = dy * scale;
    knob.style.transform = `translate(${nx}px, ${ny}px)`;
    moveX = nx / maxR;
    moveZ = -ny / maxR;
  }

  function onStart(cx, cy) {
    active = true;
    const r = joy.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setKnob(cx - origin.x, cy - origin.y);
  }

  function onMove(cx, cy) {
    if (!active) return;
    setKnob(cx - origin.x, cy - origin.y);
  }

  function onEnd() {
    active = false;
    moveX = 0;
    moveZ = 0;
    knob.style.transform = "";
  }

  joy.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    joy.setPointerCapture(e.pointerId);
    onStart(e.clientX, e.clientY);
  });
  joy.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  joy.addEventListener("pointerup", onEnd);
  joy.addEventListener("pointercancel", onEnd);

  return {
    el,
    getInput: () => ({ moveX, moveZ }),
    destroy: () => el.remove()
  };
}
