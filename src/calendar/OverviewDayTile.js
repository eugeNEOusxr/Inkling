import * as THREE from "three";
import { isToday, isWeekend, parseDate } from "./calendarState.js";

const TILE_W = 1.95;
const TILE_H = 1.75;

/**
 * Legible flat day cell on the overview wall (notes stay in CalendarState).
 */
export class OverviewDayTile {
  /**
   * @param {import("./calendarState.js").DayNode} dayData
   * @param {THREE.Group} parentGroup
   * @param {{ notes?: boolean, reminder?: boolean, alarm?: boolean }} badges
   */
  constructor(dayData, parentGroup, badges = {}) {
    this.dayId = dayData.id;
    this.date = dayData.date;
    this.targetPosition = new THREE.Vector3(
      dayData.position.x,
      dayData.position.y,
      dayData.position.z
    );

    const { day } = parseDate(dayData.date);
    this.dayNumber = day;
    this._badges = badges;

    const { texture, aspect } = this._createDayTexture(String(day), badges);
    const geometry = new THREE.PlaneGeometry(TILE_W, TILE_H * aspect);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x000000,
      emissiveIntensity: 0
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData.dayId = dayData.id;
    this.mesh.userData.isOverviewTile = true;

    this._hovered = false;
    this._selected = false;
    this._applyVisualState();

    parentGroup.add(this.mesh);
  }

  _drawNotebookIcon(ctx, x, y) {
    ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2.5;
    roundRect(ctx, x - 14, y - 18, 28, 36, 4);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8 + i * 8);
      ctx.lineTo(x + 8, y - 8 + i * 8);
      ctx.stroke();
    }
  }

  _createDayTexture(text, badges) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");

    const today = isToday(this.date);
    const weekend = isWeekend(this.date);

    let bg = "#1e293b";
    let border = "#334155";
    let numColor = "#f8fafc";

    if (today) {
      bg = "#134e3a";
      border = "#34d399";
      numColor = "#ecfdf5";
    } else if (weekend) {
      bg = "#1e1b4b";
      border = "#6366f1";
      numColor = "#e0e7ff";
    }

    ctx.fillStyle = bg;
    roundRect(ctx, 8, 8, 240, 204, 16);
    ctx.fill();

    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    roundRect(ctx, 8, 8, 240, 204, 16);
    ctx.stroke();

    this._drawNotebookIcon(ctx, 36, 38);

    ctx.fillStyle = numColor;
    ctx.font = "bold 96px system-ui, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 118);

    const dots = [
      { on: badges.notes, color: "#fbbf24", x: 200 },
      { on: badges.reminder, color: "#38bdf8", x: 220 },
      { on: badges.alarm, color: "#f87171", x: 240 }
    ];
    let dx = 200;
    for (const d of dots.filter((o) => o.on)) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(dx, 32, 8, 0, Math.PI * 2);
      ctx.fill();
      dx += 18;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, aspect: canvas.height / canvas.width };
  }

  _applyVisualState() {
    const mat = this.mesh.material;
    if (this._selected) {
      mat.emissive.set(0x6366f1);
      mat.emissiveIntensity = 0.9;
      this.mesh.scale.set(1.1, 1.1, 1.1);
    } else if (this._hovered) {
      if (this._badges.notes) {
        mat.emissive.set(0xfbbf24);
        mat.emissiveIntensity = 0.85;
      } else {
        mat.emissive.set(0x2563eb);
        mat.emissiveIntensity = 0.65;
      }
      this.mesh.scale.set(1.1, 1.1, 1.1);
    } else {
      mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
      this.mesh.scale.set(1, 1, 1);
    }
  }

  setPosition(x, y, z) {
    this.targetPosition.set(x, y, z);
    this.mesh.position.copy(this.targetPosition);
  }

  setAnimatedPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  get meshObject() {
    return this.mesh;
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.mesh.getWorldPosition(target);
  }

  setHovered(value) {
    if (this._hovered === value) return;
    this._hovered = value;
    this._applyVisualState();
  }

  setSelected(value) {
    if (this._selected === value) return;
    this._selected = value;
    this._applyVisualState();
  }

  setOpacity(opacity) {
    const mat = this.mesh.material;
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
  }

  setDimmed(dim) {
    this.mesh.visible = !dim;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

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
