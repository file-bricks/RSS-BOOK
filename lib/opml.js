export function generateOPML(feeds) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>RSS-BOOK Feeds</title>',
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>'
  ];

  for (const feed of feeds) {
    const title = escapeXml(feed.title || feed.url);
    const url = escapeXml(feed.url);
    lines.push(`    <outline text="${title}" title="${title}" type="rss" xmlUrl="${url}" />`);
  }

  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}

export function parseOPML(xmlText) {
  if (!xmlText || typeof xmlText !== "string") return [];

  // Strip UTF-8 BOM if present
  const cleanedText = xmlText.charCodeAt(0) === 0xFEFF ? xmlText.slice(1) : xmlText;

  // Extract all <outline> elements with xmlUrl attribute
  const feeds = [];
  const re = /<outline\s[^>]*xmlUrl\s*=\s*["']([^"']*)["'][^>]*\/?>/gi;

  for (const match of cleanedText.matchAll(re)) {
    const tag = match[0];
    const xmlUrl = sanitizeOpmlUrl(decodeXmlEntities(match[1]));
    if (!xmlUrl) continue;

    // Extract title/text with fallback for empty title attribute
    const titleMatch = tag.match(/\btitle\s*=\s*["']([^"']*)["']/i);
    const textMatch = tag.match(/\btext\s*=\s*["']([^"']*)["']/i);
    const candidateTitle = titleMatch?.[1]?.trim() || textMatch?.[1]?.trim() || "";
    const title = decodeXmlEntities(candidateTitle).trim();

    feeds.push({ url: xmlUrl, title });
  }

  return feeds;
}

function sanitizeOpmlUrl(rawUrl) {
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

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const HTML_ENTITIES = {
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
  "&cent;": "¢",
  "&auml;": "ä",
  "&Auml;": "Ä",
  "&ouml;": "ö",
  "&Ouml;": "Ö",
  "&uuml;": "ü",
  "&Uuml;": "Ü",
  "&szlig;": "ß",
  "&eacute;": "é",
  "&Eacute;": "É",
  "&egrave;": "è",
  "&Egrave;": "È",
  "&agrave;": "à",
  "&Agrave;": "À",
  "&ccedil;": "ç",
  "&Ccedil;": "Ç",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…"
};

function decodeCodePoint(code, fallback) {
  if (
    !Number.isInteger(code) ||
    code < 1 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    return fallback;
  }
  return String.fromCodePoint(code);
}

function decodeXmlEntities(s) {
  if (!s) return "";
  return s
    .replace(/&#(\d+);/g, (m, n) => decodeCodePoint(Number(n), m))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => decodeCodePoint(parseInt(h, 16), m))
    .replace(/&(?:quot|apos|lt|gt|nbsp|copy|reg|euro|pound|yen|cent|[aAoOuU]uml|szlig|[eE]acute|[eE]grave|[aA]grave|[cC]cedil|mdash|ndash|hellip);/g, (m) => HTML_ENTITIES[m] || m)
    .replace(/&amp;/g, '&');
}
