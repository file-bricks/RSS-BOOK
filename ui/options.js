import { getState, upsertFeed, removeFeed, updateSettings, getAllFeeds } from "../lib/storage.js";
import { generateOPML, parseOPML } from "../lib/opml.js";
import { exportFeedToFolder, exportAllFeedsToFolder } from "../lib/export.js";
import { t, applyI18n } from "../lib/i18n.js";

// --- Settings ---

async function loadSettings() {
  const { settings } = await getState();
  document.getElementById("updateOnStartup").checked = settings.updateOnStartup;
  document.getElementById("globalInterval").value = settings.globalIntervalMinutes || 0;
  document.getElementById("rootFolderName").value = settings.rootFolderName || "RSS";
  document.getElementById("deleteBookmarks").checked = settings.deleteBookmarksOnUnsubscribe || false;
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  await updateSettings({
    updateOnStartup: document.getElementById("updateOnStartup").checked,
    globalIntervalMinutes: Number(document.getElementById("globalInterval").value) || 0,
    rootFolderName: document.getElementById("rootFolderName").value.trim() || "RSS",
    deleteBookmarksOnUnsubscribe: document.getElementById("deleteBookmarks").checked
  });
  showStatus("settingsStatus", t("optionsSaved"));
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
    lastError: "",
    seen: {}
  });

  urlInput.value = "";

  try {
    await chrome.runtime.sendMessage({ action: "updateFeed", feedId: id });
  } catch (err) {
    console.warn("[RSS-BOOK] Could not trigger initial feed update:", err.message);
  }

  await renderFeeds();
});

// --- OPML Import ---

document.getElementById("importOPMLBtn").addEventListener("click", () => {
  document.getElementById("opmlFileInput").click();
});

document.getElementById("opmlFileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseOPML(text);
    if (parsed.length === 0) {
      showStatus("feedStatus", t("popupError", ["No feeds found in OPML"]), true);
      return;
    }

    let imported = 0;
    const { feeds } = await getState();
    const existingUrls = new Set(Object.values(feeds).map(f => f.url));

    for (const item of parsed) {
      if (existingUrls.has(item.url)) continue;

      const id = crypto.randomUUID();
      await upsertFeed(id, {
        url: item.url,
        title: item.title,
        enabled: true,
        notify: true,
        intervalMinutes: 0,
        retentionDays: 30,
        bookmarkFolderId: "",
        lastFetch: 0,
        lastEtag: "",
        lastModified: "",
        lastError: "",
        seen: {}
      });
      imported++;
    }

    showStatus("feedStatus", t("optionsOPMLImported", [String(imported)]));
    await renderFeeds();
  } catch (err) {
    showStatus("feedStatus", t("popupError", [err.message]), true);
  }

  e.target.value = "";
});

// --- OPML Export ---

document.getElementById("exportOPMLBtn").addEventListener("click", async () => {
  const feeds = await getAllFeeds();
  if (feeds.length === 0) return;

  const opml = generateOPML(feeds);
  const blob = new Blob([opml], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "rss-book-feeds.opml";
  a.click();
  URL.revokeObjectURL(url);

  showStatus("feedStatus", t("optionsOPMLExported"));
});

// --- Folder Export (all feeds) ---

document.getElementById("exportAllBtn").addEventListener("click", async () => {
  try {
    const feeds = await getAllFeeds();
    const count = await exportAllFeedsToFolder(feeds);
    showStatus("feedStatus", t("optionsExported", [String(count)]));
  } catch (err) {
    if (err.name === "AbortError") return;
    showStatus("feedStatus", t("popupError", [err.message]), true);
  }
});

// --- Feed List ---

async function renderFeeds() {
  const { feeds } = await getState();
  const list = document.getElementById("feedList");
  const feedArray = Object.values(feeds);

  if (feedArray.length === 0) {
    list.innerHTML = `<div class="empty">${t("optionsNoFeeds")}</div>`;
    return;
  }

  list.innerHTML = "";
  for (const feed of feedArray) {
    const card = document.createElement("div");
    card.className = `feed-card${feed.enabled ? "" : " disabled"}${feed.lastError ? " has-error" : ""}`;

    let errorHtml = "";
    if (feed.lastError) {
      errorHtml = `<div class="feed-error">${t("optionsFeedError", [escapeHtml(feed.lastError)])}</div>`;
    }

    card.innerHTML = `
      <div class="feed-header">
        <span class="feed-title">${escapeHtml(feed.title || feed.url)}</span>
        <button class="danger" data-action="remove" data-id="${feed.id}">${t("optionsUnsubscribe")}</button>
      </div>
      <div class="feed-url">${escapeHtml(feed.url)}</div>
      ${errorHtml}
      <div class="feed-controls">
        <label>
          <input type="checkbox" data-field="enabled" data-id="${feed.id}" ${feed.enabled ? "checked" : ""}>
          ${t("optionsActive")}
        </label>
        <label>
          <input type="checkbox" data-field="notify" data-id="${feed.id}" ${feed.notify ? "checked" : ""}>
          ${t("optionsNotify")}
        </label>
        <label>
          ${t("optionsInterval")}
          <input type="number" data-field="intervalMinutes" data-id="${feed.id}" value="${feed.intervalMinutes || 0}" min="0">
        </label>
        <label>
          ${t("optionsRetention")}
          <input type="number" data-field="retentionDays" data-id="${feed.id}" value="${feed.retentionDays || 0}" min="0">
        </label>
      </div>
      <div class="feed-actions">
        ${feed.bookmarkFolderId ? `<button data-action="export" data-folder-id="${feed.bookmarkFolderId}" data-feed-title="${escapeHtml(feed.title || feed.url)}">${t("optionsExportFolder")}</button>` : ""}
      </div>
    `;

    // Field changes
    card.addEventListener("change", async (e) => {
      const field = e.target?.dataset?.field;
      const id = e.target?.dataset?.id;
      if (!field || !id) return;

      const value = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value);
      await upsertFeed(id, { [field]: value });
    });

    // Remove feed
    card.querySelector("[data-action='remove']").addEventListener("click", async () => {
      const { settings } = await getState();
      if (settings.deleteBookmarksOnUnsubscribe && feed.bookmarkFolderId) {
        try {
          await chrome.bookmarks.removeTree(feed.bookmarkFolderId);
        } catch { /* folder already gone */ }
      }
      await removeFeed(feed.id);
      await renderFeeds();
    });

    // Export single feed
    const exportBtn = card.querySelector("[data-action='export']");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        try {
          const count = await exportFeedToFolder(exportBtn.dataset.folderId);
          showStatus("feedStatus", t("optionsExported", [String(count)]));
        } catch (err) {
          if (err.name === "AbortError") return;
          showStatus("feedStatus", t("popupError", [err.message]), true);
        }
      });
    }

    list.appendChild(card);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showStatus(elementId, text, isError) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.className = "status" + (isError ? " error" : "");
  setTimeout(() => { el.textContent = ""; el.className = "status"; }, 3000);
}

// --- Init ---

applyI18n();
loadSettings();
renderFeeds();
