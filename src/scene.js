// src/scene.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  applyVisualPerfClass,
  isHighPerformance,
  isReducedMotion,
  isVisualsEnabled,
  logVisualTiming,
  particleBudget
} from "./utils/perfFlags.js";

function createNebulaBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0a0e1a");
  grad.addColorStop(0.45, "#12182a");
  grad.addColorStop(1, "#05060a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 80; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 2.5;
    const a = Math.random() * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 200, 255, ${a})`;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene(canvas) {
  // Phase visual hook support.
  // Rollback: remove setter methods below and related defaults map.
  const scene = new THREE.Scene();
  scene.background = createNebulaBackground();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 2, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.panSpeed = 0.6;
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.85;

  const hemi = new THREE.HemisphereLight(0xc8d4f8, 0x0a0e1a, 0.55);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xb8c4e8, 0.35);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(6, 14, 10);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x818cf8, 0.45);
  rimLight.position.set(-10, 6, -8);
  scene.add(rimLight);

  const fill = new THREE.PointLight(0x38bdf8, 0.5, 35);
  fill.position.set(2, 0, 8);
  scene.add(fill);

  const warmRim = new THREE.PointLight(0xfbbf24, 0.15, 25);
  warmRim.position.set(-4, 8, 4);
  scene.add(warmRim);

  const visualDefaults = {
    metalness: 0.85,
    roughness: 0.18,
    envIntensity: 0.65
  };

  scene.fog = new THREE.FogExp2(0x0a0e1a, 0.022);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener("resize", onResize);

  // Phase B visual effects bootstrap.
  // Rollback: remove this block and effect module imports.
  applyVisualPerfClass();
  if (isVisualsEnabled() && !isReducedMotion()) {
    const visualStart = performance.now();
    Promise.all([
      import("./ui/effects/pixelWave.js"),
      import("./ui/effects/particleSystem.js"),
      import("./ui/effects/orbManager.js")
    ]).then(([pixelWave, particleSystem, orbManager]) => {
      const detachPixelWave = pixelWave.attachPixelWave();
      const particles = particleSystem.initParticles(document.body, {
        count: particleBudget(),
        bloom: isHighPerformance()
      });
      const orbs = orbManager.initOrbs(document.body);

      window.addEventListener("eugeneous:note-added", (evt) => {
        const detail = evt.detail || {};
        particles.emitPixels(detail.x || window.innerWidth * 0.5, detail.y || window.innerHeight * 0.5, "rgba(212,175,55,0.95)", isHighPerformance() ? 28 : 12);
      });

      window.addEventListener("beforeunload", () => {
        detachPixelWave?.();
        particles?.destroy?.();
        orbs?.destroy?.();
      });
      logVisualTiming("effects:init", visualStart);
    }).catch(() => {
      // Keep core scene behavior untouched on visual module failures.
    });
  }

  scene.setLighting = ({ intensity = 1, color = 0xffffff } = {}) => {
    // Visual-only setter for theme tuning.
    hemi.intensity = 0.55 * intensity;
    ambient.intensity = 0.35 * intensity;
    keyLight.intensity = 1.05 * intensity;
    rimLight.intensity = 0.45 * intensity;
    fill.intensity = 0.5 * intensity;
    warmRim.intensity = 0.15 * intensity;
    const tint = new THREE.Color(color);
    keyLight.color.copy(tint);
    rimLight.color.copy(tint).lerp(new THREE.Color(0x4ee6e6), 0.35);
  };

  scene.setMaterialDefaults = ({ metalness, roughness, envIntensity } = {}) => {
    // Visual-only setter for material baseline values.
    if (typeof metalness === "number") visualDefaults.metalness = metalness;
    if (typeof roughness === "number") visualDefaults.roughness = roughness;
    if (typeof envIntensity === "number") visualDefaults.envIntensity = envIntensity;

    scene.traverse((obj) => {
      const material = obj?.material;
      if (!material) return;
      const applyTo = Array.isArray(material) ? material : [material];
      applyTo.forEach((mat) => {
        if ("metalness" in mat) mat.metalness = visualDefaults.metalness;
        if ("roughness" in mat) mat.roughness = visualDefaults.roughness;
        if ("envMapIntensity" in mat) mat.envMapIntensity = visualDefaults.envIntensity;
        mat.needsUpdate = true;
      });
    });
  };

  scene.setEnvMap = (url) => {
    // Visual-only environment map setter with safe fallback.
    if (!url) return;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.setMaterialDefaults({ envIntensity: visualDefaults.envIntensity });
      },
      undefined,
      () => {
        /* keep default visuals if loading fails */
      }
    );
  };

  return { scene, camera, renderer, controls };
}
