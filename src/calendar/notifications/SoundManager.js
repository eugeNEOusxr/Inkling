import { LEVEL_SOUND_MAP, loadNotificationSettings } from "./notificationSettings.js";

/**
 * Gentle Web Audio tones — short, non-overlapping playback.
 *
 * Sound selection rules:
 * - Per-event sound theme is taken from `soundByEventType[eventKind]` in notification settings.
 * - If missing, it falls back to the existing level->theme map (`LEVEL_SOUND_MAP`) then `defaultSound`.
 * - Level-specific variations are subtle detune/timing differences (soft/medium/urgent/final).
 *
 * Event kind inference:
 * - NotificationService calls `playForLevel(level)` without passing event type.
 * - We infer the event kind from the latest in-app toast classes:
 *   `.in-app-alert--${kind} .in-app-alert--level-${level}`
 */
export class SoundManager {
  constructor() {
    this._ctx = null;
    this._lastPlay = 0;
    this._minGapMs = 450;
    this._playing = false;
    this._playingUntil = 0;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === "suspended") this._ctx.resume();
    return this._ctx;
  }

  getVolume() {
    return loadNotificationSettings().volume;
  }

  /**
   * @param {'soft'|'medium'|'urgent'|'final'} level
   */
  playForLevel(level) {
    const settings = loadNotificationSettings();
    if (!settings.enableSounds) return;
    if (this._isInQuietHours(settings)) return;

    const kind = this._inferEventKind(level);
    const themeId = this._resolveThemeIdForLevel({ level, kind, settings });
    this.playTheme(themeId, { level });
  }

  /** Classic morning alarm buzzer — repeats like a bedside clock. */
  playMorningBuzzer() {
    const settings = loadNotificationSettings();
    if (!settings.enableSounds) return;
    if (this._isInQuietHours(settings)) return;

    const bursts = 4;
    const gapMs = 220;
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        this.playTheme("morningBuzzer", { level: "final", skipGap: true });
      }, i * (900 + gapMs));
    }
  }

  /**
   * @param {string} themeId
   * @param {{ level?: 'soft'|'medium'|'urgent'|'final' }} [opts]
   */
  playTheme(themeId, opts = {}) {
    const settings = loadNotificationSettings();
    if (!settings.enableSounds) return;
    if (this._isInQuietHours(settings)) return;

    const level = opts.level ?? "soft";
    const now = performance.now();
    if (!opts.skipGap && now - this._lastPlay < this._minGapMs) return;
    if (this._playing && now < this._playingUntil) return;

    const theme = themeId ?? settings.defaultSound ?? "softChime";
    const variation = this._getLevelVariation(level);

    const baseVol = Math.max(0, Math.min(1, settings.volume)) * 0.35;
    const vol = Math.max(0.001, Math.min(1, baseVol * variation.ampMult));

    try {
      const ctx = this._getCtx();
      this._playing = true;
      this._lastPlay = now;

      const t0 = ctx.currentTime;
      const masterGain = ctx.createGain();

      const attack = variation.attackSec;
      const releaseSec = variation.releaseSec;

      masterGain.gain.setValueAtTime(0.0001, t0);
      masterGain.gain.linearRampToValueAtTime(vol, t0 + attack);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t0 + releaseSec);
      masterGain.connect(ctx.destination);

      const durationMs = this._themeDurationMs(theme, level);

      switch (theme) {
        case "glassPing":
          this._glassPing(ctx, masterGain, t0, variation);
          break;
        case "warmBell":
          this._warmBell(ctx, masterGain, t0, variation);
          break;
        case "softPulse":
          this._softPulse(ctx, masterGain, t0, variation);
          break;
        case "softMarimba":
          this._softMarimba(ctx, masterGain, t0, variation);
          break;
        case "airBell":
          this._airBell(ctx, masterGain, t0, variation);
          break;
        case "calmPluck":
          this._calmPluck(ctx, masterGain, t0, variation);
          break;
        case "warmEcho":
          this._warmEcho(ctx, masterGain, t0, variation);
          break;
        case "morningBuzzer":
          this._morningBuzzer(ctx, masterGain, t0, variation);
          break;
        case "softChime":
        default:
          this._softChime(ctx, masterGain, t0, variation);
      }

      this._playingUntil = now + durationMs + 80;
      setTimeout(() => {
        this._playing = false;
      }, durationMs + 120);
    } catch {
      this._playing = false;
    }
  }

  _isInQuietHours(settings, now = new Date()) {
    if (!settings.enableQuietHours) return false;
    const startH = Number(settings.quietHoursStart);
    const endH = Number(settings.quietHoursEnd);
    if (!Number.isFinite(startH) || !Number.isFinite(endH)) return false;

    const startMins = startH * 60;
    const endMins = endH * 60;
    const curMins = now.getHours() * 60 + now.getMinutes();

    // If start == end, interpret as "mute all day".
    if (startMins === endMins) return true;

    if (startMins < endMins) return curMins >= startMins && curMins < endMins;
    return curMins >= startMins || curMins < endMins;
  }

  /**
   * @param {'soft'|'medium'|'urgent'|'final'} level
   * @returns {'reminder'|'alarm'|'appointment'|'note'|null}
   */
  _inferEventKindFromInApp(level) {
    const container = document.getElementById("in-app-alerts");
    if (!container) return null;

    const list = container.getElementsByClassName(`in-app-alert--level-${level}`);
    if (!list || list.length === 0) return null;
    const el = list[list.length - 1];

    const kinds = ["reminder", "alarm", "appointment", "note"];
    for (const k of kinds) {
      if (el.classList.contains(`in-app-alert--${k}`)) return k;
    }
    return null;
  }

  /**
   * Fallback inference for cases where in-app toasts aren't rendered
   * (e.g. tab hidden). NotificationService always appends history before
   * calling `playForLevel`.
   *
   * @param {'soft'|'medium'|'urgent'|'final'} level
   * @returns {'reminder'|'alarm'|'appointment'|'note'|null}
   */
  _inferEventKindFromHistory(level) {
    const HISTORY_KEY = "calendar3d-notification-history-v1";
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return null;
      const history = JSON.parse(raw);
      if (!Array.isArray(history) || history.length === 0) return null;
      const top = history[0];
      if (!top || top.level !== level) return null;
      const kind = top.type;
      const kinds = ["reminder", "alarm", "appointment", "note"];
      return kinds.includes(kind) ? kind : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {'soft'|'medium'|'urgent'|'final'} level
   * @returns {'reminder'|'alarm'|'appointment'|'note'|null}
   */
  _inferEventKind(level) {
    return this._inferEventKindFromInApp(level) ?? this._inferEventKindFromHistory(level);
  }

  /**
   * @param {{ level: 'soft'|'medium'|'urgent'|'final', kind: string|null, settings: any }} args
   */
  _resolveThemeIdForLevel({ level, kind, settings }) {
    const byType = settings.soundByEventType ?? {};
    const selected = kind ? byType[kind] : null;
    return selected ?? LEVEL_SOUND_MAP[level] ?? settings.defaultSound ?? "softChime";
  }

  _getLevelVariation(level) {
    // Subtle detune + slightly longer/stronger envelope. No harsh or chaotic patterns.
    if (level === "soft") {
      return { ampMult: 0.85, detune: 0.004, attackSec: 0.03, releaseSec: 0.42, orderShift: 0 };
    }
    if (level === "medium") {
      return { ampMult: 0.95, detune: 0.008, attackSec: 0.028, releaseSec: 0.46, orderShift: 1 };
    }
    if (level === "urgent") {
      return { ampMult: 1.04, detune: 0.013, attackSec: 0.022, releaseSec: 0.52, orderShift: 2 };
    }
    // final
    return { ampMult: 1.1, detune: 0.017, attackSec: 0.02, releaseSec: 0.58, orderShift: 3 };
  }

  _themeDurationMs(themeId, level) {
    const base = {
      softChime: 520,
      glassPing: 430,
      warmBell: 620,
      softPulse: 520,
      softMarimba: 470,
      airBell: 460,
      calmPluck: 440,
      warmEcho: 780,
      morningBuzzer: 920
    }[themeId] ?? 520;

    const bump = level === "final" ? 1.08 : level === "urgent" ? 1.03 : level === "medium" ? 0.98 : 0.95;
    return Math.floor(base * bump);
  }

  _softChime(ctx, masterGain, t0, v) {
    const freqs = [523.25, 659.25];
    const order = v.orderShift % 2 === 0 ? [0, 1] : [1, 0];
    order.forEach((idx, j) => {
      const freq = freqs[idx] * (1 + v.detune * (idx === 0 ? 1 : -1));
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = (0.46 - idx * 0.12) * (0.92 + j * 0.08);
      o.connect(g);
      g.connect(masterGain);
      o.start(t0 + j * 0.085);
      o.stop(t0 + 0.46);
    });
  }

  _glassPing(ctx, masterGain, t0, v) {
    const o = ctx.createOscillator();
    o.type = "triangle";

    const baseA = 880 * (1 + v.detune);
    const baseB = 1200 * (1 - v.detune * 0.5);
    o.frequency.setValueAtTime(baseA, t0);
    o.frequency.exponentialRampToValueAtTime(baseB, t0 + 0.11);

    // Quiet second harmonic for airiness (gentle, not brash).
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = baseB * 1.55;

    const g2 = ctx.createGain();
    g2.gain.value = 0.13;
    o2.connect(g2);
    g2.connect(masterGain);

    o.connect(masterGain);
    o.start(t0);
    o2.start(t0 + 0.01);

    const stopAt = t0 + 0.34 + v.detune * 0.8;
    o.stop(stopAt);
    o2.stop(stopAt);
  }

  _warmBell(ctx, masterGain, t0, v) {
    const freqs = [392, 493.88, 587.33];
    freqs.forEach((base, i) => {
      const det = v.detune * (i === 0 ? 1 : i === 1 ? -0.6 : 0.4);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * (1 + det);
      const g = ctx.createGain();
      g.gain.value = (0.26 - i * 0.03) * (0.9 + i * 0.05);
      o.connect(g);
      g.connect(masterGain);
      o.start(t0 + i * 0.05);
      o.stop(t0 + 0.48);
    });
  }

  _softPulse(ctx, masterGain, t0, v) {
    const o = ctx.createOscillator();
    o.type = "sine";
    const f1 = 440 * (1 - v.detune * 0.5);
    const f2 = 520 * (1 + v.detune * 0.5);
    o.frequency.setValueAtTime(f1, t0);
    o.frequency.linearRampToValueAtTime(f2, t0 + 0.2);
    o.connect(masterGain);
    o.start(t0);
    o.stop(t0 + 0.38 + v.detune);
  }

  _softMarimba(ctx, masterGain, t0, v) {
    const freqs = [329.63, 392.0, 493.88];
    freqs.forEach((base, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = base * (1 + (i - 1) * v.detune);
      const g = ctx.createGain();
      g.gain.value = (0.22 - i * 0.03) * (0.95 + (v.ampMult - 1) * 0.2);
      o.connect(g);
      g.connect(masterGain);
      o.start(t0 + i * 0.06);
      o.stop(t0 + 0.28 + i * 0.02);
    });
  }

  _airBell(ctx, masterGain, t0, v) {
    const fA = 740 * (1 + v.detune * 0.7);
    const fB = 1150 * (1 - v.detune * 0.2);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(fA, t0);
    o.frequency.exponentialRampToValueAtTime(fB, t0 + 0.13);

    const oHi = ctx.createOscillator();
    oHi.type = "sine";
    oHi.frequency.value = fB * 1.62;

    const gHi = ctx.createGain();
    gHi.gain.value = 0.12;
    oHi.connect(gHi);
    gHi.connect(masterGain);

    o.connect(masterGain);
    o.start(t0);
    oHi.start(t0 + 0.015);
    const stopAt = t0 + 0.33 + v.detune;
    o.stop(stopAt);
    oHi.stop(stopAt);
  }

  _calmPluck(ctx, masterGain, t0, v) {
    const base = 320 * (1 + v.detune * 0.35);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = base;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200 + 400 * v.detune;
    filter.Q.value = 0.7;

    const localGain = ctx.createGain();
    localGain.gain.value = 0.18;

    o.connect(filter);
    filter.connect(localGain);
    localGain.connect(masterGain);

    // Short pluck decay.
    localGain.gain.setValueAtTime(localGain.gain.value, t0);
    localGain.gain.linearRampToValueAtTime(0.001, t0 + 0.32);

    o.start(t0);
    o.stop(t0 + 0.33);
  }

  /**
   * Harsh two-tone digital alarm (square waves, rapid alternation).
   */
  _morningBuzzer(ctx, masterGain, t0, v) {
    const pairs = [
      [880, 0.12],
      [988, 0.12],
      [880, 0.12],
      [988, 0.12],
      [784, 0.1],
      [880, 0.1],
      [988, 0.14],
      [880, 0.14]
    ];
    let t = t0;
    const vol = 0.11 * v.ampMult;

    for (const [freq, dur] of pairs) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;

      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);

      o.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      o.start(t);
      o.stop(t + dur);
      t += dur;
    }
  }

  _warmEcho(ctx, masterGain, t0, v) {
    const freqs = [392, 523.25, 659.25];
    const echoDelay = 0.18 + v.detune * 2.2;
    const echoMult = 0.42;

    const playBurst = (startT, mult) => {
      freqs.forEach((base, i) => {
        const det = v.detune * (i === 0 ? 1 : i === 1 ? -0.55 : 0.35);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base * (1 + det);
        const g = ctx.createGain();
        g.gain.value = (0.24 - i * 0.03) * mult;
        o.connect(g);
        g.connect(masterGain);
        o.start(startT + i * 0.05);
        o.stop(startT + 0.42);
      });
    };

    playBurst(t0, 1);
    playBurst(t0 + echoDelay, echoMult);
  }
}
