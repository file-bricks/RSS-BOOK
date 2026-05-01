import { getState, upsertFeed, getEnabledFeeds } from "./lib/storage.js";
import { fetchFeedAndParse } from "./lib/rss.js";
import { ensureFeedFolder, addItemsToBookmarks, pruneOldBookmarks } from "./lib/bookmarks.js";
import { collectFeedLinksFromDocument, probeCommonFeedPaths } from "./lib/discovery.js";

const ALARM_NAME = "rss-book-tick";

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(async () => {
  const raw = await chrome.storage.local.get(["settings", "feeds"]);
  if (!raw.settings) {
    await chrome.storage.local.set({
      settings: { updateOnStartup: true, globalIntervalMinutes: 0, rootFolderName: "RSS", rootFolderId: "" },
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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.settings || changes.feeds) await ensureAlarm();
});

async function ensureAlarm() {
  const { settings } = await getState();
  let interval = settings?.globalIntervalMinutes ?? 0;

  // If no global interval, use smallest per-feed interval as fallback
  if (interval <= 0) {
    const feeds = await getEnabledFeeds();
    const feedIntervals = feeds.map(f => f.intervalMinutes).filter(m => m > 0);
    if (feedIntervals.length > 0) {
      interval = Math.min(...feedIntervals);
    }
  }

  const existing = await chrome.alarms.get(ALARM_NAME);

  if (interval <= 0) {
    if (existing) await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  if (!existing || Math.abs((existing.periodInMinutes || 0) - interval) > 0.01) {
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: interval });
    console.log(`[RSS-BOOK] Alarm set: every ${interval} min`);
  }
}

// --- Update Cycle ---

async function runUpdateCycle(reason) {
  console.log(`[RSS-BOOK] Update cycle (${reason})`);
  const { settings } = await getState();
  const feeds = await getEnabledFeeds();

  for (const feed of feeds) {
    if (!shouldUpdateFeedForReason(feed, reason, settings)) continue;
    try {
      await updateOneFeed(feed.id);
    } catch (err) {
      console.error(`[RSS-BOOK] Error updating feed ${feed.url}:`, err);
      await upsertFeed(feed.id, { lastError: err.message, lastFetch: Date.now() });
    }
  }

  // Retention pass
  const freshFeeds = await getEnabledFeeds();
  for (const feed of freshFeeds) {
    try {
      await pruneOldBookmarks(feed);
    } catch (err) {
      console.error(`[RSS-BOOK] Error pruning feed ${feed.url}:`, err);
    }
  }
}

export function shouldUpdateFeedForReason(feed, reason, settings = {}, now = Date.now()) {
  if (reason !== "alarm") return true;

  const feedInterval = Number(feed.intervalMinutes) || 0;
  if (feedInterval > 0) {
    return !feed.lastFetch || (now - feed.lastFetch) >= feedInterval * 60_000;
  }

  const globalInterval = Number(settings?.globalIntervalMinutes) || 0;
  return globalInterval > 0;
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
    await upsertFeed(feedId, { lastFetch: Date.now(), lastError: "Feed not reachable or invalid format" });
    return;
  }

  // Clear previous error on success
  if (parsed.items.length === 0) {
    await upsertFeed(feedId, {
      lastFetch: Date.now(),
      lastError: "",
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
    lastError: "",
    lastEtag: parsed.etag ?? feed.lastEtag,
    lastModified: parsed.lastModified ?? feed.lastModified,
    title: feed.title || parsed.title
  });
}

async function notify(feedTitle, count, titles) {
  const message = titles.slice(0, 3).map(t => "\u2022 " + t).join("\n");
  const countText = chrome.i18n?.getMessage?.("notifyNewEntries", [String(count)]) || `${count} new`;
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/48.png",
    title: `${feedTitle}: ${countText}`,
    message: message || (chrome.i18n?.getMessage?.("notifyEntriesAvailable") || "New entries available")
  });
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "updateAll") {
    runUpdateCycle("manual")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "updateFeed") {
    updateOneFeed(msg.feedId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "discoverFeeds") {
    discoverFeedsOnTab(msg.tabId)
      .then((feeds) => sendResponse({ ok: true, feeds }))
      .catch((err) => sendResponse({ ok: false, error: err.message, feeds: [] }));
    return true;
  }
});

// --- Feed Autodiscovery ---

async function discoverFeedsOnTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectFeedLinksFromDocument
  });

  const scriptResult = results?.[0]?.result || { feeds: [], pageUrl: "" };
  const feeds = Array.isArray(scriptResult.feeds) ? [...scriptResult.feeds] : [];

  for (const feed of await probeCommonFeedPaths(scriptResult.pageUrl, feeds)) {
    feeds.push(feed);
  }

  return feeds;
}
