/**
 * Inline SVG icon library (monochrome, scalable, CSS-tintable via currentColor).
 *
 * Icons are exported as strings so they can be injected into existing DOM nodes
 * without requiring HTML restructuring.
 */

function svg({ viewBox = "0 0 24 24", paths = [], strokes = [] }) {
  const attrs = `width="1em" height="1em" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  const common = `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  return `<svg ${attrs} aria-hidden="true" focusable="false" ${common}>${
    paths.length ? paths.join("") : ""
  }</svg>`;
}

const fillIcons = (svgInner, viewBox = "0 0 24 24") => {
  return `<svg width="1em" height="1em" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  ${svgInner.replace(/currentColor/g, "currentColor")}
</svg>`;
};

// Note: using simple, compact stroke-based icons for consistent tinting.
export const iconAddNote = svg({
  paths: [
    `<path d="M12 5h8" />`,
    `<path d="M12 9h8" />`,
    `<path d="M8 5h.01" />`,
    `<path d="M6 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />`,
    `<path d="M16 16v6" />`,
    `<path d="M19 19h-6" />`
  ]
});

export const iconAddAppointment = svg({
  paths: [
    `<path d="M8 3v4" />`,
    `<path d="M16 3v4" />`,
    `<path d="M3 9h18" />`,
    `<rect x="3" y="7" width="18" height="14" rx="2" />`,
    `<path d="M12 12v6" />`,
    `<path d="M9 15h6" />`
  ]
});

export const iconBell = svg({
  paths: [
    `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />`,
    `<path d="M13.73 21a2 2 0 0 1-3.46 0" />`
  ]
});

export const iconSound = svg({
  paths: [
    `<path d="M11 5L6 9H2v6h4l5 4V5z" />`,
    `<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />`,
    `<path d="M18.36 5.64a9 9 0 0 1 0 12.72" />`
  ]
});

export const iconHour = svg({
  paths: [
    `<circle cx="12" cy="12" r="9" />`,
    `<path d="M12 7v5l3 3" />`
  ]
});

export const iconDay = svg({
  paths: [
    `<rect x="3" y="4" width="18" height="18" rx="2" />`,
    `<path d="M8 2v4" />`,
    `<path d="M16 2v4" />`,
    `<path d="M3 10h18" />`
  ]
});

export const iconSettings = svg({
  paths: [
    `<circle cx="12" cy="12" r="1.5" />`,
    `<path d="M12 1v6M12 17v6" />`,
    `<path d="M4.22 4.22L9.24 9.24M14.76 14.76L19.78 19.78" />`,
    `<path d="M1 12h6M17 12h6" />`,
    `<path d="M4.22 19.78L9.24 14.76M14.76 9.24L19.78 4.22" />`
  ]
});

export const iconBack = svg({
  paths: [
    `<path d="M15 18l-6-6 6-6" />`
  ]
});

// Decorative premium variants for visual remodel.
// Rollback: remove exports below and any usage references.
export const iconOrb = fillIcons(`
  <circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity="0.18" />
  <circle cx="12" cy="12" r="6.5" fill="currentColor" fill-opacity="0.35" />
  <circle cx="9.2" cy="8.8" r="2.2" fill="#ffffff" fill-opacity="0.45" />
`);

export const iconGoldWave = fillIcons(`
  <path d="M2 15C4 12 6 18 8 15C10 12 12 18 14 15C16 12 18 18 22 15V20H2V15Z" fill="currentColor" fill-opacity="0.75"/>
  <path d="M2 10C4 7 6 13 8 10C10 7 12 13 14 10C16 7 18 13 22 10" stroke="currentColor" stroke-width="1.8" fill="none"/>
`);

