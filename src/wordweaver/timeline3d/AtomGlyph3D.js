import * as THREE from "three";

/**
 * Premium aqua orb: glass shell, animated wave rings (middle layer), orbiting electrons.
 */
export class AtomGlyph3D {
  /**
   * @param {{ scale?: number, opacity?: number, slowRotation?: boolean }} [opts]
   */
  constructor(opts = {}) {
    const baseScale = opts.scale ?? 1.4;
    const shellOpacity = opts.opacity ?? 0.35;
    this._slowRotation = opts.slowRotation ?? false;

    this.group = new THREE.Group();
    this.group.name = "atom-glyph-3d";
    this.group.scale.set(baseScale, baseScale, baseScale);
    this._phase = Math.random() * Math.PI * 2;
    this._elapsed = 0;
    /** @type {THREE.Mesh[]} */
    this._electrons = [];
    /** @type {THREE.Mesh[]} */
    this._waveRings = [];

    const shellRadius = 0.225;

    const shellGeo = new THREE.SphereGeometry(shellRadius, 64, 64);
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: "#A8F6FF",
      emissive: "#003344",
      emissiveIntensity: 0.25,
      metalness: 0.0,
      roughness: 0.05,
      transparent: true,
      opacity: shellOpacity,
      transmission: 1.0,
      thickness: 0.7,
      ior: 1.45,
      clearcoat: 1.0,
      depthWrite: false
    });
    this.shell = new THREE.Mesh(shellGeo, shellMat);
    this.shell.renderOrder = 0;
    this.group.add(this.shell);

    this.ringGroup = new THREE.Group();
    this.ringGroup.name = "atom-wave-rings";

    const ringMatBase = {
      color: "#4DE3FF",
      emissive: "#00CFFF",
      emissiveIntensity: 1.25,
      metalness: 0.55,
      roughness: 0.18,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    };

    const ringSpecs = [
      { radius: 0.152, tube: 0.0075, tiltX: Math.PI / 2, tiltY: 0, phase: 0 },
      { radius: 0.162, tube: 0.0085, tiltX: Math.PI / 2 + 0.55, tiltY: 0.85, phase: 1.05 },
      { radius: 0.145, tube: 0.007, tiltX: Math.PI / 2 + 1.05, tiltY: 1.65, phase: 2.1 },
      { radius: 0.158, tube: 0.008, tiltX: Math.PI / 2 + 1.55, tiltY: 2.35, phase: 3.15 }
    ];

    for (const spec of ringSpecs) {
      const geo = new THREE.TorusGeometry(spec.radius, spec.tube, 48, 96);
      const mat = new THREE.MeshStandardMaterial({ ...ringMatBase });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = spec.tiltX;
      ring.rotation.y = spec.tiltY;
      ring.renderOrder = 2;
      ring.userData.baseRadius = spec.radius;
      ring.userData.phase = spec.phase;
      ring.userData.baseTiltX = spec.tiltX;
      ring.userData.baseTiltY = spec.tiltY;
      this._waveRings.push(ring);
      this.ringGroup.add(ring);
    }

    this.group.add(this.ringGroup);

    const eGeo = new THREE.SphereGeometry(0.0225, 16, 16);
    const eMat = new THREE.MeshStandardMaterial({
      color: "#B8FFFF",
      emissive: "#4DE3FF",
      emissiveIntensity: 1.2,
      metalness: 0.2,
      roughness: 0.1
    });

    const electronCount = 3;
    const orbitRadius = shellRadius * 1.12;
    for (let i = 0; i < electronCount; i++) {
      const electron = new THREE.Mesh(eGeo, eMat.clone());
      electron.renderOrder = 5;
      electron.userData.orbitR = orbitRadius;
      electron.userData.orbitOffset = (i / electronCount) * Math.PI * 2;
      electron.userData.orbitTilt = i * 1.15;
      this._electrons.push(electron);
      this.group.add(electron);
    }
  }

  get object3d() {
    return this.group;
  }

  /**
   * @param {number} delta
   */
  /**
   * Large faint background atom for month calendar scenes.
   * @param {{ scale?: number, opacity?: number, position?: import("three").Vector3 }} [opts]
   */
  static createBackground(opts = {}) {
    const scale = opts.scale ?? 4;
    const opacity = opts.opacity ?? 0.15;
    const glyph = new AtomGlyph3D({ scale, opacity, slowRotation: true });
    if (opts.position) glyph.group.position.copy(opts.position);
    glyph.group.position.z = opts.position?.z ?? -6;
    return glyph;
  }

  update(delta) {
    const dt = Math.min(Math.max(delta || 0.016, 0.001), 0.05);
    this._elapsed += dt;
    const t = this._elapsed + this._phase;
    const rotMul = this._slowRotation ? 0.18 : 1;

    if (this.shell) {
      this.shell.rotation.y += dt * 0.35 * rotMul;
      this.shell.rotation.x += dt * 0.12 * rotMul;
    }

    for (const ring of this._waveRings) {
      const p = ring.userData.phase ?? 0;
      const wave = Math.sin(t * 2.8 + p);
      const ripple = Math.sin(t * 4.2 + p * 1.3);

      const scaleXY = 1 + wave * 0.07;
      const scaleZ = 1 + ripple * 0.12;
      ring.scale.set(scaleXY, scaleXY, scaleZ);

      ring.rotation.x = ring.userData.baseTiltX + Math.sin(t * 1.6 + p) * 0.18;
      ring.rotation.y = ring.userData.baseTiltY + dt * 0.55 + Math.cos(t * 1.2 + p) * 0.1;
      ring.rotation.z += dt * (0.35 + (p % 2) * 0.15);

      if (ring.material) {
        ring.material.emissiveIntensity = 1.15 + wave * 0.45 + ripple * 0.2;
        ring.material.opacity = 0.72 + wave * 0.16;
      }
    }

    if (this.ringGroup) {
      this.ringGroup.rotation.y += dt * 0.22 * rotMul;
    }

    for (const e of this._electrons) {
      const offset = e.userData.orbitOffset;
      const radius = e.userData.orbitR;
      const tilt = e.userData.orbitTilt;
      const angle = t * 1.4 + offset;
      e.position.x = Math.cos(angle) * radius;
      e.position.y = Math.sin(angle * 0.85 + tilt) * radius * 0.55;
      e.position.z = Math.sin(angle) * radius * 0.42;
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this._electrons = [];
    this._waveRings = [];
    this.ringGroup = null;
    this.shell = null;
  }
}

if (typeof document !== "undefined") {
  void import("../WordWeaverUI.js");
}
