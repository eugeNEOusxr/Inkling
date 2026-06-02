/**
 * Lightweight adaptive particle overlay.
 * Rollback: remove this file and dynamic imports in scene.js.
 */
export function initParticles(container, options = {}) {
  const host = container || document.body;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const particles = [];
  const count = Math.max(0, Number(options.count || 60));
  let raf = 0;

  canvas.className = "visual-overlay visual-overlay--particles";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "10160";
  host.appendChild(canvas);

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize, { passive: true });

  function emitPixels(x = canvas.width * 0.5, y = canvas.height * 0.5, color = "rgba(212,175,55,0.95)", amount = 12) {
    const spawnCount = Math.min(amount, count);
    for (let i = 0; i < spawnCount; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3.2,
        vy: (Math.random() - 0.5) * 3.2,
        life: 1,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }

  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.012;
      p.life -= 0.018;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    emitPixels,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  };
}
