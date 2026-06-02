import * as THREE from "three";
import { isToday, isWeekend, parseDate } from "./calendarState.js";

const BASE_RADIUS = 0.42;
const BASE_SCALE = 1;
const HOVER_SCALE = 1.1;
const SELECTED_SCALE = 1.15;

/**
 * Visual representation of a calendar day. Notes are NOT stored on this object.
 */
export class DayNode {
  /**
   * @param {import("./calendarState.js").DayNode} dayData
   * @param {THREE.Group} parentGroup
   */
  constructor(dayData, parentGroup) {
    this.dayId = dayData.id;
    this.date = dayData.date;
    this.targetPosition = new THREE.Vector3(
      dayData.position.x,
      dayData.position.y,
      dayData.position.z
    );

    const { day } = parseDate(dayData.date);
    this.dayLabel = day;

    this.mesh = this._createMesh();
    this.mesh.userData.dayId = dayData.id;
    this.mesh.userData.isDayNode = true;

    this.labelSprite = this._createLabelSprite(String(day));
    this.labelSprite.position.set(0, 0.55, 0);
    this.mesh.add(this.labelSprite);

    this.outlineMesh = this._createOutline();
    this.outlineMesh.visible = false;
    this.mesh.add(this.outlineMesh);

    this._hovered = false;
    this._selected = false;
    this._baseColor = new THREE.Color();
    this._applyVisualState();

    parentGroup.add(this.mesh);
  }

  _createMesh() {
    const geometry = new THREE.SphereGeometry(BASE_RADIUS, 28, 28);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4f8cff,
      emissive: 0x000000,
      roughness: 0.35,
      metalness: 0.2
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _createOutline() {
    const geometry = new THREE.SphereGeometry(BASE_RADIUS * 1.12, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.55,
      wireframe: true
    });
    return new THREE.Mesh(geometry, material);
  }

  _createLabelSprite(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.55, 0.55, 1);
    return sprite;
  }

  _applyVisualState() {
    const mat = this.mesh.material;
    const today = isToday(this.date);
    const weekend = isWeekend(this.date);

    if (this._selected) {
      this._baseColor.set(0xfbbf24);
      mat.emissive.set(0x332200);
      this.outlineMesh.visible = true;
    } else if (today) {
      this._baseColor.set(0x34d399);
      mat.emissive.set(0x0a2018);
      this.outlineMesh.visible = false;
    } else if (weekend) {
      this._baseColor.set(0x818cf8);
      mat.emissive.set(0x0a0a22);
      this.outlineMesh.visible = false;
    } else {
      this._baseColor.set(0x4f8cff);
      mat.emissive.set(0x000000);
      this.outlineMesh.visible = false;
    }

    if (this._hovered && !this._selected) {
      mat.emissive.lerp(new THREE.Color(0x1a2a44), 0.6);
    }

    mat.color.copy(this._baseColor);
    this._updateScale();
  }

  _updateScale() {
    let s = BASE_SCALE;
    if (this._selected) s = SELECTED_SCALE;
    else if (this._hovered) s = HOVER_SCALE;
    this.mesh.scale.setScalar(s);
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
    if (this.labelSprite.material) {
      this.labelSprite.material.opacity = opacity;
      this.labelSprite.material.transparent = true;
    }
    if (this.outlineMesh.material) {
      this.outlineMesh.material.opacity = opacity * 0.55;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.outlineMesh.geometry.dispose();
    this.outlineMesh.material.dispose();
    this.labelSprite.material.map?.dispose();
    this.labelSprite.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
