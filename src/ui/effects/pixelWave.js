/**
 * Gold pixel wave animation triggered by `eugeneous:note-added`.
 * Rollback: remove this file and scene.js event wiring.
 */
export function attachPixelWave() {
  let active = false;

  function play(detail = {}) {
    if (active) return;
    active = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: true });
    canvas.className = "visual-overlay visual-overlay--pixel-wave";
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "10170";
    canvas.style.filter = "blur(0.4px)";
    canvas.style.mixBlendMode = "screen";
    document.body.appendChild(canvas);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const baseY = detail.y ?? canvas.height * 0.55;
    const start = performance.now();
    const duration = 760;

    function draw(now) {
      const t = Math.min(1, (now - start) / duration);
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const waveFront = canvas.width * t;
      for (let i = 0; i < 220; i++) {
        const x = waveFront - i * 5;
        if (x < -12) continue;
        const y = baseY + Math.sin((i * 0.36) + t * 14) * 22;
        const alpha = Math.max(0, 0.95 - i * 0.012 - t * 0.5);
        ctx.fillStyle = `rgba(212,175,55,${alpha})`;
        ctx.fillRect(x, y, 4, 4);
      }
      if (t < 1) {
        requestAnimationFrame(draw);
        return;
      }
      window.removeEventListener("resize", resize);
      canvas.remove();
      active = false;
    }
    requestAnimationFrame(draw);
  }

  const onEvent = (evt) => play(evt.detail || {});
  window.addEventListener("eugeneous:note-added", onEvent);

  return () => {
    window.removeEventListener("eugeneous:note-added", onEvent);
  };
}
