import {
  DEFAULT_SETTINGS,
  getState,
  getEnabledFeeds,
  patchExistingFeed,
  updateLifecycle
} from "./lib/storage.js";
import { fetchFeedAndParse } from "./lib/rss.js";
import { ensureFeedFolder, addItemsToBookmarks, pruneOldBookmarks } from "./lib/bookmarks.js";
import { collectFeedLinksFromDocument, probeCommonFeedPaths } from "./lib/discovery.js";

const ALARM_NAME = "rss-book-tick";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeAlarmMinutes(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(1, num);
}

function isHttpFeedUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasAlarmConfigChanged(changes) {
  if (!isPlainObject(changes)) return false;
  if (changes.settings) return true;
  if (!changes.feeds) return false;

  const oldFeeds = isPlainObject(changes.feeds.oldValue) ? changes.feeds.oldValue : null;
  const newFeeds = isPlainObject(changes.feeds.newValue) ? changes.feeds.newValue : null;
  if (!oldFeeds || !newFeeds) return true;

  const oldKeys = Object.keys(oldFeeds);
  const newKeys = Object.keys(newFeeds);
  if (oldKeys.length !== newKeys.length) return true;

  for (const id of newKeys) {
    if (!Object.prototype.hasOwnProperty.call(oldFeeds, id)) return true;
    const prev = oldFeeds[id];
    const next = newFeeds[id];
    if (Boolean(prev?.enabled) !== Boolean(next?.enabled)) return true;
    if (sanitizeAlarmMinutes(prev?.intervalMinutes) !== sanitizeAlarmMinutes(next?.intervalMinutes)) {
      return true;
    }
  }
  return false;
}

// --- Lifecycle ---

const bootPromise = initializeServiceWorkerLifecycle().catch((err) => {
  console.error("[RSS-BOOK] Service worker bootstrap failed:", err);
});

if (typeof chrome !== "undefined") {
  chrome.runtime?.onInstalled?.addListener(async () => {
    const raw = (await chrome.storage.local.get(["settings", "feeds"])) || {};
    if (!isPlainObject(raw.settings)) {
      await chrome.storage.local.set({
        settings: { ...DEFAULT_SETTINGS },
        feeds: isPlainObject(raw.feeds) ? raw.feeds : {}
      });
    }
    await ensureAlarm();
    console.log("[RSS-BOOK] Installed.");
  });

  chrome.runtime?.onStartup?.addListener(async () => {
    const { settings } = await getState();
    if (settings?.updateOnStartup) {
      await runUpdateCycle("startup");
    }
    await ensureAlarm();
    console.log("[RSS-BOOK] Startup complete.");
  });

  // --- Alarms ---

  chrome.alarms?.onAlarm?.addListener(async (alarm) => {
    if (alarm?.name !== ALARM_NAME) return;
    await runUpdateCycle("alarm");
  });

  chrome.storage?.onChanged?.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (hasAlarmConfigChanged(changes)) await ensureAlarm();
  });

  // --- Message handling ---

  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) =>
    handleRuntimeMessage(msg, sender, sendResponse)
  );
}

async function initializeServiceWorkerLifecycle() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local || !chrome?.alarms) return;
  await updateLifecycle({ workerBootedAt: Date.now() });
  await ensureAlarm();
}

export function computeAlarmPlan(settings = {}, feeds = []) {
  const safeFeeds = Array.isArray(feeds) ? feeds : [];
  let intervalMinutes = sanitizeAlarmMinutes(settings?.globalIntervalMinutes);
  let alarmSource = intervalMinutes > 0 ? "global" : "disabled";

  if (intervalMinutes <= 0) {
    const feedIntervals = safeFeeds
      .map((feed) => sanitizeAlarmMinutes(feed?.intervalMinutes))
      .filter((minutes) => minutes > 0);
    if (feedIntervals.length > 0) {
      intervalMinutes = Math.min(...feedIntervals);
      alarmSource = "feed";
    }
  }

  return {
    intervalMinutes,
    alarmSource,
    enabledFeedCount: safeFeeds.length
  };
}

let _alarmMutex = Promise.resolve();

async function ensureAlarm() {
  const run = _alarmMutex.then(async () => {
    const { settings } = await getState();
    const feeds = await getEnabledFeeds();
    const plan = computeAlarmPlan(settings, feeds);
    const existing = await chrome.alarms.get(ALARM_NAME);

    await updateLifecycle({
      lastAlarmCheckAt: Date.now(),
      alarmIntervalMinutes: plan.intervalMinutes,
      alarmSource: plan.alarmSource,
      enabledFeedCount: plan.enabledFeedCount
    });

    if (plan.intervalMinutes <= 0) {
      if (existing) await chrome.alarms.clear(ALARM_NAME);
      return;
    }

    if (!existing || Math.abs((existing.periodInMinutes || 0) - plan.intervalMinutes) > 0.01) {
      await chrome.alarms.clear(ALARM_NAME);
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: plan.intervalMinutes });
      console.log(`[RSS-BOOK] Alarm set: every ${plan.intervalMinutes} min`);
    }
  });
  _alarmMutex = run.catch(() => {});
  return run;
}

// --- Update Cycle ---

let _cycleInFlight = null;
const _feedUpdatesInFlight = new Map();

async function runUpdateCycle(reason) {
  if (_cycleInFlight) return _cycleInFlight;
  _cycleInFlight = (async () => {
    console.log(`[RSS-BOOK] Update cycle (${reason})`);
    const { settings } = await getState();
    const feeds = await getEnabledFeeds();
    let updatedFeeds = 0;

    for (const feed of feeds) {
      if (!shouldUpdateFeedForReason(feed, reason, settings)) continue;
      updatedFeeds += 1;
      try {
        await updateOneFeed(feed.id);
      } catch (err) {
        console.error(`[RSS-BOOK] Error updating feed ${feed.url}:`, err);
        await patchExistingFeed(feed.id, { lastError: err?.message || String(err), lastFetch: Date.now() });
      }
    }

    // Retention pass
    const freshFeeds = await getEnabledFeeds();
    let prunedFeeds = 0;
    for (const feed of freshFeeds) {
      try {
        await pruneOldBookmarks(feed);
        prunedFeeds += 1;
      } catch (err) {
        console.error(`[RSS-BOOK] Error pruning feed ${feed.url}:`, err);
      }
    }

    await updateLifecycle({
      lastCycleAt: Date.now(),
      lastCycleReason: reason,
      lastCycleFeedCount: updatedFeeds,
      lastPruneFeedCount: prunedFeeds,
      enabledFeedCount: freshFeeds.length
    });
  })();
  try { return await _cycleInFlight; } finally { _cycleInFlight = null; }
}

export function shouldUpdateFeedForReason(feed, reason, settings = {}, now = Date.now()) {
  if (!isPlainObject(feed)) return false;
  if (reason !== "alarm") return true;

  const feedInterval = sanitizeAlarmMinutes(feed.intervalMinutes);
  if (feedInterval > 0) {
    const lastFetch = Number(feed.lastFetch);
    if (!Number.isFinite(lastFetch) || lastFetch <= 0) return true;
    return (now - lastFetch) >= feedInterval * 60_000;
  }

  const globalInterval = sanitizeAlarmMinutes(settings?.globalIntervalMinutes);
  return globalInterval > 0;
}

async function updateOneFeed(feedId) {
  if (typeof feedId !== "string" || !feedId) return;
  const inFlight = _feedUpdatesInFlight.get(feedId);
  if (inFlight) return inFlight;

  const task = _executeSingleFeedUpdate(feedId);
  _feedUpdatesInFlight.set(feedId, task);
  try {
    return await task;
  } finally {
    if (_feedUpdatesInFlight.get(feedId) === task) {
      _feedUpdatesInFlight.delete(feedId);
    }
  }
}

async function _executeSingleFeedUpdate(feedId) {
  const { feeds } = await getState();
  const feed = feeds?.[feedId];
  if (!feed || !feed.enabled) return;

  if (!isHttpFeedUrl(feed.url)) {
    await patchExistingFeed(feedId, { lastFetch: Date.now(), lastError: "Invalid feed URL" });
    return;
  }

  const parsed = await fetchFeedAndParse(feed.url, {
    etag: feed.lastEtag,
    lastModified: feed.lastModified
  });

  // Re-verify subscription state after network I/O so unsubscribing mid-fetch never resurrects a feed or creates orphan folders
  const { feeds: latestFeeds } = await getState();
  const currentFeed = latestFeeds?.[feedId];
  if (!currentFeed || !currentFeed.enabled) return;

  if (!parsed) {
    await patchExistingFeed(feedId, { lastFetch: Date.now(), lastError: "Feed not reachable or invalid format" });
    return;
  }

  // Clear previous error on success
  if (parsed.items.length === 0) {
    await patchExistingFeed(feedId, {
      lastFetch: Date.now(),
      lastError: "",
      lastEtag: parsed.etag || currentFeed.lastEtag,
      lastModified: parsed.lastModified || currentFeed.lastModified
    });
    return;
  }

  let folderId = currentFeed.bookmarkFolderId;
  folderId = await ensureFeedFolder(currentFeed, folderId);

  const { feeds: postFolderFeeds } = await getState();
  const activeFeed = postFolderFeeds?.[feedId];
  if (!activeFeed || !activeFeed.enabled) return;

  const { addedCount, newestTitles } = await addItemsToBookmarks(
    { ...activeFeed, bookmarkFolderId: folderId },
    folderId,
    parsed.items
  );

  if (addedCount > 0 && activeFeed.notify) {
    await notify(activeFeed.title || parsed.title || activeFeed.url, addedCount, newestTitles);
  }

  await patchExistingFeed(feedId, {
    bookmarkFolderId: folderId,
    lastFetch: Date.now(),
    lastError: "",
    lastEtag: parsed.etag ?? activeFeed.lastEtag,
    lastModified: parsed.lastModified ?? activeFeed.lastModified,
    title: activeFeed.title || parsed.title
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

export function handleRuntimeMessage(msg, sender, sendResponse) {
  if (!isPlainObject(msg) || typeof sendResponse !== "function") return false;
  if (sender?.id && chrome?.runtime?.id && sender.id !== chrome.runtime.id) {
    return false;
  }

  if (msg.action === "updateAll") {
    runUpdateCycle("manual")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (msg.action === "updateFeed") {
    if (typeof msg.feedId !== "string" || !msg.feedId) {
      sendResponse({ ok: false, error: "Invalid feedId" });
      return false;
    }
    updateOneFeed(msg.feedId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (msg.action === "discoverFeeds") {
    if (!Number.isInteger(msg.tabId) || msg.tabId < 0) {
      sendResponse({ ok: false, error: "Invalid tabId", feeds: [] });
      return false;
    }
    discoverFeedsOnTab(msg.tabId)
      .then((feeds) => sendResponse({ ok: true, feeds }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err), feeds: [] }));
    return true;
  }
  return false;
}

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

export { bootPromise };
