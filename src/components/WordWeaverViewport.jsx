/**
 * WordWeaver viewport — mounts the Depth Staircase Three.js timeline
 * into the bottom region of the notebookcalendar layout.
 */
import { TimelineRenderer } from "../wordweaver/TimelineRenderer.js";
import { initInklingChatBridge } from "../inkling/InklingChatBridge.js";
import { onTimelineDataChange, disposeTimelineDataChange } from "../utils/EventBus.js";

/** @type {TimelineRenderer | null} */
let activeRenderer = null;
/** @type {(() => void) | null} */
let unsubscribeTimeline = null;

/**
 * Creates the viewport DOM subtree.
 * @param {{ className?: string, minHeight?: string }} [props]
 * @returns {HTMLDivElement}
 */
export function createWordWeaverViewport(props = {}) {
  const shell = document.createElement("div");
  shell.className = props.className ?? "wordweaver-viewport-shell";
  shell.style.cssText = [
    "width:100%",
    "height:100%",
    "min-height:" + (props.minHeight ?? "280px"),
    "display:flex",
    "flex-direction:column",
    "overflow:hidden",
    "background:radial-gradient(ellipse at 50% 0%, #0f172a 0%, #060a14 70%)"
  ].join(";");

  const viewport = document.createElement("div");
  viewport.id = "wordweaver-viewport";
  viewport.style.cssText = "flex:1;width:100%;height:100%;min-height:240px;";
  viewport.setAttribute("aria-label", "WordWeaver 3D timeline");
  shell.appendChild(viewport);

  return shell;
}

function bindTimelineRefresh() {
  if (unsubscribeTimeline) disposeTimelineDataChange(unsubscribeTimeline);
  unsubscribeTimeline = onTimelineDataChange(() => {
    void TimelineRenderer.refresh();
  });
}

/**
 * Mount TimelineRenderer into #wordweaver-viewport (creates element if missing).
 * @param {HTMLElement | string} [host]
 * @returns {Promise<TimelineRenderer | null>}
 */
export async function mountWordWeaverViewport(host) {
  disposeWordWeaverViewport();

  initInklingChatBridge();
  bindTimelineRefresh();

  let root =
    typeof host === "string"
      ? document.querySelector(host)
      : host ?? document.getElementById("wordweaver-viewport-host");

  if (!root) {
    root = document.body;
  }

  let viewport = root.querySelector("#wordweaver-viewport");
  if (!viewport) {
    const shell = createWordWeaverViewport();
    root.appendChild(shell);
    viewport = shell.querySelector("#wordweaver-viewport");
  }

  activeRenderer = await TimelineRenderer.mount(viewport);
  return activeRenderer;
}

/** Tear down the active renderer instance. */
export function disposeWordWeaverViewport() {
  if (unsubscribeTimeline) disposeTimelineDataChange(unsubscribeTimeline);
  unsubscribeTimeline = null;
  activeRenderer?.dispose();
  activeRenderer = null;
}

export default {
  createWordWeaverViewport,
  mountWordWeaverViewport,
  disposeWordWeaverViewport
};
