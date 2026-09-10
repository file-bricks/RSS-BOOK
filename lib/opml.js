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
    const xmlUrl = decodeXmlEntities(match[1]).trim();
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

function decodeXmlEntities(s) {
  if (!s) return "";
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(?:quot|apos|lt|gt|nbsp|copy|reg|euro|pound|yen|cent|[aAoOuU]uml|szlig|[eE]acute|[eE]grave|[aA]grave|[cC]cedil|mdash|ndash|hellip);/g, (m) => HTML_ENTITIES[m] || m)
    .replace(/&amp;/g, '&');
}
