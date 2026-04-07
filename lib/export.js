/**
 * Exports bookmarks from a feed folder as .url files to a local directory.
 * Uses the File System Access API (showDirectoryPicker).
 */

export async function exportFeedToFolder(bookmarkFolderId) {
  let children;
  try {
    children = await chrome.bookmarks.getChildren(bookmarkFolderId);
  } catch {
    throw new Error("Bookmark folder not found");
  }

  const bookmarks = children.filter(c => c.url);
  if (bookmarks.length === 0) {
    throw new Error("No bookmarks to export");
  }

  // File System Access API — must be called from a user gesture context (popup/options page)
  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

  let exported = 0;
  for (const bm of bookmarks) {
    const safeName = sanitizeFilename(bm.title || "bookmark") + ".url";
    const content = `[InternetShortcut]\r\nURL=${bm.url}\r\n`;

    try {
      const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      exported++;
    } catch (err) {
      console.warn(`[RSS-BOOK] Export failed for "${bm.title}":`, err.message);
    }
  }

  return exported;
}

export async function exportAllFeedsToFolder(feeds) {
  const feedsWithFolders = feeds.filter(f => f.bookmarkFolderId);
  if (feedsWithFolders.length === 0) {
    throw new Error("No feeds with bookmark folders to export");
  }

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });

  let totalExported = 0;
  for (const feed of feedsWithFolders) {
    const folderName = sanitizeFilename(feed.title || feed.url);
    let subDir;
    try {
      subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
    } catch {
      continue;
    }

    let children;
    try {
      children = await chrome.bookmarks.getChildren(feed.bookmarkFolderId);
    } catch {
      continue;
    }

    for (const bm of children.filter(c => c.url)) {
      const safeName = sanitizeFilename(bm.title || "bookmark") + ".url";
      const content = `[InternetShortcut]\r\nURL=${bm.url}\r\n`;

      try {
        const fileHandle = await subDir.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        totalExported++;
      } catch (err) {
        console.warn(`[RSS-BOOK] Export failed for "${bm.title}":`, err.message);
      }
    }
  }

  return totalExported;
}

function sanitizeFilename(name) {
  // Remove or replace characters invalid in filenames
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "unnamed";
}
