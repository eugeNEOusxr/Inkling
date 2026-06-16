/**
 * Voice-to-text dictation via the browser's built-in Web Speech API
 * (SpeechRecognition). No voice download needed — on Android/Chrome this uses
 * the OS speech service. Transcribes speech straight into a chat input.
 *
 * (Text-to-speech / Inkling reading replies aloud is intentionally NOT here —
 * that needs a downloaded voice.)
 */
function SpeechRecognitionCtor() {
  return (
    (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
    null
  );
}

export function isVoiceInputSupported() {
  return Boolean(SpeechRecognitionCtor());
}

/**
 * Toggleable dictation bound to a text input. Appends recognized speech to
 * whatever's already typed, with live interim results.
 */
export class VoiceDictation {
  /** @param {{ onStateChange?: (state: 'recording'|'idle'|'error', detail?: string) => void }} [opts] */
  constructor(opts = {}) {
    this.onStateChange = opts.onStateChange || (() => {});
    this.rec = null;
    this.active = false;
    this._base = "";
    this._final = "";
    // Auto-stop after this much silence (no speech) — feels like a natural pause.
    this._silenceMs = opts.silenceMs ?? 2800;
    this._silenceTimer = null;
  }

  _armSilenceTimer() {
    clearTimeout(this._silenceTimer);
    this._silenceTimer = setTimeout(() => this.stop(), this._silenceMs);
  }

  get supported() {
    return isVoiceInputSupported();
  }

  /** @param {HTMLInputElement|HTMLTextAreaElement} inputEl */
  toggle(inputEl) {
    if (this.active) this.stop();
    else this.start(inputEl);
  }

  /** @param {HTMLInputElement|HTMLTextAreaElement} inputEl */
  start(inputEl) {
    const Ctor = SpeechRecognitionCtor();
    if (!Ctor || this.active || !inputEl) return;

    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    this._base = inputEl.value ? inputEl.value.replace(/\s+$/, "") + " " : "";
    this._final = "";

    rec.onresult = (event) => {
      this._armSilenceTimer(); // speech detected → reset the silence countdown
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) this._final += result[0].transcript;
        else interim += result[0].transcript;
      }
      inputEl.value = (this._base + this._final + interim).replace(/\s{2,}/g, " ");
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    };
    rec.onerror = (event) => {
      this._cleanup(event?.error === "not-allowed" ? "error" : "idle", event?.error);
    };
    rec.onend = () => {
      // Move focus to the end so the user can keep typing / hit send.
      try {
        inputEl.focus();
        const len = inputEl.value.length;
        inputEl.setSelectionRange?.(len, len);
      } catch {
        /* ignore */
      }
      this._cleanup("idle");
    };

    this.rec = rec;
    this.active = true;
    this.onStateChange("recording");
    try {
      rec.start();
      this._armSilenceTimer(); // stop if they never start talking
    } catch {
      this._cleanup("idle");
    }
  }

  stop() {
    try {
      this.rec?.stop();
    } catch {
      this._cleanup("idle");
    }
  }

  _cleanup(state, detail) {
    clearTimeout(this._silenceTimer);
    this._silenceTimer = null;
    this.active = false;
    this.rec = null;
    this.onStateChange(state || "idle", detail);
  }
}
