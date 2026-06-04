import * as THREE from "three";
import { TimelineEntry } from "./TimelineEntry.js";
import { GoldenLine } from "./GoldenLine.js";
import { sortTimelineForDisplay } from "./timelineModel.js";

/**
 * Sort entries by time-of-day bucket, then clock time.
 * @param {Array<Record<string, unknown>>} entries
 */
export function sortTimelineEntries(entries) {
  return sortTimelineForDisplay(
    entries.map((e, i) => ({
      id: String(e.id ?? i),
      time: String(e.time ?? "09:00"),
      label: String(e.label ?? ""),
      text: String(e.text ?? "")
    }))
  );
}

/**
 * Depth Staircase timeline layout with visible golden segments between entries.
 */
export class TimelineLayout {
  /**
   * @param {THREE.Group | THREE.Scene} parent
   * @param {Array<{ time: string, text: string, id?: number | string }>} entries
   */
  constructor(parent, entries) {
    this.parent = parent;
    this.group = new THREE.Group();
    this.group.name = "timeline-layout";
    this.parent.add(this.group);

    /** @type {TimelineEntry[]} */
    this.entries = [];
    /** @type {GoldenLine[]} */
    this.segments = [];

    const sorted = sortTimelineEntries(entries);

    sorted.forEach((entry, index) => {
      this.entries.push(
        new TimelineEntry({
          ...entry,
          index
        })
      );
    });

    this.entries.forEach((entry) => {
      this.group.add(entry.getGroup());
    });

    this._buildGoldenLines();
  }

  _buildGoldenLines() {
    for (let i = 0; i < this.entries.length - 1; i++) {
      const start = this.entries[i].getAtomWorldPoint();
      const end = this.entries[i + 1].getAtomWorldPoint();
      const segment = new GoldenLine(start, end, { radius: 0.015 });
      const mesh = segment.getMesh();
      if (mesh && mesh instanceof THREE.Mesh) {
        this.group.add(mesh);
        this.segments.push(segment);
      }
    }
  }

  /**
   * @param {number} delta seconds since last frame
   */
  update(delta) {
    for (const entry of this.entries) {
      entry.update(delta);
    }
  }

  dispose() {
    for (const entry of this.entries) {
      entry.dispose();
    }
    for (const segment of this.segments) {
      segment.dispose();
    }
    this.parent.remove(this.group);
    this.entries = [];
    this.segments = [];
  }
}
