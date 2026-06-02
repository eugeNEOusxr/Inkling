/**
 * Aqua orb ambient overlay manager.
 * Rollback: remove this file and scene.js dynamic import wiring.
 */
export function initOrbs(container, options = {}) {
  const host = container || document.body;
  const layer = document.createElement("div");
  layer.className = "visual-orb-layer";
  layer.style.position = "fixed";
  layer.style.inset = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "10140";
  host.appendChild(layer);

  const anchors = options.anchors || [
    { x: "9%", y: "22%" },
    { x: "86%", y: "16%" },
    { x: "82%", y: "76%" }
  ];

  const orbs = anchors.map((anchor, index) => {
    const orb = document.createElement("div");
    orb.className = "visual-orb";
    orb.style.position = "absolute";
    orb.style.left = anchor.x;
    orb.style.top = anchor.y;
    orb.style.width = "90px";
    orb.style.height = "90px";
    orb.style.borderRadius = "999px";
    orb.style.background = "radial-gradient(circle, rgba(168,247,247,0.42), rgba(78,230,230,0.03) 65%)";
    orb.style.filter = "blur(0.2px)";
    orb.style.boxShadow = "0 0 28px rgba(78,230,230,0.16)";
    orb.style.animation = `orbFloat ${8 + index * 1.2}s ease-in-out infinite alternate`;
    layer.appendChild(orb);
    return orb;
  });

  return {
    destroy() {
      orbs.forEach((orb) => orb.remove());
      layer.remove();
    }
  };
}
