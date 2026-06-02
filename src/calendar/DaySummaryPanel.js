/**
 * Day Summary Hover Panel - Shows quick overview of appointments and notes for a day
 * Displays in 2D UI overlay with highlighting and quick access
 */
export class DaySummaryPanel {
  constructor() {
    this.el = document.createElement("div");
    this.el.id = "day-summary-panel";
    this.el.className = "day-summary-panel hidden";
    
    this.dayDateEl = document.createElement("div");
    this.dayDateEl.className = "summary-date";
    
    this.appointmentsEl = document.createElement("div");
    this.appointmentsEl.className = "summary-appointments";
    
    this.notesEl = document.createElement("div");
    this.notesEl.className = "summary-notes";
    
    this.el.appendChild(this.dayDateEl);
    this.el.appendChild(this.appointmentsEl);
    this.el.appendChild(this.notesEl);
    
    document.body.appendChild(this.el);
    this.currentDayId = null;
    this.autoHideTimeout = null;
  }

  /**
   * Show the summary for a given day
   */
  show(dayId, dayData, event) {
    this.currentDayId = dayId;
    
    // Set date
    if (dayData.date) {
      const date = new Date(dayData.date);
      this.dayDateEl.textContent = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
    }

    // Render appointments
    this.appointmentsEl.innerHTML = "";
    if (dayData.appointments && dayData.appointments.length > 0) {
      const title = document.createElement("h3");
      title.textContent = "Appointments";
      title.className = "summary-section-title";
      this.appointmentsEl.appendChild(title);

      dayData.appointments.forEach(apt => {
        const item = document.createElement("div");
        item.className = "summary-item appointment-item";
        item.innerHTML = `
          <div class="summary-time">${String(apt.hour).padStart(2, "0")}:00</div>
          <div class="summary-text">${apt.title}</div>
        `;
        if (apt.description) {
          const desc = document.createElement("div");
          desc.className = "summary-description";
          desc.textContent = apt.description;
          item.appendChild(desc);
        }
        item.addEventListener("click", () => {
          this.onItemClick?.(dayId, apt.id, "appointment");
        });
        this.appointmentsEl.appendChild(item);
      });
    }

    // Render notes
    this.notesEl.innerHTML = "";
    if (dayData.threads && dayData.threads.length > 0) {
      const title = document.createElement("h3");
      title.textContent = "Notes";
      title.className = "summary-section-title";
      this.notesEl.appendChild(title);

      dayData.threads.slice(0, 5).forEach(thread => {
        const item = document.createElement("div");
        item.className = "summary-item note-item";
        item.innerHTML = `<div class="summary-text">${thread.title}</div>`;
        item.addEventListener("click", () => {
          this.onItemClick?.(dayId, thread.id, "thread");
        });
        this.notesEl.appendChild(item);
      });

      if (dayData.threads.length > 5) {
        const more = document.createElement("div");
        more.className = "summary-more";
        more.textContent = `+${dayData.threads.length - 5} more notes`;
        this.notesEl.appendChild(more);
      }
    }

    // Position panel near cursor
    this.el.classList.remove("hidden");
    this._positionNear(event);

    // Auto-hide on mouse leave
    clearTimeout(this.autoHideTimeout);
  }

  /**
   * Position the panel near the event target
   */
  _positionNear(event) {
    const rect = event.currentTarget?.getBoundingClientRect?.() || {
      x: event.clientX,
      y: event.clientY,
      width: 0,
      height: 0
    };

    const panelWidth = 280;
    const panelHeight = 300;
    const gap = 10;

    let x = rect.x + rect.width + gap;
    let y = rect.y;

    // Keep in viewport
    if (x + panelWidth > window.innerWidth) {
      x = rect.x - panelWidth - gap;
    }
    if (y + panelHeight > window.innerHeight) {
      y = window.innerHeight - panelHeight - gap;
    }

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  /**
   * Hide the summary panel
   */
  hide() {
    clearTimeout(this.autoHideTimeout);
    this.el.classList.add("hidden");
    this.currentDayId = null;
  }

  /**
   * Set callback when item is clicked
   */
  onItemClick(callback) {
    this.onItemClick = callback;
  }

  /**
   * Schedule auto-hide after delay
   */
  scheduleHide(delayMs = 3000) {
    clearTimeout(this.autoHideTimeout);
    this.autoHideTimeout = setTimeout(() => this.hide(), delayMs);
  }
}

/**
 * Holographic Day Tile - A 3D glass-like day cell that highlights with hover
 */
export class HolographicDayTile {
  constructor(dayId, dayData, scene, options = {}) {
    this.dayId = dayId;
    this.dayData = dayData;
    this.scene = scene;
    this.options = {
      scale: options.scale || 1,
      position: options.position || new THREE.Vector3(0, 0, 0),
      interactiveMode: options.interactiveMode || true
    };

    this.group = new THREE.Group();
    this.group.position.copy(this.options.position);
    this.group.scale.multiplyScalar(this.options.scale);

    this.highlighted = false;
    this.hoverIntensity = 0;

    this._createTile();
  }

  _createTile() {
    const THREE = require("three");

    // Create glass-like background
    const geometry = new THREE.PlaneGeometry(2, 2.5);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf8f9fa,
      metalness: 0.5,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
      emissive: 0x0a7ea4,
      emissiveIntensity: 0.2
    });

    this.tileMesh = new THREE.Mesh(geometry, material);
    this.group.add(this.tileMesh);

    // Create border glow
    const borderGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1.25, 0.01,
      1, -1.25, 0.01,
      1, 1.25, 0.01,
      -1, 1.25, 0.01,
      -1, -1.25, 0.01
    ]);
    borderGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x0a7ea4,
      transparent: true,
      opacity: 0.4,
      linewidth: 2
    });

    this.borderLines = new THREE.Line(borderGeometry, borderMaterial);
    this.group.add(this.borderLines);

    // Create text canvas for day content
    this._createContentCanvas();
  }

  _createContentCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 320;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Date
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.dayData.dateNum || "?", canvas.width / 2, 40);

    // Appointments count
    const aptCount = this.dayData.appointments?.length || 0;
    if (aptCount > 0) {
      ctx.fillStyle = "#0a7ea4";
      ctx.font = "16px Arial";
      ctx.fillText(`${aptCount} appointment${aptCount !== 1 ? "s" : ""}`, canvas.width / 2, 70);
    }

    // Notes count
    const noteCount = this.dayData.threads?.length || 0;
    if (noteCount > 0) {
      ctx.fillStyle = "#6366f1";
      ctx.font = "16px Arial";
      ctx.fillText(`${noteCount} note${noteCount !== 1 ? "s" : ""}`, canvas.width / 2, 90);
    }

    // Preview of first appointment/note
    let yOffset = 130;
    if (this.dayData.appointments && this.dayData.appointments[0]) {
      const apt = this.dayData.appointments[0];
      ctx.fillStyle = "#666";
      ctx.font = "12px Arial";
      ctx.textAlign = "left";
      ctx.fillText(apt.title, 20, yOffset);
      yOffset += 25;
    }

    if (this.dayData.threads && this.dayData.threads[0]) {
      const note = this.dayData.threads[0];
      ctx.fillStyle = "#999";
      ctx.font = "11px Arial";
      ctx.textAlign = "left";
      const truncated = note.title.substring(0, 20) + (note.title.length > 20 ? "..." : "");
      ctx.fillText(truncated, 20, yOffset);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0x6366f1,
      emissiveIntensity: 0.15
    });

    const geometry = new THREE.PlaneGeometry(1.9, 2.4);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = 0.02;
    this.contentMesh = mesh;
    this.group.add(mesh);
  }

  /**
   * Highlight the tile
   */
  highlight(intensity = 1) {
    this.highlighted = true;
    this.hoverIntensity = intensity;

    if (this.tileMesh) {
      this.tileMesh.material.emissiveIntensity = 0.6 * intensity;
      this.tileMesh.material.opacity = 0.95 + 0.05 * intensity;
    }

    if (this.borderLines) {
      this.borderLines.material.opacity = 0.8 * intensity;
    }

    if (this.contentMesh) {
      this.contentMesh.material.emissiveIntensity = 0.4 * intensity;
    }
  }

  /**
   * Un-highlight the tile
   */
  unhighlight() {
    this.highlighted = false;
    this.hoverIntensity = 0;

    if (this.tileMesh) {
      this.tileMesh.material.emissiveIntensity = 0.2;
      this.tileMesh.material.opacity = 0.9;
    }

    if (this.borderLines) {
      this.borderLines.material.opacity = 0.4;
    }

    if (this.contentMesh) {
      this.contentMesh.material.emissiveIntensity = 0.15;
    }
  }

  /**
   * Animate a gentle pulse effect
   */
  animatePulse() {
    if (this.highlighted) {
      const time = Date.now() * 0.002;
      const pulse = 0.5 + Math.sin(time) * 0.5;
      this.highlight(pulse);
    }
  }

  /**
   * Get the THREE.js group
   */
  getGroup() {
    return this.group;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.tileMesh?.geometry?.dispose();
    this.tileMesh?.material?.dispose();
    this.contentMesh?.geometry?.dispose();
    this.contentMesh?.material?.dispose();
    this.borderLines?.geometry?.dispose();
    this.borderLines?.material?.dispose();
    this.group.clear();
  }
}
