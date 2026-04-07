/**
 * Exports bookmarks from feed folders as .url files via chrome.downloads API.
 * Files are saved to the Downloads folder in an RSS-BOOK subdirectory.
 */

export async function exportFeedToFolder(bookmarkFolderId, feedTitle) {
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

  const folderName = sanitizeFilename(feedTitle || "feed");
  let exported = 0;

  for (const bm of bookmarks) {
    const fileName = sanitizeFilename(bm.title || "bookmark") + ".url";
    const content = `[InternetShortcut]\r\nURL=${bm.url}\r\n`;
    const blob = new Blob([content], { type: "application/octet-stream" });
    const dataUrl = await blobToDataUrl(blob);

    try {
      await chrome.downloads.download({
        url: dataUrl,
        filename: `RSS-BOOK/${folderName}/${fileName}`,
        saveAs: false,
        conflictAction: "uniquify"
      });
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

  let totalExported = 0;

  for (const feed of feedsWithFolders) {
    const folderName = sanitizeFilename(feed.title || feed.url);

    let children;
    try {
      children = await chrome.bookmarks.getChildren(feed.bookmarkFolderId);
    } catch {
      continue;
    }

    for (const bm of children.filter(c => c.url)) {
      const fileName = sanitizeFilename(bm.title || "bookmark") + ".url";
      const content = `[InternetShortcut]\r\nURL=${bm.url}\r\n`;
      const blob = new Blob([content], { type: "application/octet-stream" });
      const dataUrl = await blobToDataUrl(blob);

      try {
        await chrome.downloads.download({
          url: dataUrl,
          filename: `RSS-BOOK/${folderName}/${fileName}`,
          saveAs: false,
          conflictAction: "uniquify"
        });
        totalExported++;
      } catch (err) {
        console.warn(`[RSS-BOOK] Export failed for "${bm.title}":`, err.message);
      }
    }
  }

  return totalExported;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "unnamed";
}
