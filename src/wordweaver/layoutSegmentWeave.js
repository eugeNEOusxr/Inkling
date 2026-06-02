import { Holographic3DText } from "../calendar/Holographic3DText.js";
import { layoutSegmentWeave as layoutWithMode, sortNodesByTime } from "./layoutModes.js";

/** @typedef {{ mesh: Holographic3DText, node: import('../inkling-core/timelineNode.js').TimelineNode }} WeavePickable */

export { sortNodesByTime };

/**
 * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
 * @param {THREE.Group} parent
 * @param {import('./layoutModes.js').WeaveLayoutMode} [layoutMode]
 */
export function layoutSegmentWeave(module, parent, layoutMode = "street", customParams = null) {
  return layoutWithMode(module, parent, layoutMode, customParams);
}

/**
 * @param {Holographic3DText[]} meshes
 */
export function disposeWeaveMeshes(meshes) {
  meshes.forEach((m) => m.dispose());
}
