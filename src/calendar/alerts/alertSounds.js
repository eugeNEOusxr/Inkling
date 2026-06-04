import { AlertPriority } from "./alertsModel.js";

const SOUND_FILES = {
  [AlertPriority.CRITICAL]: "/sounds/urgent_chime.mp3",
  [AlertPriority.HIGH]: "/sounds/ping.mp3",
  [AlertPriority.NORMAL]: "/sounds/soft_tone.mp3"
};

/** @type {HTMLAudioElement | null} */
let lastAudio = null;

/**
 * @param {number} priority
 */
export function playAlertSound(priority) {
  if (priority <= AlertPriority.LOW) return;

  const url = SOUND_FILES[priority];
  if (url) {
    try {
      if (lastAudio) {
        lastAudio.pause();
        lastAudio.currentTime = 0;
      }
      const audio = new Audio(url);
      lastAudio = audio;
      audio.volume = priority === AlertPriority.CRITICAL ? 0.9 : priority === AlertPriority.HIGH ? 0.65 : 0.45;
      audio.play().catch(() => playSynthForPriority(priority));
      return;
    } catch {
      /* synth fallback */
    }
  }
  playSynthForPriority(priority);
}

/**
 * @param {number} priority
 */
function playSynthForPriority(priority) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (priority === AlertPriority.CRITICAL) {
      osc.frequency.value = 880;
      gain.gain.value = 0.35;
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.frequency.value = 1100;
        g2.gain.value = 0.3;
        o2.connect(g2);
        g2.connect(ctx.destination);
        o2.start();
        o2.stop(ctx.currentTime + 0.25);
      }, 200);
    } else if (priority === AlertPriority.HIGH) {
      osc.frequency.value = 660;
      gain.gain.value = 0.28;
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.frequency.value = 520;
      gain.gain.value = 0.18;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }

    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio unavailable */
  }
}
