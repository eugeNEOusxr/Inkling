import {
  formatNotificationTime,
  getTypeIcon,
  getLevelClass,
  appendNotificationHistory
} from "../notifications/notificationFeed.js";
import {
  formatCountdown,
  markDropdownItemRead,
  snoozeDropdownItem,
  getPreferredSnoozeDuration,
  setPreferredSnoozeDuration,
  snoozeLabel
} from "../notifications/NotificationService.js";
import { parseDate } from "../calendarState.js";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const TYPE_ORDER = ["reminder", "alarm", "appointment", "note"];

const GROUP_LABELS = {
  reminder: "Reminders",
  alarm: "Alarms",
  appointment: "Appointments",
  note: "Notes"
};

/**
 * Bell dropdown — grouped upcoming feed with countdown, read, snooze.
 */
export class NotificationDropdown {
  constructor({ onSelect, onOpenWall, onOpenSettings }) {
    this.onSelect = onSelect ?? (() => {});
    this.onOpenWall = onOpenWall ?? (() => {});
    this.onOpenSettings = onOpenSettings ?? (() => {});

    this.root = document.getElementById("notification-dropdown");
    this.btn = document.getElementById("btn-notification-bell");
    this.menu = document.getElementById("notification-dropdown-menu");
    this.listEl = document.getElementById("notification-dropdown-list");
    this.badgeEl = document.getElementById("notification-badge");
    this.emptyEl = document.getElementById("notification-dropdown-empty");

    this._open = false;
    this._items = [];
    this._countdownTimer = null;

    this.btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    document.getElementById("btn-open-notification-wall")?.addEventListener("click", () => {

      this.close();
      this.onOpenWall();
    });

    const openSettings = () => {
      this.close();
      this.onOpenSettings();
    };
    document.getElementById("btn-open-notification-settings")?.addEventListener("click", () => {

      openSettings();
    });

    document.addEventListener("click", (e) => {
      if (!this._open) return;
      if (this.root?.contains(e.target)) return;
      this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  open() {
    this._open = true;
    this.menu?.classList.remove("hidden");
    this.btn?.setAttribute("aria-expanded", "true");
    this._startCountdownTimer();
    this._updateCountdowns();
  }

  close() {
    this._open = false;
    this.menu?.classList.add("hidden");
    this.btn?.setAttribute("aria-expanded", "false");
    this._stopCountdownTimer();
  }

  /**
   * @param {import("../notifications/notificationFeed.js").NotificationItem[]} items
   */
  setItems(items) {
    this._items = items ?? [];
    this._updateBadge();
    this._render();
    if (this._open) this._updateCountdowns();
  }

  _updateBadge() {
    const unread = this._items.filter(
      (i) => i.status !== "past" && !i.isRead
    );
    if (this.badgeEl) {
      const count = unread.length;
      this.badgeEl.textContent = count > 99 ? "99+" : String(count);
      this.badgeEl.classList.toggle("hidden", count === 0);
    }
  }

  _upcomingItems() {
    const now = Date.now();
    return this._items
      .filter((i) => i.status !== "past" || i.triggerAt >= now - 60_000)
      .sort((a, b) => a.triggerAt - b.triggerAt);
  }

  _historyItems() {
    const now = Date.now();
    return this._items
      .filter((i) => i.status === "past" && i.triggerAt < now - 60_000)
      .sort((a, b) => b.triggerAt - a.triggerAt);
  }

  _groupByType(items) {
    /** @type {Record<string, typeof items>} */
    const groups = {};
    for (const item of items) {
      const key = item.type || "reminder";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }

  _render() {
    if (!this.listEl) return;
    const upcoming = this._upcomingItems();
    const history = this._historyItems();

    if (upcoming.length === 0 && history.length === 0) {
      this.listEl.innerHTML = "";
      this.emptyEl?.classList.remove("hidden");
      return;
    }

    this.emptyEl?.classList.add("hidden");
    this.listEl.innerHTML = "";

    this._appendGroupedSection(this.listEl, "Upcoming", upcoming);
    if (history.length > 0) {
      this._appendGroupedSection(this.listEl, "Recent (read back anytime)", history);
    }
  }

  _appendGroupedSection(parent, sectionTitle, items) {
    const wrap = document.createElement("section");
    wrap.className = "notification-dropdown-section";
    wrap.innerHTML = `<h3 class="notification-dropdown-section-title">${sectionTitle}</h3>`;

    const grouped = this._groupByType(items);
    for (const type of TYPE_ORDER) {
      const groupItems = grouped[type];
      if (!groupItems?.length) continue;

      const section = document.createElement("section");
      section.className = "notification-dropdown-group";
      section.innerHTML = `
        <h4 class="notification-dropdown-group-title">
          <span class="notification-dropdown-group-icon">${getTypeIcon(type)}</span>
          ${GROUP_LABELS[type] ?? type}
          <span class="notification-dropdown-group-count">${groupItems.length}</span>
        </h4>
      `;

      const list = document.createElement("div");
      list.className = "notification-dropdown-group-list";
      for (const item of groupItems) {
        list.appendChild(this._createRow(item));
      }
      section.appendChild(list);
      wrap.appendChild(section);
    }
    parent.appendChild(wrap);
  }

  /**
   * @param {import("../notifications/notificationFeed.js").NotificationItem & { isRead?: boolean }} item
   */
  _createRow(item) {
    const row = document.createElement("article");
    row.className = [
      "notification-dropdown-item",
      getLevelClass(item.level),
      item.isRead ? "is-read" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const { month, day } = parseDate(item.date);
    const dayLabel = `${MONTH_NAMES[month - 1]} ${day}`;
    const typeLabel = formatTypeLabel(item.type);
    const now = Date.now();
    const prefSnooze = getPreferredSnoozeDuration();

    row.innerHTML = `
      <button type="button" class="notification-dropdown-item-main">
        <span class="notification-dropdown-icon" aria-hidden="true">${getTypeIcon(item.type)}</span>
        <span class="notification-dropdown-body">
          <span class="notification-dropdown-meta">
            <span class="notification-dropdown-countdown" data-trigger-at="${item.triggerAt}">${formatCountdown(item.triggerAt, now)}</span>
            <span class="notification-dropdown-time">${formatNotificationTime(item.triggerAt)}</span>
            <span class="notification-dropdown-type">${typeLabel}</span>
            <span class="notification-dropdown-day">${dayLabel}</span>
          </span>
          <span class="notification-dropdown-msg">${escapeHtml(item.message || item.title)}</span>
        </span>
      </button>
      <div class="notification-dropdown-actions">
        <div class="notification-dropdown-snooze-wrap">
          <button type="button" class="notification-dropdown-action-btn" data-action="snooze" title="Snooze now">
            Snooze ${snoozeLabel(prefSnooze)}
          </button>
          <button type="button" class="notification-dropdown-action-btn notification-dropdown-snooze-set" data-action="snooze-set" title="Set snooze interval" aria-label="Set snooze interval">▾</button>
          <div class="notification-dropdown-snooze-menu hidden">
            <button type="button" data-snooze="5m">5 min</button>
            <button type="button" data-snooze="10m">10 min</button>
            <button type="button" data-snooze="15m">15 min</button>
          </div>
        </div>
        <button type="button" class="notification-dropdown-action-btn" data-action="read" title="Mark as read"${item.isRead ? " disabled" : ""}>Read</button>
      </div>
    `;

    row.querySelector(".notification-dropdown-item-main")?.addEventListener("click", () => {
      appendNotificationHistory({
        sourceId: item.sourceId,
        type: item.type,
        level: item.level,
        triggerAt: item.triggerAt,
        date: item.date,
        dayId: item.dayId,
        hour: item.hour,
        message: item.message || item.title,
        title: item.title,
        wall: item.wall,
        firedAt: item.firedAt ?? Date.now()
      });
      markDropdownItemRead(item.id);
      this._notifyAction();
      this.close();
      this.onSelect({
        dayId: item.dayId,
        hour: item.hour,
        wall: item.wall,
        type: item.type
      });
    });

    const snoozeBtn = row.querySelector('[data-action="snooze"]');
    const snoozeMenu = row.querySelector(".notification-dropdown-snooze-menu");

    snoozeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      snoozeDropdownItem(item.id);
      this._notifyAction();
    });

    const snoozeSetBtn = row.querySelector("[data-action=snooze-set]");
    snoozeSetBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      snoozeMenu?.classList.toggle("hidden");
    });

    snoozeMenu?.querySelectorAll("[data-snooze]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dur = btn.getAttribute("data-snooze");
        if (dur === "5m" || dur === "10m" || dur === "15m") {
          setPreferredSnoozeDuration(dur);
          if (snoozeBtn) snoozeBtn.textContent = `Snooze ${snoozeLabel(dur)}`;
        }
        snoozeDropdownItem(item.id, dur);
        snoozeMenu?.classList.add("hidden");
        this._notifyAction();
      });
    });

    row.querySelector('[data-action="read"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.isRead) return;
      markDropdownItemRead(item.id);

      this._notifyAction();
    });

    return row;
  }

  _notifyAction() {
    document.dispatchEvent(new CustomEvent("calendar3d-dropdown-action"));
  }

  _startCountdownTimer() {
    this._stopCountdownTimer();
    this._countdownTimer = setInterval(() => this._updateCountdowns(), 1000);
  }

  _stopCountdownTimer() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  }

  _updateCountdowns() {
    if (!this.listEl) return;
    const now = Date.now();
    this.listEl.querySelectorAll(".notification-dropdown-countdown").forEach((el) => {
      const triggerAt = Number(el.getAttribute("data-trigger-at"));
      if (!triggerAt) return;
      el.textContent = formatCountdown(triggerAt, now);
      const urgent = triggerAt - now <= 5 * 60 * 1000;
      el.classList.toggle("is-urgent", urgent && triggerAt > now);
      el.classList.toggle("is-now", triggerAt <= now);
    });
  }
}

function formatTypeLabel(type) {
  const m = {
    reminder: "Reminder",
    alarm: "Alarm",
    appointment: "Appointment",
    note: "Note"
  };
  return m[type] ?? "Event";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
