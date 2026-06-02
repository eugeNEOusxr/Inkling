import * as THREE from "three";

/**
 * Creates a futuristic holographic glass text object in 3D space.
 * Features: customizable fonts, colors, sizes, bold, and glass material effects.
 */
export class Holographic3DText {
  constructor(text = "", options = {}) {
    this.text = text;
    this.options = {
      fontSize: options.fontSize || 1,
      fontFamily: options.fontFamily || "Arial",
      color: options.color || 0x0a7ea4,
      glowColor: options.glowColor || 0x6366f1,
      bold: options.bold || false,
      metallic: options.metallic || true,
      emissiveIntensity: options.emissiveIntensity || 0.8,
      glassOpacity: options.glassOpacity || 0.85,
      depthLayers: Math.max(1, Math.min(4, options.depthLayers ?? 1)),
      position: options.position || new THREE.Vector3(0, 0, 0),
      rotation: options.rotation || new THREE.Euler(0, 0, 0)
    };

    this.group = new THREE.Group();
    this.group.position.copy(this.options.position);
    this.group.rotation.copy(this.options.rotation);

    this.meshes = [];
    this.glowMeshes = [];
    this._createCanvasText();
  }

  _createCanvasText() {
    // Create canvas texture for the text
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    canvas.width = 1024;
    canvas.height = 256;

    // Draw text on canvas
    const fontSize = Math.floor(this.options.fontSize * 100);
    const fontWeight = this.options.bold ? "bold" : "normal";
    ctx.font = `${fontWeight} ${fontSize}px ${this.options.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `#${this.options.color.toString(16).padStart(6, "0")}`;
    ctx.shadowColor = `#${this.options.glowColor.toString(16).padStart(6, "0")}`;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillText(this.text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create main glass-like material
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      opacity: this.options.glassOpacity,
      metalness: 0.6,
      roughness: 0.2,
      emissive: new THREE.Color(this.options.glowColor),
      emissiveIntensity: this.options.emissiveIntensity,
      envMapIntensity: 1.2
    });

    // Create plane geometry for the text
    const geometry = new THREE.PlaneGeometry(8, 2);
    const mesh = new THREE.Mesh(geometry, material);
    this.meshes.push(mesh);
    this.group.add(mesh);

    for (let layer = 1; layer < this.options.depthLayers; layer++) {
      const depth = layer * 0.04;
      const layerMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 2),
        material.clone()
      );
      layerMesh.position.z = -depth;
      layerMesh.material.opacity = this.options.glassOpacity * (0.55 - layer * 0.12);
      this.meshes.push(layerMesh);
      this.group.add(layerMesh);
    }

    // Create glow effect (post-processing would be ideal, but using simple method)
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.3,
      color: new THREE.Color(this.options.glowColor),
      side: THREE.BackSide
    });

    const glowGeometry = new THREE.PlaneGeometry(8.2, 2.2);
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.z = -0.05;
    this.glowMeshes.push(glowMesh);
    this.group.add(glowMesh);

    // Add subtle reflective back layer (glass effect)
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.3,
      opacity: 0.15,
      transparent: true,
      emissive: new THREE.Color(this.options.glowColor),
      emissiveIntensity: 0.4
    });

    const backGeometry = new THREE.PlaneGeometry(8, 2);
    const backMesh = new THREE.Mesh(backGeometry, backMaterial);
    backMesh.position.z = -0.1;
    this.group.add(backMesh);

    // Add edge glow effect with wireframe
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: this.options.glowColor,
      transparent: true,
      opacity: 0.6
    });

    const edgeGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -4, -1, 0,
      4, -1, 0,
      4, 1, 0,
      -4, 1, 0,
      -4, -1, 0
    ]);

    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    const edgeLines = new THREE.Line(edgeGeometry, edgeMaterial);
    this.group.add(edgeLines);
  }

  /**
   * Update text content and regenerate canvas
   */
  updateText(newText, newOptions = {}) {
    this.text = newText;
    Object.assign(this.options, newOptions);
    
    // Clear old meshes
    this.meshes.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
      this.group.remove(m);
    });
    this.glowMeshes.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
      this.group.remove(m);
    });
    this.meshes = [];
    this.glowMeshes = [];

    // Remove old edge lines
    const edges = this.group.children.filter(c => c instanceof THREE.Line);
    edges.forEach(e => this.group.remove(e));

    // Recreate
    this._createCanvasText();
  }

  /**
   * Animate the holographic effect
   */
  animatePulse(intensity = 0.5) {
    const time = Date.now() * 0.001;
    const pulse = 0.5 + Math.sin(time * 2) * intensity * 0.5;
    
    this.meshes.forEach(m => {
      if (m.material.emissiveIntensity !== undefined) {
        m.material.emissiveIntensity = this.options.emissiveIntensity * pulse;
      }
    });
  }

  /**
   * Rotate the text
   */
  setRotation(x, y, z) {
    this.group.rotation.set(x, y, z);
  }

  /**
   * Position the text in 3D space
   */
  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  /**
   * Get the THREE.js group for scene addition
   */
  getGroup() {
    return this.group;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.meshes.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
    });
    this.glowMeshes.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
    });
    this.meshes = [];
    this.glowMeshes = [];
    this.group.clear();
  }

  /**
   * @param {string} text
   * @param {string} [styleKey]
   * @returns {Holographic3DText}
   */
  static createStyled(text, styleKey = "default") {
    return HolographicTypography.createStyled(text, styleKey);
  }
}

/**
 * Typography system for managing fonts, colors, sizes, and styles
 */
export class HolographicTypography {
  static FONTS = {
    SANS: "Arial",
    SERIF: "Georgia",
    MONO: "Courier New",
    FUTURISTIC: "Orbitron, Arial"
  };

  static COLORS = {
    PRIMARY: 0x0a7ea4,    // Professional teal
    ACCENT: 0x6366f1,     // Indigo
    SECONDARY: 0x38bdf8,  // Cyan
    TERTIARY: 0xfbbf24,   // Amber
    SUCCESS: 0x22c55e,    // Green
    ALERT: 0xf87171       // Red
  };

  static SIZES = {
    TINY: 0.4,
    SMALL: 0.6,
    NORMAL: 1.0,
    LARGE: 1.4,
    XLARGE: 2.0,
    XXLARGE: 2.8
  };

  /**
   * Create a styled text element
   */
  static createStyled(text, styleKey = "default") {
    const styles = {
      default: {
        fontSize: this.SIZES.NORMAL,
        fontFamily: this.FONTS.SANS,
        color: this.COLORS.PRIMARY,
        glowColor: this.COLORS.ACCENT,
        bold: false
      },
      title: {
        fontSize: this.SIZES.XLARGE,
        fontFamily: this.FONTS.FUTURISTIC,
        color: this.COLORS.PRIMARY,
        glowColor: this.COLORS.ACCENT,
        bold: true
      },
      subtitle: {
        fontSize: this.SIZES.LARGE,
        fontFamily: this.FONTS.SANS,
        color: this.COLORS.SECONDARY,
        glowColor: this.COLORS.PRIMARY,
        bold: true
      },
      body: {
        fontSize: this.SIZES.NORMAL,
        fontFamily: this.FONTS.SANS,
        color: this.COLORS.PRIMARY,
        glowColor: this.COLORS.SECONDARY,
        bold: false
      },
      label: {
        fontSize: this.SIZES.SMALL,
        fontFamily: this.FONTS.MONO,
        color: this.COLORS.SECONDARY,
        glowColor: this.COLORS.PRIMARY,
        bold: false
      }
    };

    const style = styles[styleKey] || styles.default;
    return new Holographic3DText(text, style);
  }
}

/** @deprecated Use HolographicTypography.createStyled — kept for older call sites */
Holographic3DText.createStyled = HolographicTypography.createStyled.bind(HolographicTypography);
