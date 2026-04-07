import { getState, upsertFeed, removeFeed, updateSettings } from "../lib/storage.js";

// --- Settings ---

async function loadSettings() {
  const { settings } = await getState();
  document.getElementById("updateOnStartup").checked = settings.updateOnStartup;
  document.getElementById("globalInterval").value = settings.globalIntervalMinutes || 0;
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  await updateSettings({
    updateOnStartup: document.getElementById("updateOnStartup").checked,
    globalIntervalMinutes: Number(document.getElementById("globalInterval").value) || 0
  });
  // Alarm update happens automatically via chrome.storage.onChanged in SW
  showStatus("settingsStatus", "Gespeichert!");
});

// --- Add Feed ---

document.getElementById("addBtn").addEventListener("click", async () => {
  const urlInput = document.getElementById("feedUrl");
  const url = urlInput.value.trim();
  if (!url) return;

  const id = crypto.randomUUID();
  await upsertFeed(id, {
    url,
    enabled: true,
    notify: true,
    intervalMinutes: 0,
    retentionDays: 30,
    bookmarkFolderId: "",
    lastFetch: 0,
    lastEtag: "",
    lastModified: "",
    seen: {}
  });

  urlInput.value = "";

  // Trigger immediate fetch for this feed
  try {
    await chrome.runtime.sendMessage({ action: "updateFeed", feedId: id });
  } catch (err) {
    console.warn("[RSS-BOOK] Could not trigger initial feed update:", err.message);
  }

  await renderFeeds();
});

// --- Feed List ---

async function renderFeeds() {
  const { feeds } = await getState();
  const list = document.getElementById("feedList");
  const feedArray = Object.values(feeds);

  if (feedArray.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Feeds abonniert.</div>';
    return;
  }

  list.innerHTML = "";
  for (const feed of feedArray) {
    const card = document.createElement("div");
    card.className = `feed-card${feed.enabled ? "" : " disabled"}`;
    card.innerHTML = `
      <div class="feed-header">
        <span class="feed-title">${escapeHtml(feed.title || feed.url)}</span>
        <button class="danger" data-action="remove" data-id="${feed.id}">Deabonnieren</button>
      </div>
      <div class="feed-url">${escapeHtml(feed.url)}</div>
      <div class="feed-controls">
        <label>
          <input type="checkbox" data-field="enabled" data-id="${feed.id}" ${feed.enabled ? "checked" : ""}>
          Aktiv
        </label>
        <label>
          <input type="checkbox" data-field="notify" data-id="${feed.id}" ${feed.notify ? "checked" : ""}>
          Benachrichtigung
        </label>
        <label>
          Intervall (Min):
          <input type="number" data-field="intervalMinutes" data-id="${feed.id}" value="${feed.intervalMinutes}" min="0">
        </label>
        <label>
          Behalten (Tage):
          <input type="number" data-field="retentionDays" data-id="${feed.id}" value="${feed.retentionDays}" min="0">
        </label>
      </div>
    `;

    // Event: field changes
    card.addEventListener("change", async (e) => {
      const field = e.target?.dataset?.field;
      const id = e.target?.dataset?.id;
      if (!field || !id) return;

      const value = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
      await upsertFeed(id, { [field]: value });
    });

    // Event: remove
    card.querySelector("[data-action='remove']").addEventListener("click", async () => {
      await removeFeed(feed.id);
      await renderFeeds();
    });

    list.appendChild(card);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showStatus(elementId, text) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 2000);
}

// --- Init ---

loadSettings();
renderFeeds();
