import * as THREE from "three";
import { hourHasNotesInDay, getDayById } from "./calendarState.js";

const COLS = 6;
const ROWS = 4;
const SLOT_SPACING = 1.15;

/**
 * Zoomed-in 3D hour grid for a single day. Notes read from CalendarState only.
 */
export class DayDetailView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "DayDetailView";
    this.group.visible = false;
    scene.add(this.group);

    this.hourMeshes = new Map();
    this._selectedHour = "0";
    this._hoveredHour = null;
    this._dayId = null;
    this._state = null;

    this._buildBackdrop();
  }

  _buildBackdrop() {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 6.2),
      new THREE.MeshStandardMaterial({
        color: 0x0c1222,
        roughness: 0.85,
        metalness: 0.05,
        emissive: 0x060a14,
        emissiveIntensity: 0.25
      })
    );
    panel.position.set((COLS - 1) * SLOT_SPACING * 0.5, -(ROWS - 1) * SLOT_SPACING * 0.45, -0.25);
    this.group.add(panel);

    const titleCanvas = this._labelTexture("Select a time", 420, 56, 28);
    const titleMat = new THREE.MeshBasicMaterial({
      map: titleCanvas,
      transparent: true,
      depthTest: false
    });
    this.titlePlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.65), titleMat);
    this.titlePlane.position.set(
      (COLS - 1) * SLOT_SPACING * 0.5,
      SLOT_SPACING * 0.55,
      0.05
    );
    this.group.add(this.titlePlane);
  }

  _labelTexture(text, w, h, fontSize) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * @param {string} dayId
   * @param {import("./calendarState.js").CalendarState} state
   * @param {THREE.Vector3} worldAnchor
   * @param {string} dayLabel
   */
  show(dayId, state, worldAnchor, dayLabel) {
    this._dayId = dayId;
    this._state = state;
    this.group.visible = true;
    this.group.position.copy(worldAnchor);
    this.group.position.z += 0.5;

    this._updateTitleTexture(dayLabel);
    this._rebuildHourSlots();
    this.setSelectedHour(this._selectedHour);
  }

  hide() {
    this.group.visible = false;
    this._clearHourSlots();
    this._dayId = null;
  }

  /** World-space center of the hour grid for camera framing. */
  getAttentionWorldCenter() {
    const local = new THREE.Vector3(
      ((COLS - 1) * SLOT_SPACING) * 0.5,
      -((ROWS - 1) * SLOT_SPACING) * 0.5,
      0.15
    );
    return this.group.localToWorld(local);
  }

  _updateTitleTexture(label) {
    const old = this.titlePlane.material.map;
    old?.dispose();
    this.titlePlane.material.map = this._labelTexture(label, 480, 64, 30);
    this.titlePlane.material.needsUpdate = true;
  }

  _rebuildHourSlots() {
    this._clearHourSlots();
    for (let h = 0; h < 24; h++) {
      const col = h % COLS;
      const row = Math.floor(h / COLS);
      const x = col * SLOT_SPACING;
      const y = -row * SLOT_SPACING;

      const day =
        this._state && this._dayId ? getDayById(this._state, this._dayId) : null;
      const hasNote = day ? hourHasNotesInDay(day, h) : false;

      const mesh = this._createHourMesh(h, hasNote);
      mesh.position.set(x, y, 0);
      mesh.userData.hour = String(h);
      this.group.add(mesh);
      this.hourMeshes.set(String(h), mesh);
    }
  }

  _createHourMesh(hour, hasNote) {
    const label = `${String(hour).padStart(2, "0")}:00`;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1e293b";
    roundRect(ctx, 4, 4, 152, 92, 10);
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    roundRect(ctx, 4, 4, 152, 92, 10);
    ctx.stroke();
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 80, 50);
    if (hasNote) {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(140, 18, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), mat);
    mesh.userData.isHourSlot = true;
    return mesh;
  }

  setSelectedHour(hour) {
    this._selectedHour = hour;
    this._applyHourVisuals(this._hoveredHour);
  }

  setHoveredHour(hour) {
    this._hoveredHour = hour;
    this._applyHourVisuals(hour);
  }

  _applyHourVisuals(hoveredHour) {
    this.hourMeshes.forEach((mesh, h) => {
      const selected = h === this._selectedHour;
      const hovered = hoveredHour != null && h === hoveredHour && !selected;
      const mat = mesh.material;
      if (selected) {
        mat.emissive.set(0x1d4ed8);
        mat.emissiveIntensity = 0.7;
        mesh.scale.set(1.08, 1.08, 1);
      } else if (hovered) {
        mat.emissive.set(0xfbbf24);
        mat.emissiveIntensity = 0.55;
        mesh.scale.set(1.05, 1.05, 1);
      } else {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
        mesh.scale.set(1, 1, 1);
      }
    });
  }

  /** Brief glow when navigating from a notification. */
  pulseHour(hour) {
    const mesh = this.hourMeshes.get(String(hour));
    if (!mesh) return;
    const mat = mesh.material;
    const base = 0.7;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      mat.emissiveIntensity = base + (step % 2 === 0 ? 0.35 : 0);
      if (step >= 6) {
        clearInterval(id);
        mat.emissiveIntensity = base;
      }
    }, 180);
  }

  refreshHourIndicators() {
    if (!this._dayId || !this._state) return;
    this._rebuildHourSlots();
    this.setSelectedHour(this._selectedHour);
  }

  getHourMeshes() {
    return Array.from(this.hourMeshes.values());
  }

  getHourFromObject(object) {
    let cur = object;
    while (cur) {
      if (cur.userData?.hour != null) return String(cur.userData.hour);
      cur = cur.parent;
    }
    return null;
  }

  _clearHourSlots() {
    this.hourMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      this.group.remove(mesh);
    });
    this.hourMeshes.clear();
  }

  dispose() {
    this.hide();
    this.scene.remove(this.group);
    this.titlePlane.geometry.dispose();
    this.titlePlane.material.map?.dispose();
    this.titlePlane.material.dispose();
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
