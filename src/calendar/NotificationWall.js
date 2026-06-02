import * as THREE from "three";
import { SPACING_X, SPACING_Y, parseDate } from "./calendarState.js";
import {
  buildNotificationWallItems,
  formatNotificationTime,
  getTypeIcon,
  getLevelClass,
  formatLevelLabel
} from "./notifications/notificationFeed.js";
import { renderNotificationMonthGrid } from "./ui/notificationGridRender.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "reminder", label: "Reminders" },
  { id: "alarm", label: "Alarms" },
  { id: "appointment", label: "Appointments" }
];

/**
 * Dark 3D notification timeline wall + scrollable HTML history list.
 */
export class NotificationWall {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "NotificationWall";
    this.group.visible = false;

    this.overviewWallGroup = new THREE.Group();
    this.overviewWallGroup.name = "NotificationOverviewWall";

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshStandardMaterial({
        color: 0x04060c,
        roughness: 0.98,
        metalness: 0.01,
        emissive: 0x010204,
        emissiveIntensity: 0.4
      })
    );
    backdrop.position.set(SPACING_X * 3, -SPACING_Y * 2.2, -0.5);
    this.overviewWallGroup.add(backdrop);

    this.timelineGroup = new THREE.Group();
    this.timelineGroup.name = "NotificationTimeline";
    this.overviewWallGroup.add(this.timelineGroup);

    this.group.add(this.overviewWallGroup);
    scene.add(this.group);

    this.panelEl = document.getElementById("notification-wall-panel");
    this.listEl = document.getElementById("notification-wall-list");
    this.titleEl = document.getElementById("notification-wall-title");

    if (this.panelEl && this.panelEl.parentElement !== document.body) {
      document.body.appendChild(this.panelEl);
    }

    this.onItemClick = () => {};
    this.onBack = () => {};
    this.onMinimize = () => {};

    this._allGroups = [];
    this._activeFilter = "all";
    this._searchQuery = "";
    this._chromeReady = false;
    /** @type {'list'|'grid'|'3d'} */
    this._panelView = "list";
    this._stateYear = new Date().getFullYear();
    this._stateMonth = new Date().getMonth() + 1;
    this.gridMount = null;

    this._onScroll = () => this._updateScrollShadows();

    document.getElementById("btn-notification-wall-back")?.addEventListener("click", () => {

      this.onBack();
    });
  }

  getCenterTarget() {
    return new THREE.Vector3(SPACING_X * 3, -SPACING_Y * 2.2, 0);
  }

  getGridBounds() {
    return { width: SPACING_X * 6, height: SPACING_Y * 5 };
  }

  setVisible(visible) {
    this.group.visible = visible;
    if (this.panelEl) {
      if (visible && this.panelEl.parentElement !== document.body) {
        document.body.appendChild(this.panelEl);
      }
      this.panelEl.classList.toggle("hidden", !visible);
      this.panelEl.setAttribute("aria-hidden", String(!visible));
      this.panelEl.style.pointerEvents = visible ? "auto" : "none";
    }
    document.body.classList.toggle("notification-wall-open", visible);
    if (!visible) {
      document.body.classList.remove("notification-wall-3d-focus");
      this.panelEl?.classList.remove("notification-wall-panel--3d-focus");
    }

    if (visible) {
      requestAnimationFrame(() => this._updateScrollShadows());
    }
  }

  /**
   * @param {import("./calendarState.js").CalendarState} state
   */
  buildFromState(state) {
    this._ensureUiChrome();
    this._stateYear = state.year;
    this._stateMonth = state.month;
    this._allGroups = buildNotificationWallItems(state);
    this._applyPanelView();
  }

  _ensureUiChrome() {
    if (this._chromeReady || !this.panelEl || !this.listEl) return;

    const inner = this.panelEl.querySelector(".notification-wall-inner");
    if (!inner) return;

    this.controlsEl = document.createElement("div");
    this.controlsEl.className = "notification-wall-controls";

    this.viewModeEl = document.createElement("div");
    this.viewModeEl.className = "notification-wall-view-modes";
    this.viewModeEl.setAttribute("role", "tablist");
    this.viewModeEl.setAttribute("aria-label", "Notification wall view");
    for (const { id, label } of [
      { id: "list", label: "2D timeline" },
      { id: "grid", label: "2D grid" },
      { id: "3d", label: "3D spine" }
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notification-wall-view-btn";
      btn.dataset.view = id;
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", id === "list" ? "true" : "false");
      if (id === "list") btn.classList.add("is-active");
      btn.addEventListener("click", () => this._setPanelView(id));
      this.viewModeEl.appendChild(btn);
    }

    this.gridMount = document.createElement("div");
    this.gridMount.className = "notification-wall-grid-mount hidden";
    this.gridMount.setAttribute("aria-hidden", "true");

    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.className = "notification-wall-search";
    this.searchInput.placeholder = "Search text, type, or date…";
    this.searchInput.setAttribute("aria-label", "Search notifications");
    this.searchInput.addEventListener("input", () => {
      this._searchQuery = this.searchInput.value;
      this._applyFiltersAndRender();
    });

    this.filtersEl = document.createElement("div");
    this.filtersEl.className = "notification-wall-filters";
    this.filtersEl.setAttribute("role", "tablist");
    this.filtersEl.setAttribute("aria-label", "Filter notifications");

    for (const opt of FILTER_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notification-wall-filter-btn";
      btn.dataset.filter = opt.id;
      btn.textContent = opt.label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", opt.id === "all" ? "true" : "false");
      if (opt.id === "all") btn.classList.add("is-active");
      btn.addEventListener("click", () => this._setFilter(opt.id));
      this.filtersEl.appendChild(btn);
    }

    this.emptyFilterEl = document.createElement("p");
    this.emptyFilterEl.className = "notification-wall-empty-filter hidden";
    this.emptyFilterEl.textContent = "No notifications match your filters.";

    this.controlsEl.appendChild(this.viewModeEl);
    this.controlsEl.appendChild(this.searchInput);
    this.controlsEl.appendChild(this.filtersEl);

    this.scrollViewport = document.createElement("div");
    this.scrollViewport.className = "notification-wall-scroll-viewport";

    this.scrollTopShadow = document.createElement("div");
    this.scrollTopShadow.className = "notification-wall-scroll-shadow notification-wall-scroll-shadow--top";
    this.scrollTopShadow.setAttribute("aria-hidden", "true");

    this.scrollBottomShadow = document.createElement("div");
    this.scrollBottomShadow.className = "notification-wall-scroll-shadow notification-wall-scroll-shadow--bottom";
    this.scrollBottomShadow.setAttribute("aria-hidden", "true");

    const headerRow = inner.querySelector(".notification-wall-header");
    if (headerRow && !headerRow.querySelector(".notification-wall-minimize-btn")) {
      const minimizeBtn = document.createElement("button");
      minimizeBtn.type = "button";
      minimizeBtn.className = "notification-wall-minimize-btn";
      minimizeBtn.setAttribute("aria-label", "Minimize notification wall");
      minimizeBtn.title = "Minimize";
      minimizeBtn.textContent = "–";
      minimizeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onMinimize();
      });
      headerRow.appendChild(minimizeBtn);
    }

    inner.insertBefore(this.controlsEl, this.listEl);
    inner.insertBefore(this.emptyFilterEl, this.listEl);

    const listParent = this.listEl.parentNode;
    listParent.insertBefore(this.gridMount, this.listEl);
    listParent.insertBefore(this.scrollViewport, this.listEl);
    this.scrollViewport.appendChild(this.scrollTopShadow);
    this.scrollViewport.appendChild(this.listEl);
    this.scrollViewport.appendChild(this.scrollBottomShadow);

    this.listEl.classList.add("notification-wall-scroll-content");
    this.listEl.addEventListener("scroll", this._onScroll, { passive: true });

    this._chromeReady = true;
  }

  _setFilter(filterId) {
    this._activeFilter = filterId;
    this.filtersEl?.querySelectorAll(".notification-wall-filter-btn").forEach((btn) => {
      const active = btn.dataset.filter === filterId;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    this._applyFiltersAndRender();
  }

  _setPanelView(view) {
    if (view !== "list" && view !== "grid" && view !== "3d") return;
    this._panelView = view;
    this.viewModeEl?.querySelectorAll(".notification-wall-view-btn").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    this._applyPanelView();
  }

  _applyPanelView() {
    const filtered = this._getFilteredGroups();
    this._buildTimelineMarkers(filtered);

    const showList = this._panelView === "list";
    const showGrid = this._panelView === "grid";
    const show3dOnly = this._panelView === "3d";

    this.listEl?.classList.toggle("hidden", !showList);
    this.scrollViewport?.classList.toggle("hidden", showGrid || show3dOnly);
    this.gridMount?.classList.toggle("hidden", !showGrid);
    this.gridMount?.setAttribute("aria-hidden", String(!showGrid));
    if (this.panelEl) {
      this.panelEl.classList.toggle("notification-wall-panel--3d-focus", show3dOnly);
      document.body.classList.toggle("notification-wall-3d-focus", show3dOnly);
    }
    this.group.visible = true;
    this.timelineGroup.visible = true;

    if (showGrid && this.gridMount) {
      this.gridMount.innerHTML = renderNotificationMonthGrid(
        filtered,
        this._stateYear,
        this._stateMonth
      );
      this.gridMount.querySelectorAll(".notification-wall-grid__cell:not([disabled])").forEach((cell) => {
        cell.addEventListener("click", () => {
          const date = cell.getAttribute("data-date");
          const group = filtered.find((g) => g.date === date);
          const first = group?.items?.[0];
          if (first) {
            this.onItemClick({
              dayId: first.dayId,
              hour: first.hour,
              wall: first.wall,
              type: first.type
            });
          }
        });
      });
    }

    if (showList) {
      this._renderList(filtered);
    }
  }

  _applyFiltersAndRender() {
    this._applyPanelView();
  }

  _getFilteredGroups() {
    const query = this._searchQuery.trim().toLowerCase();

    return this._allGroups
      .map((group) => ({
        date: group.date,
        items: group.items.filter((item) => {
          if (this._activeFilter !== "all" && item.type !== this._activeFilter) {
            return false;
          }
          return matchesSearch(item, query, group.date);
        })
      }))
      .filter((group) => group.items.length > 0);
  }

  _buildTimelineMarkers(groups) {
    while (this.timelineGroup.children.length) {
      const child = this.timelineGroup.children[0];
      this.timelineGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }

    if (groups.length === 0) return;

    const maxRows = Math.min(groups.length, 10);
    const startY = 1.35;
    const rowStep = 1.28;
    const lineX = -4.5;

    const spineHeight = (maxRows - 1) * rowStep + 0.6;
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, spineHeight, 0.03),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x312e81,
        emissiveIntensity: 0.25
      })
    );
    spine.position.set(lineX, startY - spineHeight * 0.5 + 0.2, 0.05);
    this.timelineGroup.add(spine);

    for (let i = 0; i < maxRows; i++) {
      const g = groups[i];
      const y = startY - i * rowStep;
      const typeColor = getTypeColor(g.items[0]?.type);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 14),
        new THREE.MeshStandardMaterial({
          color: typeColor,
          emissive: typeColor,
          emissiveIntensity: 0.55
        })
      );
      dot.position.set(lineX, y, 0.22);
      this.timelineGroup.add(dot);

      const dateLabel = this._textSprite(this._formatDateHeading(g.date), 0.52, "#c7d2fe");
      dateLabel.position.set(-2.6, y + 0.18, 0.15);
      this.timelineGroup.add(dateLabel);

      if (g.items[0]) {
        const timeLabel = this._textSprite(formatTimeLabel(g.items[0].triggerAt), 0.38, "#94a3b8");
        timeLabel.position.set(-2.6, y - 0.22, 0.12);
        this.timelineGroup.add(timeLabel);
      }
    }
  }

  _renderList(groups) {
    if (!this.listEl) return;

    const hasFilters = this._activeFilter !== "all" || this._searchQuery.trim().length > 0;
    const isEmpty = groups.length === 0;

    this.emptyFilterEl?.classList.toggle("hidden", !isEmpty || !hasFilters);
    this.listEl.classList.toggle("is-empty", isEmpty && !hasFilters);

    this.listEl.innerHTML = "";

    if (isEmpty && !hasFilters) {
      this.listEl.innerHTML = `<p class="empty-hint notification-wall-hint-empty">No notifications yet.</p>`;
      this._updateScrollShadows();
      return;
    }

    if (isEmpty) {
      this._updateScrollShadows();
      return;
    }

    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "notification-wall-day notification-wall-day--fade-in";

      const heading = document.createElement("h3");
      heading.className = "notification-wall-day-title notebook-reader__date";
      heading.innerHTML = `
        <span class="notification-wall-day-title-text">${escapeHtml(this._formatDateHeading(group.date))}</span>
        <span class="notification-wall-day-count">${group.items.length}</span>
      `;
      section.appendChild(heading);

      const timeline = document.createElement("div");
      timeline.className = "notification-wall-timeline";

      const line = document.createElement("div");
      line.className = "notification-wall-timeline-line";
      line.setAttribute("aria-hidden", "true");
      timeline.appendChild(line);

      const entries = document.createElement("div");
      entries.className = "notification-wall-timeline-entries";

      for (const item of group.items) {
        entries.appendChild(this._createTimelineEntry(item));
      }

      timeline.appendChild(entries);
      section.appendChild(timeline);
      this.listEl.appendChild(section);
    }

    requestAnimationFrame(() => this._updateScrollShadows());
  }

  /**
   * @param {object} item
   */
  _createTimelineEntry(item) {
    const entry = document.createElement("article");
    entry.className = `notification-wall-entry notification-wall-entry--fade-in ${getLevelClass(item.level)}`;

    const rail = document.createElement("div");
    rail.className = "notification-wall-time-rail";
    rail.innerHTML = `
      <span class="notification-wall-timeline-dot notification-wall-timeline-dot--${item.type}" aria-hidden="true"></span>
      <time class="notification-wall-time-label" datetime="${new Date(item.triggerAt).toISOString()}">${formatTimeLabel(item.triggerAt)}</time>
    `;

    const row = document.createElement("button");
    row.type = "button";
    row.className = `notification-wall-item reader-entry-card notification-wall-item--${item.type} ${getLevelClass(item.level)}`;
    const status = item.status === "past" || item.firedAt ? "Past" : "Upcoming";
    const levelChip = item.level
      ? `<span class="notification-wall-level ${getLevelClass(item.level)}">${escapeHtml(formatLevelLabel(item.level))}</span>`
      : "";
    row.innerHTML = `
      <span class="notification-wall-item-icon">${getTypeIcon(item.type)}</span>
      <span class="notification-wall-item-body">
        <span class="notification-wall-item-meta">
          <span>${formatNotificationTime(item.triggerAt)}</span>
          <span class="notification-wall-item-type">${formatType(item.type)}</span>
          ${levelChip}
          <span class="notification-wall-item-status">${status}</span>
        </span>
        <span class="notification-wall-item-msg notebook-reader__row-msg">${escapeHtml(item.message || item.title || "")}</span>
      </span>
    `;
    row.addEventListener("click", () => {
      this.onItemClick({
        dayId: item.dayId,
        hour: item.hour,
        wall: item.wall,
        type: item.type
      });
    });

    entry.appendChild(rail);
    entry.appendChild(row);
    return entry;
  }

  _updateScrollShadows() {
    if (!this.listEl || !this.scrollViewport) return;
    const { scrollTop, scrollHeight, clientHeight } = this.listEl;
    const canScroll = scrollHeight > clientHeight + 2;
    const atTop = scrollTop <= 4;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 4;

    this.scrollViewport.classList.toggle("can-scroll", canScroll);
    this.scrollViewport.classList.toggle("at-top", atTop || !canScroll);
    this.scrollViewport.classList.toggle("at-bottom", atBottom || !canScroll);
  }

  _formatDateHeading(dateStr) {
    const { year, month, day } = parseDate(dateStr);
    return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  }

  _textSprite(text, scale, color = "#94a3b8") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 8, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(4.2 * scale, 0.5 * scale), mat);
  }
}

/**
 * @param {object} item
 * @param {string} query
 * @param {string} groupDate
 */
function matchesSearch(item, query, groupDate) {
  if (!query) return true;

  const { year, month, day } = parseDate(groupDate);
  const typeLabel = formatType(item.type).toLowerCase();
  const blob = [
    item.message,
    item.title,
    item.type,
    typeLabel,
    groupDate,
    `${MONTH_NAMES[month - 1]} ${day}`,
    `${MONTH_NAMES_SHORT[month - 1]} ${day}`,
    `${MONTH_NAMES_SHORT[month - 1]} ${day} ${year}`,
    `${day}/${month}/${year}`,
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    formatNotificationTime(item.triggerAt),
    formatTimeLabel(item.triggerAt)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return blob.includes(query);
}

function formatTimeLabel(triggerAt) {
  return new Date(triggerAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getTypeColor(type) {
  const colors = {
    reminder: 0x38bdf8,
    alarm: 0xf87171,
    appointment: 0xfbbf24,
    note: 0xa78bfa
  };
  return colors[type] ?? 0x6366f1;
}

function formatType(type) {
  const m = {
    reminder: "Reminder",
    alarm: "Alarm",
    appointment: "Appointment",
    note: "Note"
  };
  return m[type] ?? "Event";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
