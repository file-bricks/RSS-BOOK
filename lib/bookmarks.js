import { getSettings, updateSettings, upsertFeed } from "./storage.js";

const DEFAULT_ROOT_NAME = "RSS";
const MAX_ITEMS_PER_BATCH = 20;

export async function ensureFeedFolder(feed, existingFolderId) {
  if (existingFolderId) {
    try {
      const nodes = await chrome.bookmarks.get(existingFolderId);
      if (nodes?.[0]?.id) return existingFolderId;
    } catch { /* folder was deleted, recreate */ }
  }

  const rootId = await ensureRootFolder();
  const title = feed.title || feed.url;
  const folder = await chrome.bookmarks.create({ parentId: rootId, title });
  return folder.id;
}

/**
 * Root folder resolution order:
 * 1. Stored rootFolderId — works even if renamed or moved
 * 2. Search by name in Other Bookmarks — for first-time or after deletion
 * 3. Create new folder
 */
async function ensureRootFolder() {
  const settings = await getSettings();
  const folderName = settings.rootFolderName || DEFAULT_ROOT_NAME;

  // 1. Check stored ID — survives renames and moves
  if (settings.rootFolderId) {
    try {
      const nodes = await chrome.bookmarks.get(settings.rootFolderId);
      if (nodes?.[0]?.id) return settings.rootFolderId;
    } catch { /* stored folder was deleted, continue */ }
  }

  // 2. Search by name in Other Bookmarks
  const tree = await chrome.bookmarks.getTree();
  const otherBookmarks = findOtherBookmarks(tree[0]);
  const parentId = otherBookmarks?.id || tree[0].children?.[1]?.id || tree[0].children?.[0]?.id;

  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find(c => !c.url && c.title === folderName);
  if (existing) {
    await updateSettings({ rootFolderId: existing.id });
    return existing.id;
  }

  // 3. Create new folder and store ID
  const root = await chrome.bookmarks.create({ parentId, title: folderName });
  await updateSettings({ rootFolderId: root.id });
  return root.id;
}

function findOtherBookmarks(node) {
  const otherTitles = ["Other bookmarks", "Other Bookmarks", "Andere Lesezeichen", "Weitere Lesezeichen"];
  if (otherTitles.includes(node.title)) return node;
  for (const child of (node.children || [])) {
    const found = findOtherBookmarks(child);
    if (found) return found;
  }
  return null;
}

export async function addItemsToBookmarks(feed, folderId, items) {
  const seen = { ...(feed.seen || {}) };
  let addedCount = 0;
  const newestTitles = [];

  for (const item of items) {
    if (addedCount >= MAX_ITEMS_PER_BATCH) break;

    const key = makeKey(item);
    if (seen[key]) continue;
    if (!item.link) continue;

    await chrome.bookmarks.create({
      parentId: folderId,
      title: item.title,
      url: item.link
    });

    seen[key] = Date.now();
    addedCount++;
    newestTitles.push(item.title);
  }

  trimLRU(seen, 800);

  await upsertFeed(feed.id, { seen });

  return { addedCount, newestTitles };
}

export async function pruneOldBookmarks(feed) {
  const days = feed.retentionDays;
  if (!days || days <= 0) return;
  if (!feed.bookmarkFolderId) return;

  const cutoff = Date.now() - days * 24 * 60 * 60_000;

  let children;
  try {
    children = await chrome.bookmarks.getChildren(feed.bookmarkFolderId);
  } catch {
    return;
  }

  for (const node of children) {
    if (!node.url) continue;
    if (node.dateAdded && node.dateAdded < cutoff) {
      await chrome.bookmarks.remove(node.id);
    }
  }
}

function makeKey(item) {
  return item.guid || item.link || simpleHash(`${item.title}|${item.published}|${item.link}`);
}

function simpleHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) * 16777619;
  }
  return (h >>> 0).toString(16);
}

function trimLRU(seen, max) {
  const keys = Object.keys(seen);
  if (keys.length <= max) return;
  keys.sort((a, b) => seen[a] - seen[b]);
  for (let i = 0; i < keys.length - max; i++) {
    delete seen[keys[i]];
  }
}
