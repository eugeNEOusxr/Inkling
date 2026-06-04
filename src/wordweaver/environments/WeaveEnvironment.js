import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getEnvironmentDef } from "./weaveEnvironments.js";

/** @typedef {import('./weaveEnvironments.js').WeaveEnvironmentDef} WeaveEnvironmentDef */
/** @typedef {import('./weaveEnvironments.js').WeaveEnvAnchor} WeaveEnvAnchor */

const _loader = new GLTFLoader();

/**
 * Builds / loads 3D worlds for WordWeaver (procedural or Meshy GLB).
 */
export class WeaveEnvironment {
  /**
   * @param {THREE.Group} root
   */
  constructor(root) {
    this.root = root;
    /** @type {string} */
    this._envId = "default";
    /** @type {WeaveEnvironmentDef | null} */
    this._def = getEnvironmentDef("default");
    /** @type {THREE.Object3D | null} */
    this._content = null;
    /** @type {Array<{ obj: THREE.Object3D, kind: string, phase: number, base: THREE.Euler }>} */
    this._motion = [];
    /** @type {THREE.Mesh | null} */
    this._water = null;
    this._loadGen = 0;
  }

  /**
   * @returns {WeaveEnvAnchor[]}
   */
  getAnchors() {
    return this._def?.anchors ?? [];
  }

  /**
   * @returns {{ position: THREE.Vector3, target: THREE.Vector3, fogNear?: number, fogFar?: number, bgColor?: number }}
   */
  getSceneHints() {
    const cam = this._def?.camera ?? { position: [0, 2.4, 8.2], target: [0, 1.1, 0] };
    return {
      position: new THREE.Vector3(...cam.position),
      target: new THREE.Vector3(...cam.target),
      fogNear: this._def?.fogNear,
      fogFar: this._def?.fogFar,
      bgColor: this._def?.bgColor
    };
  }

  /**
   * @param {string} envId
   * @param {{ glbUrl?: string }} [opts]
   */
  async setEnvironment(envId, opts = {}) {
    this._envId = envId;
    this._def = getEnvironmentDef(envId);
    const gen = ++this._loadGen;
    this._clear();

    if (envId === "default") {
      this._buildDefault();
      return;
    }

    const glbUrl = opts.glbUrl || this._def?.glbUrl;
    if (this._def?.type === "glb" && glbUrl) {
      await this._loadGlb(glbUrl, gen);
      return;
    }

    switch (envId) {
      case "house":
        this._buildHouse();
        break;
      case "park":
        this._buildPark();
        break;
      case "beach":
        this._buildBeach();
        break;
      default:
        this._buildDefault();
        break;
    }
  }

  _clear() {
    this._motion = [];
    this._water = null;
    if (this._content) {
      this.root.remove(this._content);
      this._disposeObject(this._content);
      this._content = null;
    }
  }

  /**
   * @param {THREE.Object3D} obj
   */
  _disposeObject(obj) {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry?.dispose?.();
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => m?.dispose?.());
      }
    });
  }

  _buildDefault() {
    const g = new THREE.Group();
    g.name = "ww-env-default";

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        metalness: 0.65,
        roughness: 0.42,
        transparent: true,
        opacity: 0.55
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    g.add(floor);

    const grid = new THREE.GridHelper(26, 26, 0x4ee6e6, 0x1e3a5f);
    grid.position.y = -0.06;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.28;
    });
    g.add(grid);

    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = Math.random() * 9 + 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.07,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      })
    );
    g.add(stars);
    this._motion.push({ obj: stars, kind: "drift", phase: 0, base: stars.rotation.clone() });

    this._content = g;
    this.root.add(g);
  }

  _buildHouse() {
    const g = new THREE.Group();
    g.name = "ww-env-house";

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 0.85, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);

    const room = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 2.6, 4.5),
      new THREE.MeshStandardMaterial({
        color: 0x2a2520,
        roughness: 0.9,
        side: THREE.BackSide
      })
    );
    room.position.set(0, 1.3, 0);
    g.add(room);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x3d2e1f, roughness: 0.75 })
    );
    roof.position.set(0, 3.5, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.6 })
    );
    desk.position.set(-1.1, 0.82, 0.2);
    g.add(desk);

    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.1),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      })
    );
    windowGlow.position.set(0, 1.35, -2.24);
    g.add(windowGlow);
    this._motion.push({ obj: windowGlow, kind: "float", phase: 0.5, base: windowGlow.rotation.clone() });

    const lamp = new THREE.PointLight(0xfde68a, 0.55, 8);
    lamp.position.set(-0.5, 2.2, 0.5);
    g.add(lamp);

    this._content = g;
    this.root.add(g);
  }

  _buildPark() {
    const g = new THREE.Group();
    g.name = "ww-env-park";

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a3d2a, roughness: 0.95 })
    );
    grass.rotation.x = -Math.PI / 2;
    g.add(grass);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9 })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.02, -0.5);
    g.add(path);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.12, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 0.7 })
    );
    bench.position.set(-0.5, 0.55, 0.8);
    g.add(bench);

    for (let i = 0; i < 5; i++) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3520 })
      );
      trunk.position.y = 0.45;
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.65 + i * 0.05, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.85 })
      );
      crown.position.y = 1.35;
      tree.add(trunk, crown);
      const angle = (i / 5) * Math.PI * 2;
      tree.position.set(Math.cos(angle) * 2.8, 0, Math.sin(angle) * 2.2);
      tree.rotation.y = angle;
      g.add(tree);
      this._motion.push({ obj: tree, kind: "sway", phase: i * 0.7, base: tree.rotation.clone() });
    }

    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x1a3d2a, 0.35);
    g.add(hemi);

    this._content = g;
    this.root.add(g);
  }

  _buildBeach() {
    const g = new THREE.Group();
    g.name = "ww-env-beach";

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 14),
      new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.95 })
    );
    sand.rotation.x = -Math.PI / 2;
    g.add(sand);

    const waterGeo = new THREE.PlaneGeometry(18, 8, 32, 16);
    const water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.72,
        metalness: 0.2,
        roughness: 0.15,
        emissive: 0x0369a1,
        emissiveIntensity: 0.25
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.04, -4.5);
    g.add(water);
    this._water = water;

    const umbrellaPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
    );
    umbrellaPole.position.set(-1.6, 0.8, 0.3);
    g.add(umbrellaPole);

    const umbrellaTop = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 0.35, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        roughness: 0.6
      })
    );
    umbrellaTop.position.set(-1.6, 1.55, 0.3);
    g.add(umbrellaTop);
    this._motion.push({ obj: umbrellaTop, kind: "sway", phase: 1.2, base: umbrellaTop.rotation.clone() });

    const sun = new THREE.DirectionalLight(0xfff7ed, 0.7);
    sun.position.set(4, 8, 2);
    g.add(sun);

    this._content = g;
    this.root.add(g);
  }

  /**
   * @param {string} url
   * @param {number} gen
   */
  async _loadGlb(url, gen) {
    try {
      const gltf = await _loader.loadAsync(url);
      if (gen !== this._loadGen) return;

      const model = gltf.scene;
      model.name = "ww-env-glb";

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const scale = 4 / maxDim;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y = -box.min.y * scale;

      model.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      this._content = model;
      this.root.add(model);
    } catch (err) {
      console.warn("[WeaveEnvironment] GLB load failed", url, err);
      if (gen === this._loadGen) this._buildDefault();
    }
  }

  /**
   * Gentle motion — water waves, tree sway, emissive pulse.
   * @param {number} t elapsed seconds
   */
  update(t) {
    for (const m of this._motion) {
      if (m.kind === "sway") {
        m.obj.rotation.z = m.base.z + Math.sin(t * 0.9 + m.phase) * 0.04;
        m.obj.rotation.x = m.base.x + Math.sin(t * 0.7 + m.phase) * 0.02;
      } else if (m.kind === "float") {
        m.obj.position.y += Math.sin(t * 1.4 + m.phase) * 0.0008;
        if (m.obj.material?.opacity !== undefined) {
          m.obj.material.opacity = 0.28 + Math.sin(t * 1.2 + m.phase) * 0.08;
        }
      } else if (m.kind === "drift") {
        m.obj.rotation.y = t * 0.02;
      }
    }

    if (this._water?.geometry) {
      const pos = this._water.geometry.attributes.position;
      const base = this._water.userData.basePositions;
      if (!base) {
        this._water.userData.basePositions = pos.array.slice();
        return;
      }
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3;
        const x = base[ix];
        const z = base[ix + 2];
        pos.array[ix + 1] = base[ix + 1] + Math.sin(x * 0.8 + t * 1.5) * 0.06 + Math.cos(z * 0.6 + t) * 0.04;
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    this._clear();
  }
}
