export const DEFAULT_SETTINGS = {
  updateOnStartup: true,
  globalIntervalMinutes: 0,
  rootFolderName: "RSS",
  rootFolderId: "",
  deleteBookmarksOnUnsubscribe: false
};

const DEFAULT_LIFECYCLE = {
  workerBootedAt: 0,
  lastAlarmCheckAt: 0,
  alarmIntervalMinutes: 0,
  alarmSource: "disabled",
  enabledFeedCount: 0,
  lastCycleAt: 0,
  lastCycleReason: "",
  lastCycleFeedCount: 0,
  lastPruneFeedCount: 0
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFeedsMap(rawFeeds) {
  if (!isPlainObject(rawFeeds)) return {};
  const clean = {};
  for (const [id, entry] of Object.entries(rawFeeds)) {
    if (isPlainObject(entry)) {
      clean[id] = entry;
    }
  }
  return clean;
}

export async function getState() {
  const data = (await chrome.storage.local.get(["settings", "feeds"])) || {};
  const rawSettings = isPlainObject(data.settings) ? data.settings : {};
  return {
    settings: { ...DEFAULT_SETTINGS, ...rawSettings },
    feeds: sanitizeFeedsMap(data.feeds)
  };
}

export async function setState(state) {
  await chrome.storage.local.set(state);
}

export async function getSettings() {
  const { settings } = await getState();
  return settings;
}

export async function getLifecycle() {
  const data = (await chrome.storage.local.get(["lifecycle"])) || {};
  const rawLifecycle = isPlainObject(data.lifecycle) ? data.lifecycle : {};
  return { ...DEFAULT_LIFECYCLE, ...rawLifecycle };
}

let _settingsMutex = Promise.resolve();
let _lifecycleMutex = Promise.resolve();
let _feedMutex = Promise.resolve();

function withSettingsLock(fn) {
  const run = _settingsMutex.then(fn, fn);
  _settingsMutex = run.catch(() => {});
  return run;
}

function withLifecycleLock(fn) {
  const run = _lifecycleMutex.then(fn, fn);
  _lifecycleMutex = run.catch(() => {});
  return run;
}

function withFeedLock(fn) {
  const run = _feedMutex.then(fn, fn);
  _feedMutex = run.catch(() => {});
  return run;
}

export async function updateSettings(patch) {
  if (!isPlainObject(patch)) return;
  return withSettingsLock(async () => {
    const { settings } = await getState();
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  });
}

export async function updateLifecycle(patch) {
  if (!isPlainObject(patch)) return;
  return withLifecycleLock(async () => {
    const lifecycle = await getLifecycle();
    await chrome.storage.local.set({ lifecycle: { ...lifecycle, ...patch } });
  });
}

export async function upsertFeed(feedId, patch) {
  return withFeedLock(async () => {
    const { feeds } = await getState();
    const safePatch = isPlainObject(patch) ? patch : {};
    feeds[feedId] = { ...(feeds[feedId] || {}), ...safePatch, id: feedId };
    await chrome.storage.local.set({ feeds });
  });
}

export async function patchExistingFeed(feedId, patch) {
  return withFeedLock(async () => {
    if (typeof feedId !== "string" || !feedId || !isPlainObject(patch)) return false;
    const { feeds } = await getState();
    if (!Object.hasOwn(feeds, feedId) || !isPlainObject(feeds[feedId])) return false;
    feeds[feedId] = { ...feeds[feedId], ...patch, id: feedId };
    await chrome.storage.local.set({ feeds });
    return true;
  });
}

export async function removeFeed(feedId) {
  return withFeedLock(async () => {
    const { feeds } = await getState();
    delete feeds[feedId];
    await chrome.storage.local.set({ feeds });
  });
}

export async function mergeFeedSeen(feedId, seenDelta) {
  return withFeedLock(async () => {
    if (typeof feedId !== "string" || !feedId || !isPlainObject(seenDelta)) return false;
    const { feeds } = await getState();
    const existing = Object.hasOwn(feeds, feedId) ? feeds[feedId] : undefined;
    if (!isPlainObject(existing)) return false;

    const existingSeen = isPlainObject(existing.seen) ? existing.seen : {};
    const merged = { ...existingSeen, ...seenDelta };
    const keys = Object.keys(merged);
    if (keys.length > 800) {
      keys.sort((a, b) => (Number(merged[a]) || 0) - (Number(merged[b]) || 0));
      for (let i = 0; i < keys.length - 800; i++) delete merged[keys[i]];
    }
    feeds[feedId] = { ...existing, seen: merged, id: feedId };
    await chrome.storage.local.set({ feeds });
    return true;
  });
}

export async function getAllFeeds() {
  const { feeds } = await getState();
  return Object.values(feeds);
}

export async function getEnabledFeeds() {
  const feeds = await getAllFeeds();
  return feeds.filter((f) => Boolean(f?.enabled));
}
