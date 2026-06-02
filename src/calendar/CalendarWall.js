import * as THREE from "three";
import {
  getMonthLabel,
  getDayActivityBadges,
  SPACING_X,
  SPACING_Y
} from "./calendarState.js";
import { OverviewDayTile } from "./OverviewDayTile.js";
import {
  hideDayHoverPreview,
  positionDayHoverPreview,
  updateDayHoverPreview
} from "./dayHoverPreview.js";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Notebook Calendar — 3D month grid (notes). Future: conclaved curved “TV” of timed text in 3D lettering.
 */
export class CalendarWall {
  constructor(scene) {
    // Phase visual remodel hooks.
    // Rollback: remove gold/aqua material values and body class toggles.
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.name = "NotebookCalendar";

    this.overviewWallGroup = new THREE.Group();
    this.overviewWallGroup.name = "OverviewWall";

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshStandardMaterial({
        color: 0x111217,
        roughness: 0.2,
        metalness: 0.82,
        emissive: 0x0b0c0f,
        emissiveIntensity: 0.25
      })
    );
    this.backdrop.position.set(SPACING_X * 3, -SPACING_Y * 2.2, -0.5);
    this.overviewWallGroup.add(this.backdrop);

    this.dayNodesGroup = new THREE.Group();
    this.dayNodesGroup.name = "DayNodes";

    this.monthTitleGroup = new THREE.Group();
    this.monthTitleGroup.name = "MonthTitle";

    this.weekRowsGroup = new THREE.Group();
    this.weekRowsGroup.name = "WeekRows";

    this.headerGroup = new THREE.Group();
    this.headerGroup.name = "WeekdayHeader";

    this.overviewWallGroup.add(this.weekRowsGroup);
    this.overviewWallGroup.add(this.headerGroup);
    this.overviewWallGroup.add(this.dayNodesGroup);
    this.overviewWallGroup.add(this.monthTitleGroup);
    this.group.add(this.overviewWallGroup);

    scene.add(this.group);

    this.dayMeshes = new Map();
    this._monthTitleSprite = null;
    this._gridWidth = SPACING_X * 6;
    this._gridRows = 5;
    this._dimmed = false;
    this._lastNoteCount = 0;
    this._calendarState = null;
  }

  /**
   * @param {import("./calendarState.js").CalendarState} calendarState
   * @param {{ skipLayout?: boolean }} [options]
   */
  buildFromState(calendarState, options = {}) {
    this._calendarState = calendarState;
    const previousCount = this._lastNoteCount;
    let nextCount = 0;
    for (const d of calendarState.days) {
      for (const t of d.threads) nextCount += t.notes.length;
    }

    this.clearDayNodes();

    if (calendarState.days.length > 0) {
      const ys = calendarState.days.map((d) => d.position.y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      this._gridRows = Math.round((minY - maxY) / SPACING_Y) + 1;
    } else {
      this._gridRows = 5;
    }

    this._buildWeekRows(this._gridRows);
    this._buildWeekdayHeader();

    for (const dayData of calendarState.days) {
      const tile = new OverviewDayTile(
        dayData,
        this.dayNodesGroup,
        getDayActivityBadges(dayData)
      );
      tile.setPosition(dayData.position.x, dayData.position.y, dayData.position.z);
      this.dayMeshes.set(dayData.id, tile);
    }

    this._updateMonthTitle(`${getMonthLabel(calendarState)} · Notebook Calendar`);

    if (!options.skipLayout) {
      this._centerWall(calendarState);
    }

    this.setOverviewDimmed(this._dimmed);
    this._lastNoteCount = nextCount;
    if (nextCount > previousCount) {
      // Dispatch effect trigger only when note count increases.
      window.dispatchEvent(new CustomEvent("eugeneous:note-added", {
        detail: { x: window.innerWidth * 0.44, y: window.innerHeight * 0.58 }
      }));
    }
  }

  setOverviewDimmed(dim) {
    this._dimmed = dim;
    const opacity = dim ? 0.15 : 1;
    this.overviewWallGroup.children.forEach((child) => {
      if (child === this.dayNodesGroup) return;
    });
    this.dayMeshes.forEach((tile) => {
      if (dim) tile.setOpacity(0.55);
      else tile.setOpacity(1);
    });
    this.backdrop.material.opacity = dim ? 0.65 : 1;
    this.backdrop.material.transparent = dim;
    if (this._monthTitleSprite) {
      this._monthTitleSprite.material.opacity = dim ? 0.25 : 1;
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
    if (visible) {
      document.body.classList.add("wall--notebook");
      document.body.classList.remove("wall--appointments");
    }
  }

  setGroupOpacity(opacity) {
    this.dayMeshes.forEach((t) => t.setOpacity(opacity));
    this.backdrop.material.transparent = opacity < 1;
    this.backdrop.material.opacity = opacity * 0.95;
    if (this._monthTitleSprite) {
      this._monthTitleSprite.material.opacity = opacity;
      this._monthTitleSprite.material.transparent = true;
    }
  }

  _centerWall(calendarState) {
    if (calendarState.days.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const d of calendarState.days) {
      minX = Math.min(minX, d.position.x);
      maxX = Math.max(maxX, d.position.x);
      minY = Math.min(minY, d.position.y);
      maxY = Math.max(maxY, d.position.y);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.group.position.set(-cx, -cy + 1.2, 0);
    this._gridWidth = maxX - minX;

    const gridHeight = maxY - minY + SPACING_Y;
    this.backdrop.position.set(cx, cy - gridHeight * 0.12, -0.5);
    this.backdrop.scale.set(
      (this._gridWidth + SPACING_X * 1.6) / 18,
      (gridHeight + SPACING_Y * 2.2) / 13,
      1
    );
  }

  _buildWeekRows(rowCount) {
    this._clearGroup(this.weekRowsGroup);
    const width = SPACING_X * 6 + 1.2;
    for (let r = 0; r < rowCount; r++) {
      const y = -r * SPACING_Y;
      const geometry = new THREE.PlaneGeometry(width, 0.03);
      const material = new THREE.MeshBasicMaterial({
        color: 0xd4af37,
        transparent: true,
        opacity: 0.2
      });
      const line = new THREE.Mesh(geometry, material);
      line.position.set(SPACING_X * 3, y - 0.2, -0.12);
      this.weekRowsGroup.add(line);
    }
  }

  _buildWeekdayHeader() {
    this._clearGroup(this.headerGroup);
    for (let c = 0; c < 7; c++) {
      const sprite = this._textSprite(WEEKDAY_LABELS[c], 1.1);
      sprite.position.set(c * SPACING_X, SPACING_Y * 0.55, 0.02);
      this.headerGroup.add(sprite);
    }
  }

  _textSprite(text, scale = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 128, 48);
    ctx.fillStyle = "#f7e7b8";
    ctx.font = "600 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 26);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.1 * scale, 0.42 * scale, 1);
    return sprite;
  }

  _updateMonthTitle(label) {
    if (this._monthTitleSprite) {
      this.monthTitleGroup.remove(this._monthTitleSprite);
      this._monthTitleSprite.material.map?.dispose();
      this._monthTitleSprite.material.dispose();
    }

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 640, 100);
    ctx.fillStyle = "#f7e7b8";
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 320, 54);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    this._monthTitleSprite = new THREE.Sprite(material);
    this._monthTitleSprite.scale.set(5.2, 0.9, 1);
    this._monthTitleSprite.position.set(SPACING_X * 3, SPACING_Y * 1.2, 0.15);
    this.monthTitleGroup.add(this._monthTitleSprite);
  }

  updateMonthTitle(label) {
    this._updateMonthTitle(label);
  }

  getDayMeshes() {
    return Array.from(this.dayMeshes.values()).map((n) => n.meshObject);
  }

  getDayTileById(id) {
    return this.dayMeshes.get(id) ?? null;
  }

  getDayIdFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.dayId) return current.userData.dayId;
      current = current.parent;
    }
    return null;
  }

  setSelectedDay(dayId) {
    this.dayMeshes.forEach((node, id) => {
      node.setSelected(id === dayId);
    });
  }

  setHoveredDay(dayId) {
    this.dayMeshes.forEach((node, id) => {
      node.setHovered(id === dayId);
    });
    this._updateHoverPreview(dayId);
  }

  positionHoverPreview(clientX, clientY) {
    positionDayHoverPreview(document.getElementById("day-hover-preview"), clientX, clientY);
  }

  _updateHoverPreview(dayId) {
    const el = document.getElementById("day-hover-preview");
    if (!dayId || !this._calendarState) {
      hideDayHoverPreview(el);
      return;
    }
    updateDayHoverPreview(el, this._calendarState, dayId, "notebook");
  }

  clearDayNodes() {
    this.dayMeshes.forEach((node) => node.dispose());
    this.dayMeshes.clear();
    this._clearGroup(this.dayNodesGroup);
  }

  _clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.map?.dispose();
            m.dispose();
          });
        } else {
          child.material.map?.dispose();
          child.material.dispose();
        }
      }
    }
  }

  getCenterTarget() {
    const target = new THREE.Vector3();
    this.group.getWorldPosition(target);
    return target;
  }

  getGridBounds() {
    return {
      width: this._gridWidth + SPACING_X * 1.5,
      height: this._gridRows * SPACING_Y + SPACING_Y
    };
  }
}
