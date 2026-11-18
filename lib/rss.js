export async function fetchFeedAndParse(url, cache = {}) {
  const headers = {};
  if (cache.etag) headers["If-None-Match"] = cache.etag;
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    console.warn(`[RSS-BOOK] Fetch failed for ${url}:`, err.message);
    return null;
  }

  if (res.status === 304) {
    return { title: "", items: [], etag: cache.etag, lastModified: cache.lastModified };
  }
  if (!res.ok) {
    console.warn(`[RSS-BOOK] Feed returned ${res.status}: ${url}`);
    return null;
  }

  const text = await res.text();
  const etag = res.headers.get("ETag") || "";
  const lastModified = res.headers.get("Last-Modified") || "";
  const baseUrl = res.url || url;

  // DOMParser is NOT available in MV3 service workers — use regex-based XML parsing

  // RSS 2.0? (zuerst prüfen — <rss> ist ein eindeutiges Top-Level-Tag; wenn ein RSS-Feed
  // "<feed>" als Text in einem CDATA-Beschreibungsfeld enthält, würde eine nachgestellte
  // Atom-Prüfung den Feed fälschlich als Atom erkennen und 0 Items liefern)
  if (/<rss[\s>]/i.test(text) || /<channel[\s>]/i.test(text)) {
    const channelBlock = extractFirstBlock(text, "channel") || text;
    const title = extractDirectChildText(channelBlock, "title");
    const channelItems = extractAllBlocks(channelBlock, "item");
    const itemBlocks = channelItems.length ? channelItems : extractAllBlocks(text, "item");
    const items = itemBlocks.map((block) => parseRssItem(block, baseUrl));
    return { title, items, etag, lastModified };
  }

  // Atom?
  if (/<feed[\s>]/i.test(text)) {
    const title = extractTagText(text, "feed", "title");
    const items = extractAllBlocks(text, "entry").map((block) => parseAtomEntry(block, baseUrl));
    return { title, items, etag, lastModified };
  }

  console.warn(`[RSS-BOOK] Unknown feed format: ${url}`);
  return null;
}

// --- Regex-based XML helpers ---

function extractFirstBlock(xml, tag) {
  // Match <tag ...>...</tag> (non-greedy, handles nested same-name tags poorly but OK for feeds)
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[0] : "";
}

function extractAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi");
  return [...xml.matchAll(re)].map(m => m[0]);
}

function extractTagText(xml, parentTag, childTag) {
  // Finds the first <childTag> inside the first <parentTag> block
  const parent = extractFirstBlock(xml, parentTag);
  if (!parent) return "";
  return extractTextContent(parent, childTag);
}

function extractDirectChildText(block, tag) {
  // Gets text content of the first occurrence of <tag>
  return extractTextContent(block, tag);
}

function extractTextContent(xml, tag) {
  // Matches <tag>text</tag> or <tag attr="...">text</tag>, extracts text
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodeXmlEntities(stripCdata(m[1].trim()));
}

function stripCdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
}

function extractAttr(xml, tag, attr) {
  // Matches <tag ... attr="value" ...> or <tag ... attr='value' ...>
  const tagRe = new RegExp(`<${tag}\\s[^>]*${attr}\\s*=\\s*["']([^"']*)["'][^>]*/?>`, "i");
  const m = xml.match(tagRe);
  return m ? decodeXmlEntities(m[1]) : "";
}

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
  return s
    .replace(/&#(\d+);/g, (m, n) => decodeCodePoint(Number(n), m))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => decodeCodePoint(parseInt(h, 16), m))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function resolveItemLink(rawLink, baseUrl) {
  if (typeof rawLink !== "string") return "";
  const trimmed = rawLink.trim();
  if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return "";
  try {
    const parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
      return trimmed;
    }
    return parsed.href;
  } catch {
    return "";
  }
}

// --- Feed item parsers ---

function parseRssItem(block, baseUrl) {
  const title = extractTextContent(block, "title") || "(ohne Titel)";
  const link = resolveItemLink(extractTextContent(block, "link"), baseUrl);
  const guid = extractTextContent(block, "guid") || "";
  const pubDate = extractTextContent(block, "pubDate") || "";
  return { title, link, guid, published: pubDate };
}

function parseAtomEntry(block, baseUrl) {
  const title = extractTextContent(block, "title") || "(ohne Titel)";
  // Atom <link> uses href attribute; prefer rel="alternate"
  const rawLink = extractAtomAlternateLink(block) || extractAtomLink(block) || "";
  const link = resolveItemLink(rawLink, baseUrl);
  const id = extractTextContent(block, "id") || "";
  const updated = extractTextContent(block, "updated") || "";
  return { title, link, guid: id, published: updated };
}

function extractAtomAlternateLink(block) {
  // Match <link ... rel="alternate" ... href="..." ...> regardless of attribute order
  const links = [...block.matchAll(/<link\s[^>]*\/?>/gi)];
  for (const m of links) {
    const tag = m[0];
    if (/rel\s*=\s*["']alternate["']/i.test(tag)) {
      const href = tag.match(/href\s*=\s*["']([^"']*)["']/i);
      if (href) {
        const decoded = decodeXmlEntities(href[1]).trim();
        if (decoded) return decoded;
      }
    }
  }
  return "";
}

function extractAtomLink(block) {
  // Find first <link ... href="..."> in block
  const m = block.match(/<link\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*\/?>/i);
  return m ? decodeXmlEntities(m[1]).trim() : "";
}
