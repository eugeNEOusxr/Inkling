import * as THREE from "three";

const GOLD = 0xffd700;
const GOLD_EMISSIVE = 0xb8860b;

/**
 * 3D atom glyph: rotating rings + orbiting particles with emissive glow.
 */
export class AtomGlyph {
  /**
   * @param {{ particleCount?: number }} [opts]
   */
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.group.name = "atom-glyph";

    const particleCount = Math.min(6, Math.max(3, opts.particleCount ?? 5));
    this._phase = Math.random() * Math.PI * 2;
    this._elapsed = 0;
    this._rings = [];
    this._particles = [];

    const ringRadii = [0.14, 0.19, 0.24];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringRadii[i], 0.009, 10, 56),
        new THREE.MeshStandardMaterial({
          color: GOLD,
          emissive: new THREE.Color(GOLD_EMISSIVE),
          emissiveIntensity: 0.9,
          metalness: 0.9,
          roughness: 0.25,
          transparent: true,
          opacity: 0.9
        })
      );
      ring.rotation.x = Math.PI / 2 + i * 0.55;
      ring.rotation.y = i * 0.9;
      ring.userData.spinX = 0.9 + i * 0.2;
      ring.userData.spinY = 0.7 + i * 0.15;
      this._rings.push(ring);
      this.group.add(ring);
    }

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshStandardMaterial({
        color: GOLD,
        emissive: new THREE.Color(GOLD_EMISSIVE),
        emissiveIntensity: 1.25,
        metalness: 0.6,
        roughness: 0.2
      })
    );
    this.group.add(nucleus);

    for (let p = 0; p < particleCount; p++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0xfff4c2,
          emissive: new THREE.Color(GOLD),
          emissiveIntensity: 1.35,
          metalness: 0.4,
          roughness: 0.15
        })
      );
      particle.userData.orbitRadius = 0.16 + (p % 3) * 0.05;
      particle.userData.orbitSpeed = 2.2 + p * 0.25;
      particle.userData.orbitTilt = (p / particleCount) * Math.PI * 2;
      particle.userData.orbitPhase = (p / particleCount) * Math.PI * 2;
      this._particles.push(particle);
      this.group.add(particle);
    }
  }

  getGroup() {
    return this.group;
  }

  /**
   * @param {number} delta seconds since last frame
   */
  update(delta) {
    this._elapsed += delta;
    const time = this._elapsed + this._phase;

    for (const ring of this._rings) {
      ring.rotation.x += ring.userData.spinX * delta;
      ring.rotation.y += ring.userData.spinY * delta;
      if (ring.material && "emissiveIntensity" in ring.material) {
        ring.material.emissiveIntensity =
          0.7 + Math.sin(time * 2.4 + ring.userData.spinX) * 0.28;
      }
    }

    for (const particle of this._particles) {
      const r = particle.userData.orbitRadius;
      const speed = particle.userData.orbitSpeed;
      const tilt = particle.userData.orbitTilt;
      const phase = particle.userData.orbitPhase;
      const angle = time * speed + phase;
      particle.position.set(
        Math.cos(angle) * r,
        Math.sin(angle * 0.7 + tilt) * r * 0.45,
        Math.sin(angle) * r
      );
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
  }
}
