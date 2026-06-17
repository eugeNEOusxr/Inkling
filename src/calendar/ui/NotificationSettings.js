import {
  SOUND_THEMES,
  loadNotificationSettings,
  saveNotificationSettings
} from "../notifications/notificationSettings.js";
import { clearNotificationHistory } from "../notifications/notificationFeed.js";
import { getSession, clearSession } from "../../auth/session.js";
import { apiFetch, collectLocalBundle } from "../../auth/cloudSync.js";
import { displayNameForUser } from "../../auth/userAccount.js";
import { getInklingWelcomeMessage } from "../ai/inklingWelcome.js";
import { getDisplayName, getUsername, setUsername } from "./userProfile.js";
import { iconSettings } from "./IconLibrary.js";
import { renderAppearancePalettePicker } from "../../theme/appearancePaletteUi.js";
import { setAppearancePalette } from "../../theme/applyAppearance.js";
import { getMonthPhoto, setMonthPhotoFromFile, removeMonthPhoto } from "../../wordweaver/monthPhotos.js";
import {
  isPushSupported,
  isPushEnabledLocally,
  enablePush,
  disablePush,
  sendTestPush,
  showLocalNotification
} from "../notifications/webPush.js";

const ADDITIONAL_THEMES = [
  { id: "softMarimba", label: "Soft Marimba" },
  { id: "airBell", label: "Air Bell" },
  { id: "calmPluck", label: "Calm Pluck" },
  { id: "warmEcho", label: "Warm Echo" }
];

const ALL_THEMES = [...SOUND_THEMES, ...ADDITIONAL_THEMES];

const EVENT_TYPES = [
  { key: "note", label: "Notes" },
  { key: "reminder", label: "Reminders" },
  { key: "alarm", label: "Alarms" },
  { key: "appointment", label: "Appointments" }
];

/**
 * Notification preferences panel — sounds, volume, toggles, clear history.
 *
 * Phase 3: per-event sound selection + quiet hours + additional themes.
 * UI is injected dynamically so HTML structure stays unchanged.
 */
export class NotificationSettings {
  constructor({ onChange, onTestSound, onRequestBrowserPermission, onPushEnabled, onCheckUpdates }) {
    this.onChange = onChange ?? (() => {});
    this.onTestSound = onTestSound ?? (() => {});
    this.onRequestBrowserPermission = onRequestBrowserPermission ?? (() => {});
    this.onPushEnabled = onPushEnabled ?? (() => {});
    this.onCheckUpdates = onCheckUpdates ?? (() => {});

    this.el = document.getElementById("notification-settings-panel");
    this.soundSelect = document.getElementById("notify-settings-sound");
    this.volumeInput = document.getElementById("notify-settings-volume");
    this.volumeLabel = document.getElementById("notify-settings-volume-label");
    this.statusEl = document.getElementById("notify-settings-status");

    this._extrasBuilt = false;
    this._accountBuilt = false;
    this.usernameInput = null;
    this.welcomeEl = null;
    this.eventSoundSelects = {};
    this.quietHoursToggle = null;
    this.quietHoursStartInput = null;
    this.quietHoursEndInput = null;
    this.themeSelect = null;

    this._bind();
    this._populateSounds();
    this._ensureAccountSection();
    this._ensureExtras();
    this._ensurePermissionWarningUi();
    this._organizeIntoSections();

    document.getElementById("btn-top-settings")?.addEventListener("click", () => this.open());
  }

  /**
   * Reorganize the flat dialog into a real Settings page: collapsible groups
   * (Account · Appearance · Notifications & alarms · Privacy & data · About).
   * Reparents the already-built controls (keeps their listeners) and adds the
   * account/privacy actions.
   */
  _organizeIntoSections() {
    const container = this._getDialogContainer();
    if (!container || this._sectionsBuilt) return;
    const header = container.querySelector(".notification-settings-header");

    const group = (title, id) => {
      const d = document.createElement("details");
      d.className = "settings-group";
      d.id = id;
      d.open = true;
      d.innerHTML = `<summary class="settings-group__summary">${title}</summary>`;
      const body = document.createElement("div");
      body.className = "settings-group__body";
      d.appendChild(body);
      d._body = body;
      return d;
    };
    const move = (el, group) => {
      if (el && group) group._body.appendChild(el);
    };

    const gAccount = group("Account &amp; profile", "settings-group-account");
    const gAppearance = group("Appearance", "settings-group-appearance");
    const gNotify = group("Notifications &amp; alarms", "settings-group-notify");
    const gPrivacy = group("Privacy &amp; data", "settings-group-privacy");
    const gAbout = group("About", "settings-group-about");

    const q = (sel) => container.querySelector(sel);

    // Account
    move(q(".notification-settings-account"), gAccount);
    gAccount._body.appendChild(this._buildAccountActions());

    // Appearance
    move(q(".notification-settings-extra-section--appearance"), gAppearance);
    move(q(".notification-settings-extra-section--theme"), gAppearance);
    move(q(".notification-settings-extra-section--monthphoto"), gAppearance);

    // Notifications & alarms — the static controls + injected sound/quiet/push.
    move(q('label[for="notify-settings-sound"]'), gNotify);
    move(q("#notify-settings-sound"), gNotify);
    move(q('label[for="notify-settings-volume"]'), gNotify);
    move(q("#notify-settings-volume"), gNotify);
    move(q("#btn-notify-test-sound"), gNotify);
    container.querySelectorAll(".notification-toggles").forEach((fs) => move(fs, gNotify));
    move(q("#btn-notify-settings-browser"), gNotify);
    move(q(".notification-settings-extra-section--sound-by-type"), gNotify);
    move(q(".notification-settings-extra-section--sound-preview"), gNotify);
    move(q(".notification-settings-extra-section--quiet-hours"), gNotify);
    move(q(".notification-settings-extra-section--push"), gNotify);

    // Privacy & data
    gPrivacy._body.appendChild(this._buildPrivacyActions());
    move(q("#btn-notify-clear-history"), gPrivacy);

    // About (version / updates / credits)
    move(q(".notification-settings-extra-section--about"), gAbout);

    // Drop the leftover empty action row + status, re-add status at the very end.
    container.querySelectorAll(".action-row").forEach((r) => {
      if (!r.children.length) r.remove();
    });
    const status = q("#notify-settings-status");

    // Remove the now-empty extras wrapper if present.
    const extras = q(".notification-settings-extra");

    for (const g of [gAccount, gAppearance, gNotify, gPrivacy, gAbout]) {
      container.insertBefore(g, status || null);
    }
    if (extras && !extras.children.length) extras.remove();
    if (status) container.appendChild(status);

    this._sectionsBuilt = true;
  }

  /** Email display + Sign out + password reset, appended to the Account group. */
  _buildAccountActions() {
    const wrap = document.createElement("div");
    wrap.className = "settings-account-actions";
    const session = getSession();
    const signedIn = Boolean(session?.token);
    wrap.innerHTML = `
      <div class="settings-actions-row">
        <button type="button" class="btn-outline" data-action="change-password" ${signedIn ? "" : "disabled"}>Email me a password reset</button>
        <button type="button" class="btn-ghost" data-action="sign-out" ${signedIn ? "" : "disabled"}>Sign out</button>
      </div>
      <p class="settings-actions-hint">${signedIn ? "" : "Sign in to manage your account."}</p>
    `;
    wrap.querySelector('[data-action="sign-out"]')?.addEventListener("click", () => {
      clearSession();
      window.location.href = "/login.html";
    });
    wrap.querySelector('[data-action="change-password"]')?.addEventListener("click", async (e) => {
      const email = getSession()?.email;
      if (!email) return;
      const hint = wrap.querySelector(".settings-actions-hint");
      e.target.disabled = true;
      if (hint) hint.textContent = "Sending…";
      try {
        await apiFetch("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
          timeoutMs: 12000
        });
        if (hint) hint.textContent = `Reset link sent to ${email}.`;
      } catch {
        if (hint) hint.textContent = "Couldn't send right now. Try again later.";
      } finally {
        e.target.disabled = false;
      }
    });
    return wrap;
  }

  /** Per-month backdrop photo uploader (Appearance group). */
  _buildMonthPhotoSection() {
    const MONTHS = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    const section = document.createElement("section");
    section.className = "notification-settings-extra-section notification-settings-extra-section--monthphoto";
    section.innerHTML = `
      <h4 class="notification-settings-extra-title">Month backdrop photo</h4>
      <p class="notification-settings-extra-help">Replace a month's picture with your own. It's reused across the year, month, week, and day views for that month.</p>
      <div class="settings-actions-row" style="align-items:center;">
        <select data-mp-month aria-label="Month"></select>
        <img data-mp-thumb alt="" style="width:54px;height:36px;object-fit:cover;border-radius:6px;border:1px solid rgba(148,163,184,0.3);display:none;" />
      </div>
      <div class="settings-actions-row">
        <button type="button" class="btn-outline" data-mp-upload>Upload photo</button>
        <button type="button" class="btn-ghost" data-mp-reset>Use default</button>
      </div>
      <input type="file" accept="image/*" data-mp-file hidden />
      <p class="settings-actions-hint" data-mp-status></p>
    `;
    const monthSel = section.querySelector("[data-mp-month]");
    for (let i = 0; i < 12; i++) {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = MONTHS[i];
      monthSel.appendChild(o);
    }
    monthSel.value = String(new Date().getMonth());
    const fileInput = section.querySelector("[data-mp-file]");
    const thumb = section.querySelector("[data-mp-thumb]");
    const status = section.querySelector("[data-mp-status]");
    const sync = () => {
      const mi = Number(monthSel.value);
      const url = getMonthPhoto(mi);
      if (url) { thumb.src = url; thumb.style.display = ""; } else { thumb.removeAttribute("src"); thumb.style.display = "none"; }
      status.textContent = url ? "Custom photo set." : "Using the default picture.";
    };
    monthSel.addEventListener("change", sync);
    section.querySelector("[data-mp-upload]").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      status.textContent = "Saving…";
      const res = await setMonthPhotoFromFile(Number(monthSel.value), file);
      if (res.ok) sync();
      else status.textContent = res.reason === "too-large"
        ? "That image is too large to store. Try a smaller photo."
        : "Couldn't use that image.";
    });
    section.querySelector("[data-mp-reset]").addEventListener("click", () => {
      removeMonthPhoto(Number(monthSel.value));
      sync();
    });
    sync();
    return section;
  }

  /** Export / clear data + analytics opt-out, appended to the Privacy group. */
  _buildPrivacyActions() {
    const wrap = document.createElement("div");
    wrap.className = "settings-privacy-actions";
    const optedOut = localStorage.getItem("skipgc") === "t";
    wrap.innerHTML = `
      <div class="settings-actions-row">
        <button type="button" class="btn-outline" data-action="export">Export my data</button>
        <button type="button" class="btn-ghost" data-action="clear-local">Clear local data…</button>
      </div>
      <label class="toggle-row"><input type="checkbox" data-action="analytics" ${optedOut ? "" : "checked"} /> Anonymous usage analytics</label>
      <p class="settings-actions-hint" data-privacy-hint></p>
    `;
    const hint = wrap.querySelector("[data-privacy-hint]");
    wrap.querySelector('[data-action="export"]')?.addEventListener("click", () => {
      try {
        const bundle = collectLocalBundle();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `inkling-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (hint) hint.textContent = "Downloaded your data as JSON.";
      } catch {
        if (hint) hint.textContent = "Export failed.";
      }
    });
    wrap.querySelector('[data-action="clear-local"]')?.addEventListener("click", () => {
      if (!confirm("Clear all Inkling data stored on this device (calendar, notes, settings)? Synced accounts keep their cloud copy. This cannot be undone.")) return;
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /^(calendar3d|notebookcalender|inkling)/i.test(k)) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
        import("../../inkling/mind/index.js")
          .then((m) => m.clearMind())
          .catch(() => {})
          .finally(() => window.location.reload());
      } catch {
        if (hint) hint.textContent = "Couldn't clear local data.";
      }
    });
    wrap.querySelector('[data-action="analytics"]')?.addEventListener("change", (e) => {
      if (e.target.checked) localStorage.removeItem("skipgc");
      else localStorage.setItem("skipgc", "t");
      if (hint) hint.textContent = e.target.checked ? "Analytics on." : "Analytics off (takes effect on next load).";
    });
    return wrap;
  }

  _ensureAccountSection() {
    const container = this._getDialogContainer();
    if (!container || this._accountBuilt) return;

    const header = container.querySelector(".notification-settings-header");
    const section = document.createElement("section");
    section.className = "notification-settings-account";
    section.innerHTML = `
      <p class="notification-settings-account-email" data-account-email></p>
      <label for="inkling-username">Display name</label>
      <input type="text" id="inkling-username" class="notification-settings-username" placeholder="What should Inkling call you?" autocomplete="nickname" />
    `;

    if (header?.nextSibling) {
      container.insertBefore(section, header.nextSibling);
    } else {
      container.prepend(section);
    }

    this.usernameInput = section.querySelector("#inkling-username");
    this.welcomeEl = section.querySelector("[data-inkling-welcome]");

    this.usernameInput?.addEventListener("change", () => {
      setUsername(this.usernameInput.value);
      this._refreshAccountSection();
    });
    this.usernameInput?.addEventListener("blur", () => {
      setUsername(this.usernameInput.value);
      this._refreshAccountSection();
    });

    this._accountBuilt = true;
    this._refreshAccountSection();
  }

  _refreshAccountSection() {
    const session = getSession();
    const email = session?.email ?? "";
    const emailEl = this.el?.querySelector("[data-account-email]");
    if (emailEl) {
      emailEl.textContent = email ? `Signed in as ${email}` : "Not signed in";
    }
    if (this.usernameInput) this.usernameInput.value = getUsername();
    if (this.welcomeEl) {
      const sessionUser = session?.user;
      const name = sessionUser ? displayNameForUser(sessionUser) : getDisplayName(email);
      this.welcomeEl.textContent = getInklingWelcomeMessage(name);
    }
  }

  _ensurePermissionWarningUi() {
    if (!this.el) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") {
      this._showPermissionBlockedMessage();
    }
  }

  _showPermissionBlockedMessage() {
    if (!this.el) return;
    if (this.el.querySelector(".notify-permission-blocked")) return;

    const msg = document.createElement("div");
    msg.className = "notify-permission-blocked";
    msg.textContent = "Notifications are blocked in your browser settings.";

    const fixBtn = document.createElement("button");
    fixBtn.type = "button";
    fixBtn.className = "btn-ghost notify-permission-fix-btn";
    fixBtn.textContent = "Fix Permissions";
    fixBtn.onclick = () => {
      window.open("chrome://settings/content/notifications");
    };

    msg.appendChild(document.createTextNode(" "));
    msg.appendChild(fixBtn);

    const container = this._getDialogContainer();
    container.appendChild(msg);
  }

  _populateSounds() {
    if (!this.soundSelect) return;
    this.soundSelect.innerHTML = "";
    for (const theme of ALL_THEMES) {
      const opt = document.createElement("option");
      opt.value = theme.id;
      opt.textContent = theme.label;
      this.soundSelect.appendChild(opt);
    }
  }

  /** Dialog body — status and form controls live here, not on the outer panel. */
  _getDialogContainer() {
    return this.el?.querySelector(".notification-settings-dialog") ?? this.el;
  }

  _ensureExtras() {
    const container = this._getDialogContainer();

    if (!container || this._extrasBuilt) return;

    const insertPoint =
      this.statusEl && this.statusEl.parentNode === container ? this.statusEl : null;

    const extras = document.createElement("div");
    extras.className = "notification-settings-extra";

    const appearanceSection = document.createElement("section");
    appearanceSection.className =
      "notification-settings-extra-section notification-settings-extra-section--appearance";
    appearanceSection.innerHTML = `
      <h4 class="notification-settings-extra-title">Color style</h4>
      <p class="notification-settings-extra-help">Feminine, masculine, or neutral accents — pink clock &amp; atomic WordWeaver notes in Feminine.</p>
      <div class="appearance-palette-picker-mount" data-appearance-picker></div>
    `;

    const appearanceMount = appearanceSection.querySelector("[data-appearance-picker]");
    if (appearanceMount) {
      const s0 = loadNotificationSettings();
      this._appearancePicker = renderAppearancePalettePicker(appearanceMount, {
        selectedId: s0.appearancePalette ?? "neutral",
        onSelect: (id) => {
          setAppearancePalette(id);
          this.onChange();
        }
      });
    }

    const themeSection = document.createElement("section");
    themeSection.className =
      "notification-settings-extra-section notification-settings-extra-section--theme";
    themeSection.innerHTML = `
      <h4 class="notification-settings-extra-title">${iconSettings} Light &amp; dark</h4>
      <p class="notification-settings-extra-help">Choose light, dark, or follow your system preference.</p>
      <label class="notification-theme-label" for="notify-settings-theme">Theme</label>
      <select id="notify-settings-theme" class="notification-theme-select"></select>
    `;

    const themeSelect = themeSection.querySelector("#notify-settings-theme");
    this.themeSelect = themeSelect;


    if (themeSelect) {
      const opts = [
        { value: "auto", label: "Auto (system)" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" }
      ];
      for (const o of opts) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        themeSelect.appendChild(opt);
      }

      themeSelect.addEventListener("change", () => {

        saveNotificationSettings({ theme: themeSelect.value });
        this.onChange();
      });
    }

    const soundByTypeSection = document.createElement("section");
    soundByTypeSection.className =
      "notification-settings-extra-section notification-settings-extra-section--sound-by-type";
    soundByTypeSection.innerHTML = `
      <h4 class="notification-settings-extra-title">Sound per event type</h4>
      <p class="notification-settings-extra-help">Pick a gentle tone for each event kind. Visual alerts are unaffected.</p>
      <div class="notification-sound-by-type-grid"></div>
    `;

    const soundByTypeGrid = soundByTypeSection.querySelector(
      ".notification-sound-by-type-grid"
    );

    for (const t of EVENT_TYPES) {
      const row = document.createElement("div");
      row.className = "notification-sound-by-type-row";

      const label = document.createElement("label");
      label.className = "notification-sound-by-type-label";
      label.textContent = t.label;

      const select = document.createElement("select");
      select.className = "notification-sound-by-type-select";
      select.setAttribute("aria-label", `Sound for ${t.label}`);

      for (const theme of ALL_THEMES) {
        const opt = document.createElement("option");
        opt.value = theme.id;
        opt.textContent = theme.label;
        select.appendChild(opt);
      }

      select.addEventListener("change", () => {
        const s = loadNotificationSettings();
        const next = {
          ...(s.soundByEventType ?? {}),
          [t.key]: select.value
        };
        saveNotificationSettings({ soundByEventType: next });
        this.onChange();
      });

      this.eventSoundSelects[t.key] = select;

      row.appendChild(label);
      row.appendChild(select);
      soundByTypeGrid.appendChild(row);
    }

    const previewSection = document.createElement("section");
    previewSection.className =
      "notification-settings-extra-section notification-settings-extra-section--sound-preview";
    previewSection.innerHTML = `
      <h4 class="notification-settings-extra-title">Preview tones</h4>
      <p class="notification-settings-extra-help">Sounds are short and gentle. They may be muted during quiet hours.</p>
      <div class="notification-sound-preview-grid"></div>
    `;

    const previewGrid = previewSection.querySelector(".notification-sound-preview-grid");
    for (const theme of ALL_THEMES) {
      const card = document.createElement("div");
      card.className = "notification-sound-preview-card";

      const name = document.createElement("div");
      name.className = "notification-sound-preview-name";
      name.textContent = theme.label;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notification-sound-preview-btn";
      btn.textContent = "Preview";
      btn.addEventListener("click", () => this.onTestSound(theme.id));

      card.appendChild(name);
      card.appendChild(btn);
      previewGrid.appendChild(card);
    }

    const quietSection = document.createElement("section");
    quietSection.className =
      "notification-settings-extra-section notification-settings-extra-section--quiet-hours";
    quietSection.innerHTML = `
      <h4 class="notification-settings-extra-title">Quiet hours</h4>
      <label class="notification-quiet-row">
        <input type="checkbox" class="notification-quiet-toggle" />
        <span>Mute all sounds between</span>
      </label>
      <div class="notification-quiet-range">
        <div class="notification-quiet-field">
          <label>Start</label>
          <input type="time" class="notification-quiet-time" data-which="start" />
        </div>
        <div class="notification-quiet-field">
          <label>End</label>
          <input type="time" class="notification-quiet-time" data-which="end" />
        </div>
      </div>
      <p class="notification-settings-extra-help notification-settings-extra-help--quiet">
        Visual notifications still appear. Enter time in your local timezone.
      </p>
    `;

    const pushSection = document.createElement("section");
    pushSection.className =
      "notification-settings-extra-section notification-settings-extra-section--push";
    pushSection.innerHTML = `
      <h4 class="notification-settings-extra-title">Alarms when the app is closed</h4>
      <p class="notification-settings-extra-help">
        Web Push delivers alarms to this device even when Inkling isn't open.
        Requires being signed in and allowing notifications.
      </p>
      <label class="notification-quiet-row">
        <input type="checkbox" class="notification-push-toggle" data-push-toggle />
        <span>Send alarms to this device (web push)</span>
      </label>
      <div class="settings-actions-row">
        <button type="button" class="btn-outline notification-banner-test" data-banner-test>Test notification banner</button>
        <button type="button" class="btn-ghost notification-push-test" data-push-test>Send test alarm (closed-app)</button>
      </div>
      <p class="notification-settings-extra-help notification-push-status" data-push-status role="status"></p>
    `;

    this.pushToggle = pushSection.querySelector("[data-push-toggle]");
    this.pushTestBtn = pushSection.querySelector("[data-push-test]");
    this.bannerTestBtn = pushSection.querySelector("[data-banner-test]");
    this.pushStatusEl = pushSection.querySelector("[data-push-status]");

    this.bannerTestBtn?.addEventListener("click", async () => {
      this._setPushStatus("Requesting permission…");
      const res = await showLocalNotification("Inkling", {
        body: "🔔 This is how your alarms and reminders will appear.",
        kind: "reminder",
        requestPermission: true
      });
      if (res.ok) {
        this._setPushStatus("Sent — check your notification shade. If nothing appears, allow notifications for Inkling in your phone's app settings.");
      } else if (res.reason === "denied") {
        this._setPushStatus("Notifications are blocked. Enable them for Inkling in your phone/browser settings, then retry.");
      } else if (res.reason === "unsupported") {
        this._setPushStatus("This browser can't show notifications. On iPhone, install Inkling to your Home Screen first.");
      } else {
        this._setPushStatus("Permission not granted yet — tap again and choose Allow.");
      }
    });

    if (!isPushSupported()) {
      if (this.pushToggle) this.pushToggle.disabled = true;
      if (this.pushTestBtn) this.pushTestBtn.disabled = true;
      this._setPushStatus("Web push isn't supported in this browser. On iPhone, install Inkling to your Home Screen first.");
    }

    this.pushToggle?.addEventListener("change", async () => {
      if (this.pushToggle.checked) {
        this._setPushStatus("Enabling…");
        const res = await enablePush();
        if (res.ok) {
          this._setPushStatus("On — alarms will reach this device when the app is closed.");
          this.onPushEnabled?.();
        } else {
          this.pushToggle.checked = false;
          this._setPushStatus(this._pushError(res.reason));
        }
      } else {
        await disablePush();
        this._setPushStatus("Off — alarms only show while the app is open.");
      }
    });

    this.pushTestBtn?.addEventListener("click", async () => {
      if (!isPushEnabledLocally()) {
        this._setPushStatus("Turn on web push first, then test.");
        return;
      }
      this._setPushStatus("Sending test…");
      const res = await sendTestPush();
      this._setPushStatus(
        res.ok ? "Test sent — you should see a notification shortly." : "Test failed. Re-enable web push and try again."
      );
    });

    const buildTag = (typeof window !== "undefined" && window.__INKLING_RUNTIME__?.buildTag) || "dev";
    const aboutSection = document.createElement("section");
    aboutSection.className =
      "notification-settings-extra-section notification-settings-extra-section--about";
    aboutSection.innerHTML = `
      <h4 class="notification-settings-extra-title">App updates</h4>
      <p class="notification-settings-extra-help">
        Inkling updates itself — when a new version is ready you'll see an
        "Update available" banner. No need to reinstall.
      </p>
      <p class="notification-settings-extra-help">Version: <span data-app-version>${buildTag}</span></p>
      <button type="button" class="btn-ghost notification-update-check" data-check-updates>Check for updates</button>
      <h4 class="notification-settings-extra-title" style="margin-top:14px;">About</h4>
      <p class="notification-settings-extra-help">
        Idle backdrop: star cluster Pismis 24 (James Webb Space Telescope).
        Image credit: NASA, ESA, CSA, STScI.
      </p>
    `;
    aboutSection
      .querySelector("[data-check-updates]")
      ?.addEventListener("click", () => this.onCheckUpdates());

    extras.appendChild(soundByTypeSection);
    extras.appendChild(previewSection);
    extras.appendChild(quietSection);
    extras.appendChild(pushSection);
    extras.appendChild(aboutSection);
    extras.insertBefore(this._buildMonthPhotoSection(), extras.firstChild);
    extras.insertBefore(themeSection, extras.firstChild);
    extras.insertBefore(appearanceSection, extras.firstChild);

    if (insertPoint) {
      container.insertBefore(extras, insertPoint);
    } else {
      container.appendChild(extras);
    }

    this.quietHoursToggle = quietSection.querySelector(".notification-quiet-toggle");
    this.quietHoursStartInput = quietSection.querySelector(
      ".notification-quiet-time[data-which='start']"
    );
    this.quietHoursEndInput = quietSection.querySelector(
      ".notification-quiet-time[data-which='end']"
    );

    this.quietHoursToggle?.addEventListener("change", () => {
      const enabled = Boolean(this.quietHoursToggle.checked);
      const { startH, endH } = this._getQuietHoursFromInputs();
      saveNotificationSettings({
        enableQuietHours: enabled,
        quietHoursStart: startH,
        quietHoursEnd: endH
      });
      this._syncQuietInputsEnabled(enabled);
      this.onChange();
    });

    for (const input of [this.quietHoursStartInput, this.quietHoursEndInput]) {
      input?.addEventListener("change", () => {
        const { startH, endH } = this._getQuietHoursFromInputs();
        const s = loadNotificationSettings();
        saveNotificationSettings({
          enableQuietHours: Boolean(s.enableQuietHours),
          quietHoursStart: startH,
          quietHoursEnd: endH
        });
        this.onChange();
      });
    }

    this._extrasBuilt = true;
  }

  _getQuietHoursFromInputs() {
    const startVal = this.quietHoursStartInput?.value ?? "22:00";
    const endVal = this.quietHoursEndInput?.value ?? "07:00";
    return {
      startH: parseInt(startVal.slice(0, 2), 10) || 0,
      endH: parseInt(endVal.slice(0, 2), 10) || 0
    };
  }

  _syncQuietInputsEnabled(enabled) {
    if (this.quietHoursStartInput) this.quietHoursStartInput.disabled = !enabled;
    if (this.quietHoursEndInput) this.quietHoursEndInput.disabled = !enabled;
  }

  _bind() {
    document.getElementById("btn-notification-settings-close")?.addEventListener("click", () => {
      this.close();
    });

    document.getElementById("btn-notification-settings-backdrop")?.addEventListener("click", () => {
      this.close();
    });

    document.getElementById("btn-notify-test-sound")?.addEventListener("click", () => {
      const themeId = this.soundSelect?.value ?? "softChime";
      this.onTestSound(themeId);
    });

    document.getElementById("btn-notify-clear-history")?.addEventListener("click", () => {
      if (confirm("Clear all notification history?")) {
        clearNotificationHistory();
        this._showStatus("History cleared.");
        this.onChange();
      }
    });

    document
      .getElementById("btn-notify-settings-browser")
      ?.addEventListener("click", async () => {
        const result = await this.onRequestBrowserPermission();
        this._showStatus(
          result === "granted"
            ? "Browser notifications enabled."
            : result === "denied"
              ? "Blocked in browser settings."
              : "Permission not granted."
        );
      });

    const toggles = [
      ["notify-toggle-soft", "enableSoft"],
      ["notify-toggle-medium", "enableMedium"],
      ["notify-toggle-urgent", "enableUrgent"],
      ["notify-toggle-final", "enableFinal"],
      ["notify-toggle-browser", "enableBrowser"],
      ["notify-toggle-sounds", "enableSounds"]
    ];

    for (const [id, key] of toggles) {
      document.getElementById(id)?.addEventListener("change", (e) => {
        saveNotificationSettings({ [key]: e.target.checked });
        this.onChange();
      });
    }

    this.soundSelect?.addEventListener("change", () => {
      saveNotificationSettings({ defaultSound: this.soundSelect.value });
      this.onChange();
    });

    this.volumeInput?.addEventListener("input", () => {
      const vol = Number(this.volumeInput.value);
      if (this.volumeLabel) this.volumeLabel.textContent = `${Math.round(vol * 100)}%`;
      saveNotificationSettings({ volume: vol });
      this.onChange();
    });
  }

  open() {
    this._refreshAccountSection();
    this.refresh();
    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
  }

  close() {
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
  }

  refresh() {
    const s = loadNotificationSettings();
    this._refreshAccountSection();

    if (this.soundSelect) this.soundSelect.value = s.defaultSound ?? "softChime";

    if (this.volumeInput) {
      this.volumeInput.value = String(s.volume ?? 0.45);
      if (this.volumeLabel) this.volumeLabel.textContent = `${Math.round((s.volume ?? 0.45) * 100)}%`;
    }

    this._setChecked("notify-toggle-soft", s.enableSoft);
    this._setChecked("notify-toggle-medium", s.enableMedium);
    this._setChecked("notify-toggle-urgent", s.enableUrgent);
    this._setChecked("notify-toggle-final", s.enableFinal);
    this._setChecked("notify-toggle-browser", s.enableBrowser);
    this._setChecked("notify-toggle-sounds", s.enableSounds);

    this._refreshExtras();
  }

  _refreshExtras() {
    const s = loadNotificationSettings();

    const byType = s.soundByEventType ?? {};
    const fallback = s.defaultSound ?? "softChime";
    for (const t of EVENT_TYPES) {
      const sel = this.eventSoundSelects[t.key];
      if (!sel) continue;
      sel.value = byType[t.key] ?? fallback;
    }

    const enabled = Boolean(s.enableQuietHours);
    if (this.quietHoursToggle) this.quietHoursToggle.checked = enabled;

    const startH = Number.isFinite(Number(s.quietHoursStart)) ? Number(s.quietHoursStart) : 22;
    const endH = Number.isFinite(Number(s.quietHoursEnd)) ? Number(s.quietHoursEnd) : 7;

    if (this.quietHoursStartInput) this.quietHoursStartInput.value = `${String(startH).padStart(2, "0")}:00`;
    if (this.quietHoursEndInput) this.quietHoursEndInput.value = `${String(endH).padStart(2, "0")}:00`;
    this._syncQuietInputsEnabled(enabled);

    if (this.themeSelect) {
      this.themeSelect.value = s.theme ?? "auto";
    }

    this._appearancePicker?.setSelected(s.appearancePalette ?? "neutral");

    if (this.pushToggle && isPushSupported()) {
      this.pushToggle.checked = isPushEnabledLocally();
    }
  }

  _setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
  }

  _showStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  _setPushStatus(msg) {
    if (this.pushStatusEl) this.pushStatusEl.textContent = msg;
  }

  _pushError(reason) {
    switch (reason) {
      case "signed-out":
        return "Sign in to enable alarms when the app is closed.";
      case "denied":
        return "Notifications are blocked. Allow them in your browser settings.";
      case "unsupported":
        return "Web push isn't supported in this browser.";
      default:
        return "Couldn't enable web push. Try again.";
    }
  }
}
