import * as THREE from "three";

/**
 * Canvas billboard label (TextMeshPro equivalent for mobile WebGL).
 * @param {string} text
 */
export function createWordLabelSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 42;
  const pad = 24;
  ctx.font = `600 ${fontSize}px system-ui, Segoe UI, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `600 ${fontSize}px system-ui, Segoe UI, sans-serif`;
  ctx.fillStyle = "rgba(8, 12, 20, 0.75)";
  roundRect(ctx, 4, 4, w - 8, h - 8, 12);
  ctx.fill();
  ctx.fillStyle = "#7ee8ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.012;
  sprite.scale.set(w * scale, h * scale, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
