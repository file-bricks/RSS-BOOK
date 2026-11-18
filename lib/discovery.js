const COMMON_FEED_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss/",
  "/atom.xml",
  "/feed.xml",
  "/rss.xml",
  "/index.xml",
  "/feeds/posts/default"
];

export function collectFeedLinksFromDocument() {
  const found = [];
  const seen = new Set();
  const add = (url, title) => {
    if (!url || typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return;
    try {
      const parsed = new URL(trimmed, location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      const abs = parsed.href;
      if (seen.has(abs)) return;
      seen.add(abs);
      found.push({ url: abs, title: title || "" });
    } catch {}
  };

  for (const link of document.querySelectorAll("link[href]")) {
    const relTokens = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    if (!relTokens.includes("alternate")) continue;

    const type = (link.getAttribute("type") || "").toLowerCase();
    if (
      type.includes("rss") ||
      type.includes("atom") ||
      type === "application/xml" ||
      type === "text/xml"
    ) {
      add(link.href, link.title);
    }
  }

  const feedRe = /(^|\/)(feed|rss|atom|feeds|feed\.xml|rss\.xml|atom\.xml|index\.xml)(\/|\.xml|$|\?)/i;
  for (const anchor of document.querySelectorAll("a[href]")) {
    const rawHref = (anchor.getAttribute("href") || "").trim();
    if (!rawHref || rawHref.startsWith("#")) continue;
    const text = (anchor.textContent || "").trim().toLowerCase();
    if (feedRe.test(rawHref) || /^(rss|atom|feed)$/i.test(text)) {
      add(anchor.href || rawHref, anchor.title || anchor.textContent?.trim() || "");
    }
  }

  return { feeds: found, pageUrl: location.href };
}

export async function probeCommonFeedPaths(pageUrl, existingFeeds = [], fetchImpl = globalThis.fetch) {
  if (!pageUrl || typeof fetchImpl !== "function") return [];

  let parsedPage;
  try {
    parsedPage = new URL(pageUrl);
  } catch {
    return [];
  }
  if (parsedPage.protocol !== "http:" && parsedPage.protocol !== "https:") {
    return [];
  }

  const origin = parsedPage.origin;
  const discovered = [];
  const seen = new Set(existingFeeds.map((feed) => feed.url).filter(Boolean));

  const probes = await Promise.all(COMMON_FEED_PATHS.map(async (path) => {
    const url = origin + path;
    if (seen.has(url)) return null;

    try {
      const response = await fetchImpl(url, { method: "GET", redirect: "follow" });
      if (!response.ok) return null;

      const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
      const text = (await response.text()).slice(0, 2048);
      const looksFeed =
        contentType.includes("xml") ||
        contentType.includes("rss") ||
        contentType.includes("atom") ||
        /<rss[\s>]/i.test(text) ||
        /<feed[\s>]/i.test(text) ||
        /<rdf:RDF[\s>]/i.test(text);

      if (!looksFeed) return null;

      const finalUrl = response.url || url;
      const parsedFinal = new URL(finalUrl);
      if (parsedFinal.protocol !== "http:" && parsedFinal.protocol !== "https:") {
        return null;
      }
      return { url: finalUrl, title: "" };
    } catch {
      return null;
    }
  }));

  for (const feed of probes) {
    if (feed && !seen.has(feed.url)) {
      seen.add(feed.url);
      discovered.push(feed);
    }
  }

  return discovered;
}
