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
  const usedFileNames = new Set();
  let exported = 0;

  for (const bm of bookmarks) {
    if (await writeUrlFile(dirHandle, bm.title, bm.url, usedFileNames)) exported++;
  }

  return exported;
}

export async function exportAllFeedsToFolder(feeds) {
  const feedsWithFolders = feeds.filter(f => f.bookmarkFolderId);
  if (feedsWithFolders.length === 0) throw new Error("No feeds with bookmark folders");

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  const usedFolderNames = new Set();
  let totalExported = 0;

  for (const feed of feedsWithFolders) {
    const baseFolderName = sanitizeFilename(feed.title || feed.url);
    const folderName = allocateUniqueName(usedFolderNames, baseFolderName);
    let subDir;
    try {
      subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
    } catch { continue; }

    let children;
    try {
      children = await chrome.bookmarks.getChildren(feed.bookmarkFolderId);
    } catch { continue; }

    const usedFileNames = new Set();
    for (const bm of children.filter(c => c.url)) {
      if (await writeUrlFile(subDir, bm.title, bm.url, usedFileNames)) totalExported++;
    }
  }

  return totalExported;
}

function sanitizeExportUrl(rawUrl) {
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

function allocateUniqueName(usedNames, baseName, suffix = "") {
  let candidate = `${baseName}${suffix}`;
  let lower = candidate.toLowerCase();
  if (!usedNames.has(lower)) {
    usedNames.add(lower);
    return candidate;
  }

  let counter = 2;
  while (true) {
    candidate = `${baseName} (${counter})${suffix}`;
    lower = candidate.toLowerCase();
    if (!usedNames.has(lower)) {
      usedNames.add(lower);
      return candidate;
    }
    counter += 1;
  }
}

async function writeUrlFile(dirHandle, title, url, usedFileNames = new Set()) {
  const safeUrl = sanitizeExportUrl(url);
  if (!safeUrl) return false;

  const baseName = sanitizeFilename(title || "bookmark");
  const fileName = allocateUniqueName(usedFileNames, baseName, ".url");
  // Windows .url format — same as FavExtract
  const content = "[InternetShortcut]\r\nURL=" + safeUrl + "\r\n";

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

const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFilename(name) {
  let cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 180);

  if (!cleaned) {
    return "unnamed";
  }

  if (WINDOWS_RESERVED_NAMES.test(cleaned)) {
    cleaned = `_${cleaned}`;
  }

  return cleaned;
}
