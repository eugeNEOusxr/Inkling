import * as THREE from "three";
import { getCategoryColor } from "./timelineModel.js";

const PLANE_W = 1.2;
const PLANE_H = 1.6;

/**
 * Cracked-reality outline — thin cyan fracture lines with shimmer.
 */
function createCrackOverlayMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#00ffff") },
      uOpacity: { value: 0.28 },
      uThickness: { value: 0.003 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uThickness;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float lineDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      void main() {
        float crack = 0.0;
        for (int i = 0; i < 10; i++) {
          float fi = float(i);
          vec2 seed = vec2(hash(vec2(fi, 1.7)), hash(vec2(fi, 9.2)));
          vec2 a = seed;
          vec2 b = vec2(hash(vec2(fi, 3.1)), hash(vec2(fi, 5.4)));
          float d = lineDist(vUv, a, b);
          crack = max(crack, smoothstep(uThickness * 3.0, 0.0, d));
          vec2 c = mix(a, b, 0.35 + 0.3 * hash(vec2(fi, 7.8)));
          vec2 d2 = mix(b, vec2(hash(vec2(fi, 2.2)), hash(vec2(fi, 4.9))), 0.5);
          float dBranch = lineDist(vUv, c, d2);
          crack = max(crack, smoothstep(uThickness * 2.5, 0.0, dBranch) * 0.85);
        }
        float shimmer = 0.65 + 0.35 * sin(uTime * 4.0 + vUv.x * 40.0 + vUv.y * 30.0);
        float alpha = crack * uOpacity * shimmer;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });
}

/**
 * @param {string} text
 * @param {number} w
 * @param {number} h
 */
function textCardTexture(text, w = 256, h = 96) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "rgba(8, 16, 32, 0.92)";
  ctx.strokeStyle = "rgba(0, 255, 255, 0.45)";
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, w - 8, h - 8, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 14px system-ui, sans-serif";
  const line = String(text).slice(0, 48);
  ctx.fillText(line, 14, 36, w - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * 3D calendar day tile — glass block, category glow, cracked outline, note cards.
 */
export class DayBlock {
  /**
   * @param {{
   *   day: number,
   *   dateIso: string,
   *   events?: { time?: string, text: string, category?: string }[],
   *   glowColor?: string,
   *   isToday?: boolean
   * }} opts
   */
  constructor(opts) {
    this.day = opts.day;
    this.dateIso = opts.dateIso;
    this.events = opts.events ?? [];
    this._near = false;
    this._baseScale = 1;
    this._targetScale = 1;
    this._glowIntensity = 0.4;

    const glowHex = opts.glowColor ?? this._dominantGlowColor();
    const glowColor = new THREE.Color(glowHex);

    this.group = new THREE.Group();
    this.group.name = `day-block-${opts.dateIso}`;
    this.group.userData.dayBlock = this;

    const panelGeo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
    const panelMat = new THREE.MeshPhysicalMaterial({
      color: "#0a0a0a",
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    });
    this.panel = new THREE.Mesh(panelGeo, panelMat);
    this.panel.renderOrder = 2;
    this.group.add(this.panel);

    const edgeGeo = new THREE.PlaneGeometry(PLANE_W * 1.04, PLANE_H * 1.04);
    this.edgeMat = new THREE.MeshStandardMaterial({
      color: glowHex,
      emissive: glowColor,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.55,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.edge = new THREE.Mesh(edgeGeo, this.edgeMat);
    this.edge.position.z = -0.008;
    this.edge.renderOrder = 1;
    this.group.add(this.edge);

    this.crackMat = createCrackOverlayMaterial();
    this.crack = new THREE.Mesh(panelGeo.clone(), this.crackMat);
    this.crack.position.z = 0.012;
    this.crack.renderOrder = 4;
    this.group.add(this.crack);

    const labelTex = textCardTexture(String(this.day), 64, 64);
    if (labelTex) {
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        depthWrite: false
      });
      this.dayLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), labelMat);
      this.dayLabel.position.set(-PLANE_W * 0.38, PLANE_H * 0.38, 0.02);
      this.group.add(this.dayLabel);
    }

    this.noteCardsGroup = new THREE.Group();
    this.noteCardsGroup.visible = false;
    this.group.add(this.noteCardsGroup);
    this._buildNoteCards();

    if (opts.isToday) {
      this.edgeMat.emissiveIntensity = 0.55;
    }
  }

  _dominantGlowColor() {
    const ev = this.events[0];
    if (!ev) return "#00ffff";
    const cat = ev.category === "errand" ? "errands" : ev.category ?? "personal";
    return getCategoryColor(cat);
  }

  _buildNoteCards() {
    while (this.noteCardsGroup.children.length) {
      const ch = this.noteCardsGroup.children[0];
      ch.geometry?.dispose();
      ch.material?.map?.dispose();
      ch.material?.dispose();
      this.noteCardsGroup.remove(ch);
    }

    const slice = this.events.slice(0, 4);
    slice.forEach((ev, i) => {
      const tex = textCardTexture(`${ev.time ?? ""} ${ev.text}`.trim());
      if (!tex) return;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.95
      });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.34), mat);
      card.position.set(0, PLANE_H * 0.55 + i * 0.38, 0.05 + i * 0.02);
      this.noteCardsGroup.add(card);
    });
  }

  /**
   * @param {{ time?: string, text: string, category?: string }[]} events
   * @param {string} [glowColor]
   */
  setEvents(events, glowColor) {
    this.events = events;
    if (glowColor) {
      const c = new THREE.Color(glowColor);
      this.edgeMat.color.copy(c);
      this.edgeMat.emissive.copy(c);
    } else {
      const hex = this._dominantGlowColor();
      const c = new THREE.Color(hex);
      this.edgeMat.color.copy(c);
      this.edgeMat.emissive.copy(c);
    }
    this._buildNoteCards();
  }

  /**
   * @param {boolean} near
   */
  setProximity(near) {
    this._near = near;
    this._targetScale = near ? 1.1 : 1;
    this.noteCardsGroup.visible = near && this.events.length > 0;
    this._glowIntensity = near ? 0.85 : 0.4;
  }

  /**
   * @param {number} delta
   * @param {number} elapsed
   */
  update(delta, elapsed) {
    this.crackMat.uniforms.uTime.value = elapsed;

    const lerp = 1 - Math.pow(0.001, delta);
    this._baseScale += (this._targetScale - this._baseScale) * lerp;
    this.group.scale.setScalar(this._baseScale);

    const targetGlow = this._glowIntensity;
    this.edgeMat.emissiveIntensity +=
      (targetGlow - this.edgeMat.emissiveIntensity) * Math.min(1, delta * 8);
  }

  dispose() {
    this.panel.geometry.dispose();
    this.panel.material.dispose();
    this.edge.geometry.dispose();
    this.edge.material.dispose();
    this.crack.geometry.dispose();
    this.crackMat.dispose();
    this.noteCardsGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material?.map) obj.material.map.dispose();
        obj.material?.dispose();
      }
    });
    this.dayLabel?.geometry?.dispose();
    this.dayLabel?.material?.map?.dispose();
    this.dayLabel?.material?.dispose();
  }
}
