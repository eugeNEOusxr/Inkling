/**
 * Handles month-to-month transitions: fade out, rebuild, slide in.
 */
export class MonthTransitionController {
  constructor(calendarWall) {
    this.calendarWall = calendarWall;
    this._busy = false;
  }

  get isBusy() {
    return this._busy;
  }

  /**
   * @param {import("./calendarState.js").CalendarState} newState
   * @param {(state: import("./calendarState.js").CalendarState) => void} onMidTransition
   * @param {number} [direction]
   * @param {import("./CalendarWall.js").CalendarWall|import("./AppointmentWall.js").AppointmentWall} [wall]
   */
  async transition(newState, onMidTransition, direction = 1, wall = null) {
    if (this._busy) return;
    this._busy = true;

    const calendarWall = wall ?? this.calendarWall;
    const nodes = Array.from(calendarWall.dayMeshes.values());
    const slideOffset = direction * 4;

    await this._animateNodes(nodes, {
      duration: 280,
      opacity: 0,
      offsetX: -slideOffset * 0.3,
      offsetY: -0.5
    });

    calendarWall.clearDayNodes();
    onMidTransition(newState);

    const newNodes = Array.from(calendarWall.dayMeshes.values());
    for (const node of newNodes) {
      const tx = node.targetPosition.x;
      const ty = node.targetPosition.y;
      const tz = node.targetPosition.z;
      node.setAnimatedPosition(tx + slideOffset, ty, tz + 0.5);
      node.setOpacity(0);
    }

    await this._animateNodes(newNodes, {
      duration: 420,
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      useTarget: true
    });

    this._busy = false;
  }

  _monthName(month) {
    const names = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return names[month - 1];
  }

  /**
   * @param {import("./DayNode.js").DayNode[]} nodes
   */
  _animateNodes(nodes, opts) {
    const {
      duration,
      opacity,
      offsetX = 0,
      offsetY = 0,
      offsetZ = 0,
      useTarget = false
    } = opts;

    if (nodes.length === 0) {
      return Promise.resolve();
    }

    const start = performance.now();
    const starts = nodes.map((node) => ({
      node,
      x: node.mesh.position.x,
      y: node.mesh.position.y,
      z: node.mesh.position.z,
      o: node.mesh.material.opacity ?? 1
    }));

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeInOutCubic(t);

        for (const s of starts) {
          const target = s.node.targetPosition;
          const endX = useTarget ? target.x + offsetX : s.x + offsetX;
          const endY = useTarget ? target.y + offsetY : s.y + offsetY;
          const endZ = useTarget ? target.z + offsetZ : s.z + offsetZ;

          const startX = useTarget ? s.x : s.x;
          const startY = useTarget ? s.y : s.y;
          const startZ = useTarget ? s.z : s.z;

          s.node.setAnimatedPosition(
            startX + (endX - startX) * eased,
            startY + (endY - startY) * eased,
            startZ + (endZ - startZ) * eased
          );

          const startO = useTarget ? 0 : s.o;
          const endO = opacity;
          s.node.setOpacity(startO + (endO - startO) * eased);
        }

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          if (useTarget) {
            for (const s of starts) {
              s.node.setAnimatedPosition(
                s.node.targetPosition.x,
                s.node.targetPosition.y,
                s.node.targetPosition.z
              );
              s.node.setOpacity(1);
            }
          }
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
