import * as THREE from "three";
import { isToday, isWeekend, parseDate } from "./calendarState.js";

const TILE_W = 1.95;
const TILE_H = 1.75;

/**
 * Appointments wall tile — blue-gray styling, calendar/clock icon.
 */
export class AppointmentDayTile {
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
    const { texture, aspect } = this._createDayTexture(String(day), badges);
    const geometry = new THREE.PlaneGeometry(TILE_W, TILE_H * aspect);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.5,
      metalness: 0.12,
      emissive: 0x000000,
      emissiveIntensity: 0
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData.dayId = dayData.id;
    this.mesh.userData.isAppointmentTile = true;

    this._hovered = false;
    this._selected = false;
    this._applyVisualState();
    parentGroup.add(this.mesh);
  }

  _drawClockIcon(ctx, x, y) {
    ctx.strokeStyle = "#7dd3fc";
    ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 12);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 9, y + 4);
    ctx.stroke();
  }

  _createDayTexture(text, badges) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");

    const today = isToday(this.date);
    const weekend = isWeekend(this.date);

    let bg = "#1e3a5f";
    let border = "#3b82f6";
    let numColor = "#e0f2fe";

    if (today) {
      bg = "#164e63";
      border = "#22d3ee";
      numColor = "#ecfeff";
    } else if (weekend) {
      bg = "#1e293b";
      border = "#64748b";
      numColor = "#cbd5e1";
    }

    ctx.fillStyle = bg;
    roundRect(ctx, 8, 8, 240, 204, 16);
    ctx.fill();

    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    roundRect(ctx, 8, 8, 240, 204, 16);
    ctx.stroke();

    this._drawClockIcon(ctx, 40, 40);

    ctx.fillStyle = numColor;
    ctx.font = "bold 96px system-ui, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 122);

    let dx = 200;
    if (badges.notes) {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(dx, 32, 8, 0, Math.PI * 2);
      ctx.fill();
      dx += 18;
    }
    if (badges.reminder) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(dx, 32, 8, 0, Math.PI * 2);
      ctx.fill();
      dx += 18;
    }
    if (badges.alarm) {
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.arc(dx, 32, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, aspect: canvas.height / canvas.width };
  }

  _applyVisualState() {
    const mat = this.mesh.material;
    if (this._selected) {
      mat.emissive.set(0x0ea5e9);
      mat.emissiveIntensity = 0.95;
      this.mesh.scale.set(1.1, 1.1, 1.1);
    } else if (this._hovered) {
      mat.emissive.set(0x0284c7);
      mat.emissiveIntensity = 0.7;
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
