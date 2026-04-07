import { getState, upsertFeed, getEnabledFeeds } from "./lib/storage.js";
import { fetchFeedAndParse } from "./lib/rss.js";
import { ensureFeedFolder, addItemsToBookmarks, pruneOldBookmarks } from "./lib/bookmarks.js";

const ALARM_NAME = "rss-book-tick";

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(async () => {
  // Check raw storage, not getState() which always returns defaults
  const raw = await chrome.storage.local.get(["settings", "feeds"]);
  if (!raw.settings) {
    await chrome.storage.local.set({
      settings: { updateOnStartup: true, globalIntervalMinutes: 0 },
      feeds: raw.feeds || {}
    });
  }
  await ensureAlarm();
  console.log("[RSS-BOOK] Installed.");
});

chrome.runtime.onStartup.addListener(async () => {
  const { settings } = await getState();
  if (settings?.updateOnStartup) {
    await runUpdateCycle("startup");
  }
  await ensureAlarm();
  console.log("[RSS-BOOK] Startup complete.");
});

// --- Alarms ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await runUpdateCycle("alarm");
});

// React to settings changes (e.g. from options page)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.settings) return;
  await ensureAlarm();
});

async function ensureAlarm() {
  const { settings } = await getState();
  const interval = settings?.globalIntervalMinutes ?? 0;
  const existing = await chrome.alarms.get(ALARM_NAME);

  if (interval <= 0) {
    if (existing) await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  // Always recreate if missing or interval changed
  if (!existing || Math.abs((existing.periodInMinutes || 0) - interval) > 0.01) {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: interval });
    console.log(`[RSS-BOOK] Alarm set: every ${interval} min`);
  }
}

// --- Update Cycle ---

async function runUpdateCycle(reason) {
  console.log(`[RSS-BOOK] Update cycle (${reason})`);
  const feeds = await getEnabledFeeds();

  for (const feed of feeds) {
    if (reason === "alarm" && feed.intervalMinutes > 0) {
      const due = !feed.lastFetch || (Date.now() - feed.lastFetch) >= feed.intervalMinutes * 60_000;
      if (!due) continue;
    }
    try {
      await updateOneFeed(feed.id);
    } catch (err) {
      console.error(`[RSS-BOOK] Error updating feed ${feed.url}:`, err);
    }
  }

  // Retention pass — re-read feeds from storage to get fresh bookmarkFolderIds
  const freshFeeds = await getEnabledFeeds();
  for (const feed of freshFeeds) {
    try {
      await pruneOldBookmarks(feed);
    } catch (err) {
      console.error(`[RSS-BOOK] Error pruning feed ${feed.url}:`, err);
    }
  }
}

async function updateOneFeed(feedId) {
  const { feeds } = await getState();
  const feed = feeds?.[feedId];
  if (!feed || !feed.enabled) return;

  const parsed = await fetchFeedAndParse(feed.url, {
    etag: feed.lastEtag,
    lastModified: feed.lastModified
  });

  if (!parsed) {
    await upsertFeed(feedId, { lastFetch: Date.now() });
    return;
  }

  if (parsed.items.length === 0) {
    await upsertFeed(feedId, {
      lastFetch: Date.now(),
      lastEtag: parsed.etag || feed.lastEtag,
      lastModified: parsed.lastModified || feed.lastModified
    });
    return;
  }

  let folderId = feed.bookmarkFolderId;
  folderId = await ensureFeedFolder(feed, folderId);

  const { addedCount, newestTitles } = await addItemsToBookmarks(
    { ...feed, bookmarkFolderId: folderId },
    folderId,
    parsed.items
  );

  if (addedCount > 0 && feed.notify) {
    await notify(feed.title || parsed.title || feed.url, addedCount, newestTitles);
  }

  await upsertFeed(feedId, {
    bookmarkFolderId: folderId,
    lastFetch: Date.now(),
    lastEtag: parsed.etag ?? feed.lastEtag,
    lastModified: parsed.lastModified ?? feed.lastModified,
    title: feed.title || parsed.title
  });
}

async function notify(feedTitle, count, titles) {
  const message = titles.slice(0, 3).map(t => "\u2022 " + t).join("\n");
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/48.png",
    title: `${feedTitle}: ${count} neu`,
    message: message || "Neue Eintr\u00e4ge verf\u00fcgbar"
  });
}

// --- Message handling (from popup/options) ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "updateAll") {
    runUpdateCycle("manual")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[RSS-BOOK] updateAll failed:", err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
  if (msg.action === "updateFeed") {
    updateOneFeed(msg.feedId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[RSS-BOOK] updateFeed failed:", err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});
