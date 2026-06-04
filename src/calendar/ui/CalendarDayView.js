import { timeToSlotIndex } from "./DayScroller.js";

/**
 * Scroll the day timeline so a time slot is centered in view.
 * @param {HTMLElement | { track?: HTMLElement | null } | null} rootOrScroller
 * @param {string} timeString HH:MM
 */
export function scrollToTime(rootOrScroller, timeString) {
  const track =
    rootOrScroller?.track ??
    (rootOrScroller instanceof HTMLElement ? rootOrScroller : null);
  if (!track?.querySelector) return;

  const index = timeToSlotIndex(timeString);
  const slot = track.querySelector(
    `.day-scroller__row[data-slot="${index}"], [data-slot="${index}"]`
  );
  if (!slot) return;

  slot.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest"
  });
}

/**
 * Scroll to the first time slot with content, or 08:00 if none.
 * @param {HTMLElement | null} mountEl
 * @param {{ track?: HTMLElement | null } | null} dayScroller
 */
export function scrollToFirstAvailableTime(mountEl, dayScroller) {
  const track = dayScroller?.track ?? mountEl?.querySelector?.(".day-scroller__track");
  if (track) {
    const noted = track.querySelector(
      ".day-scroller__row.has-note, .day-scroller__row.is-committed"
    );
    if (noted) {
      const slot = noted.getAttribute("data-slot");
      if (slot != null) {
        const hour = Math.floor(Number(slot) / 2);
        scrollToTime(track, `${String(hour).padStart(2, "0")}:00`);
        return;
      }
    }
  }
  scrollToTime(track ?? mountEl, "08:00");
}
