import { NeighborhoodScene } from "./NeighborhoodScene.js";

let active = null;

/**
 * Mount WorldWeaver neighborhood inside an Inkling container.
 * @param {HTMLElement} mountEl
 * @param {{ onDistrictName?: (name: string) => void }} [opts]
 */
export async function mountWorldWeaverNeighborhood(mountEl, opts) {
  await unmountWorldWeaverNeighborhood();
  const scene = new NeighborhoodScene(mountEl, opts);
  active = scene;
  await scene.start();
  return scene;
}

export async function unmountWorldWeaverNeighborhood() {
  if (active) {
    active.dispose();
    active = null;
  }
}

export function isWorldWeaverNeighborhoodActive() {
  return !!active;
}
