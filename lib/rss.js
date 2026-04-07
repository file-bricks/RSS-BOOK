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

  // DOMParser is NOT available in MV3 service workers — use regex-based XML parsing

  // Atom?
  if (/<feed[\s>]/i.test(text)) {
    const title = extractTagText(text, "feed", "title");
    const items = extractAllBlocks(text, "entry").map(parseAtomEntry);
    return { title, items, etag, lastModified };
  }

  // RSS 2.0?
  if (/<rss[\s>]/i.test(text) || /<channel[\s>]/i.test(text)) {
    const channelBlock = extractFirstBlock(text, "channel") || text;
    const title = extractDirectChildText(channelBlock, "title");
    const items = extractAllBlocks(channelBlock, "item").map(parseRssItem);
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
  return decodeXmlEntities(m[1].trim());
}

function extractAttr(xml, tag, attr) {
  // Matches <tag ... attr="value" ...> or <tag ... attr='value' ...>
  const tagRe = new RegExp(`<${tag}\\s[^>]*${attr}\\s*=\\s*["']([^"']*)["'][^>]*/?>`, "i");
  const m = xml.match(tagRe);
  return m ? decodeXmlEntities(m[1]) : "";
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// --- Feed item parsers ---

function parseRssItem(block) {
  const title = extractTextContent(block, "title") || "(ohne Titel)";
  const link = extractTextContent(block, "link") || "";
  const guid = extractTextContent(block, "guid") || "";
  const pubDate = extractTextContent(block, "pubDate") || "";
  return { title, link, guid, published: pubDate };
}

function parseAtomEntry(block) {
  const title = extractTextContent(block, "title") || "(ohne Titel)";
  // Atom <link> uses href attribute; prefer rel="alternate"
  const link = extractAtomAlternateLink(block) || extractAtomLink(block) || "";
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
      if (href) return decodeXmlEntities(href[1]);
    }
  }
  return "";
}

function extractAtomLink(block) {
  // Find first <link ... href="..."> in block
  const m = block.match(/<link\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*\/?>/i);
  return m ? decodeXmlEntities(m[1]) : "";
}
