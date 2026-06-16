/**
 * Per-month backdrop photo overrides. A user can replace any month's default
 * picture; the override is reused everywhere that month appears — the year-view
 * month tile, the month grid, the week view, and the day view (they all resolve
 * the image through monthSceneUrl, which checks here first).
 *
 * Stored as a downscaled JPEG data URL in localStorage so a phone photo fits.
 */
const KEY = (monthIndex) => `inkling-month-photo-v1-${monthIndex}`;
const MAX_W = 1280;
const QUALITY = 0.82;

/** @param {number} monthIndex 0-11 → data URL or null */
export function getMonthPhoto(monthIndex) {
  try {
    return localStorage.getItem(KEY(monthIndex));
  } catch {
    return null;
  }
}

export function removeMonthPhoto(monthIndex) {
  try {
    localStorage.removeItem(KEY(monthIndex));
  } catch {
    /* ignore */
  }
  notifyChange();
}

/**
 * Downscale a File to a JPEG data URL and store it for the month.
 * @param {number} monthIndex
 * @param {File} file
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function setMonthPhotoFromFile(monthIndex, file) {
  if (!file || !file.type.startsWith("image/")) return { ok: false, reason: "not-an-image" };
  let dataUrl;
  try {
    dataUrl = await downscaleToJpeg(file, MAX_W, QUALITY);
  } catch {
    return { ok: false, reason: "decode-failed" };
  }
  try {
    localStorage.setItem(KEY(monthIndex), dataUrl);
  } catch {
    return { ok: false, reason: "too-large" }; // localStorage quota
  }
  notifyChange();
  return { ok: true };
}

function notifyChange() {
  try {
    window.dispatchEvent(new CustomEvent("inkling:appearance-change"));
    window.dispatchEvent(new CustomEvent("inkling:month-photo-change"));
  } catch {
    /* ignore */
  }
}

/** @returns {Promise<string>} JPEG data URL */
function downscaleToJpeg(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no-2d"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img-load"));
    };
    img.src = url;
  });
}
