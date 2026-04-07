/**
 * Exports bookmarks from feed folders as .url files.
 * Uses File System Access API (showDirectoryPicker) — works on options page.
 * Format matches FavExtract's write_url_file: [InternetShortcut]\r\nURL=...\r\n
 */

export async function exportFeedToFolder(bookmarkFolderId) {
  const children = await getBookmarkChildren(bookmarkFolderId);
  const bookmarks = children.filter(c => c.url);
  if (bookmarks.length === 0) throw new Error("No bookmarks to export");

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  let exported = 0;

  for (const bm of bookmarks) {
    if (await writeUrlFile(dirHandle, bm.title, bm.url)) exported++;
  }

  return exported;
}

export async function exportAllFeedsToFolder(feeds) {
  const feedsWithFolders = feeds.filter(f => f.bookmarkFolderId);
  if (feedsWithFolders.length === 0) throw new Error("No feeds with bookmark folders");

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  let totalExported = 0;

  for (const feed of feedsWithFolders) {
    const folderName = sanitizeFilename(feed.title || feed.url);
    let subDir;
    try {
      subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
    } catch { continue; }

    let children;
    try {
      children = await chrome.bookmarks.getChildren(feed.bookmarkFolderId);
    } catch { continue; }

    for (const bm of children.filter(c => c.url)) {
      if (await writeUrlFile(subDir, bm.title, bm.url)) totalExported++;
    }
  }

  return totalExported;
}

async function writeUrlFile(dirHandle, title, url) {
  if (!url) return false;
  const fileName = sanitizeFilename(title || "bookmark") + ".url";
  // Windows .url format — same as FavExtract
  const content = "[InternetShortcut]\r\nURL=" + url + "\r\n";

  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    // Write as UTF-8 text, not as blob
    await writable.write(new Blob([content], { type: "text/plain;charset=utf-8" }));
    await writable.close();
    return true;
  } catch (err) {
    console.warn(`[RSS-BOOK] Export failed for "${title}":`, err.message);
    return false;
  }
}

async function getBookmarkChildren(folderId) {
  try {
    return await chrome.bookmarks.getChildren(folderId);
  } catch {
    throw new Error("Bookmark folder not found");
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "unnamed";
}
