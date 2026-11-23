import { getAllFeeds, upsertFeed, getSettings } from "../lib/storage.js";
import { t, applyI18n } from "../lib/i18n.js";

const feedList = document.getElementById("feedList");
const statusEl = document.getElementById("status");
const discoverSection = document.getElementById("discoverSection");

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeFeedUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return /\s/.test(trimmed) ? parsed.href : trimmed;
  } catch {
    return "";
  }
}

function canonicalizeFeedUrlKey(rawUrl) {
  const safe = sanitizeFeedUrl(rawUrl);
  if (!safe) return "";
  try {
    return new URL(safe).href;
  } catch {
    return safe;
  }
}

async function resolveValidBookmarkFolderId(folderId) {
  if (typeof folderId !== "string" || !folderId.trim()) return "";
  const trimmed = folderId.trim();
  if (!globalThis.chrome?.bookmarks?.get) return trimmed;
  try {
    const nodes = await chrome.bookmarks.get(trimmed);
    if (nodes?.[0]?.id && !nodes[0].url) {
      return String(nodes[0].id);
    }
    return "";
  } catch {
    return "";
  }
}

async function render() {
  const feeds = await getAllFeeds();

  if (feeds.length === 0) {
    feedList.innerHTML = `<div class="empty">${escapeHtml(t("popupNoFeeds"))}</div>`;
    return;
  }

  feedList.innerHTML = "";
  for (const feed of feeds) {
    const div = document.createElement("div");
    div.className = "feed-item";

    const name = document.createElement("span");
    name.className = "feed-name";
    name.textContent = feed.title || feed.url || "";
    name.title = feed.url || "";

    const info = document.createElement("div");
    info.className = "feed-info";

    const time = document.createElement("span");
    time.className = "feed-count";
    const lastFetchTs = Number(feed.lastFetch);
    if (Number.isFinite(lastFetchTs) && lastFetchTs > 0) {
      const ago = Math.max(0, Math.round((Date.now() - lastFetchTs) / 60000));
      time.textContent = ago < 1 ? t("popupJustNow") : t("popupMinAgo", [String(ago)]);
    } else {
      time.textContent = t("popupNeverUpdated");
    }
    info.appendChild(time);

    if (feed.lastError) {
      const err = document.createElement("span");
      err.className = "feed-error";
      err.textContent = feed.lastError;
      err.title = feed.lastError;
      info.appendChild(err);
    }

    div.appendChild(name);
    div.appendChild(info);
    feedList.appendChild(div);
  }
}

// Update all
document.getElementById("updateBtn").addEventListener("click", async () => {
  const btn = document.getElementById("updateBtn");
  showStatus(t("popupUpdating"), "");
  btn.disabled = true;

  try {
    const res = await chrome.runtime.sendMessage({ action: "updateAll" });
    if (res?.ok) {
      showStatus(t("popupDone"), "success");
    } else {
      showStatus(t("popupError", [res?.error || "Unknown"]), "error");
    }
  } catch (err) {
    showStatus(t("popupError", [err.message]), "error");
  }

  btn.disabled = false;
  setTimeout(() => { statusEl.textContent = ""; statusEl.className = "status"; }, 3000);
  await render();
});

// Feed Autodiscovery
document.getElementById("discoverBtn").addEventListener("click", async () => {
  const btn = document.getElementById("discoverBtn");
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus(t("popupNoFeedsFound"), "");
      btn.disabled = false;
      return;
    }

    const res = await chrome.runtime.sendMessage({ action: "discoverFeeds", tabId: tab.id });
    const seenDiscovered = new Set();
    const safeFeeds = Array.isArray(res?.feeds)
      ? res.feeds.filter((f) => {
          const key = canonicalizeFeedUrlKey(f?.url);
          if (!key || seenDiscovered.has(key)) return false;
          seenDiscovered.add(key);
          return true;
        })
      : [];
    if (res?.ok && safeFeeds.length > 0) {
      showDiscoveredFeeds(safeFeeds);
    } else {
      discoverSection.className = "discover-section";
      showStatus(t("popupNoFeedsFound"), "");
    }
  } catch (err) {
    showStatus(t("popupError", [err.message]), "error");
  }

  btn.disabled = false;
});

function showDiscoveredFeeds(feeds) {
  discoverSection.className = "discover-section visible";
  discoverSection.innerHTML = `<div class="discover-info">${escapeHtml(t("popupFeedsFound", [String(feeds.length)]))}</div>`;

  for (const feed of feeds) {
    const safeUrl = sanitizeFeedUrl(feed.url);
    const canonicalKey = canonicalizeFeedUrlKey(safeUrl);
    if (!safeUrl || !canonicalKey) continue;

    const row = document.createElement("div");
    row.className = "discover-item";

    const label = document.createElement("span");
    label.textContent = feed.title || safeUrl;
    label.title = safeUrl;

    const addBtn = document.createElement("button");
    addBtn.textContent = "+";
    addBtn.title = safeUrl;
    addBtn.addEventListener("click", async () => {
      const existing = await getAllFeeds();
      if (existing.some((f) => canonicalizeFeedUrlKey(f?.url) === canonicalKey)) {
        addBtn.textContent = "\u2713";
        addBtn.disabled = true;
        return;
      }

      const id = crypto.randomUUID();
      await upsertFeed(id, {
        url: safeUrl,
        title: feed.title,
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
      try {
        await chrome.runtime.sendMessage({ action: "updateFeed", feedId: id });
      } catch {}
      addBtn.textContent = "\u2713";
      addBtn.disabled = true;
      showStatus(t("popupFeedAdded"), "success");
      setTimeout(() => { statusEl.textContent = ""; statusEl.className = "status"; }, 2000);
      await render();
    });

    row.appendChild(label);
    row.appendChild(addBtn);
    discoverSection.appendChild(row);
  }
}

// Open feeds in bookmark manager
document.getElementById("openFeedsBtn").addEventListener("click", async () => {
  const settings = await getSettings();
  const folderId = await resolveValidBookmarkFolderId(settings.rootFolderId || "");
  const isEdge = typeof navigator !== "undefined" && String(navigator.userAgent || "").includes("Edg/");
  const encodedQuery = folderId ? `?id=${encodeURIComponent(folderId)}` : "";
  const url = isEdge
    ? `edge://favorites/${encodedQuery}`
    : `chrome://bookmarks/${encodedQuery}`;
  await chrome.tabs.create({ url });
  window.close();
});

// Settings
document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

applyI18n();
render();
