/**
 * House detail panel — word, definition, example, date added.
 * @param {import('./wordCatalog.js').WordHouseEntry} entry
 */
export function openHousePanel(entry, onClose) {
  closeHousePanel();
  const panel = document.createElement("aside");
  panel.className = "ww-house-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", entry.word);
  panel.innerHTML = `
    <button type="button" class="ww-house-panel-close" aria-label="Close">×</button>
    <p class="ww-house-panel-hash">${escapeHtml(entry.hash || `#${entry.word}`)}</p>
    <h2 class="ww-house-panel-word">${escapeHtml(entry.word)}</h2>
    <dl class="ww-house-panel-meta">
      <dt>Definition</dt>
      <dd>${escapeHtml(entry.definition || "—")}</dd>
      <dt>Example</dt>
      <dd class="ww-house-panel-example">${escapeHtml(entry.example || "—")}</dd>
      <dt>Date added</dt>
      <dd>${escapeHtml(formatDate(entry.addedAt))}</dd>
    </dl>
  `;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("is-open"));

  const closeBtn = panel.querySelector(".ww-house-panel-close");
  closeBtn?.addEventListener("click", () => {
    closeHousePanel();
    onClose?.();
  });

  panel._wwEntry = entry;
  return panel;
}

export function closeHousePanel() {
  document.querySelectorAll(".ww-house-panel").forEach((p) => {
    p.classList.remove("is-open");
    setTimeout(() => p.remove(), 220);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return iso;
  }
}
