import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import {
  collectFeedLinksFromDocument,
  probeCommonFeedPaths
} from "../lib/discovery.js";

afterEach(() => {
  delete globalThis.document;
  delete globalThis.location;
});

function makeElement({ attrs = {}, href = "", title = "", textContent = "" }) {
  return {
    href,
    title,
    textContent,
    getAttribute(name) {
      return attrs[name] ?? "";
    }
  };
}

test("collects feed links from alternate tags and visible anchors", () => {
  const links = [
    makeElement({
      attrs: { rel: "alternate", type: "application/rss+xml" },
      href: "/rss.xml",
      title: "RSS feed"
    }),
    makeElement({
      attrs: { rel: "alternate feed", type: "application/atom+xml" },
      href: "/updates.atom",
      title: "Atom updates"
    }),
    makeElement({
      attrs: { rel: "alternate", type: "text/html" },
      href: "/not-a-feed",
      title: "Ignored"
    })
  ];
  const anchors = [
    makeElement({
      attrs: { href: "/atom.xml" },
      href: "/atom.xml",
      textContent: "Atom"
    }),
    makeElement({
      attrs: { href: "/rss.xml" },
      href: "/rss.xml",
      textContent: "Duplicate"
    }),
    makeElement({
      attrs: { href: "/about" },
      href: "/about",
      textContent: "About"
    })
  ];

  globalThis.location = new URL("https://example.test/articles/post");
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === "link[href]") return links;
      if (selector === "a[href]") return anchors;
      return [];
    }
  };

  assert.deepEqual(collectFeedLinksFromDocument(), {
    pageUrl: "https://example.test/articles/post",
    feeds: [
      { url: "https://example.test/rss.xml", title: "RSS feed" },
      { url: "https://example.test/updates.atom", title: "Atom updates" },
      { url: "https://example.test/atom.xml", title: "Atom" }
    ]
  });
});

test("probes common feed paths and ignores failed fetches", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === "https://example.test/feed") {
      return new Response("<rss><channel><title>Feed</title></channel></rss>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }
    if (url === "https://example.test/rss") {
      throw new TypeError("Failed to fetch");
    }
    return new Response("<html>not a feed</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  };

  assert.deepEqual(
    await probeCommonFeedPaths("https://example.test/article", [], fetchImpl),
    [{ url: "https://example.test/feed", title: "" }]
  );
  assert.ok(calls.includes("https://example.test/rss"));
});

test("skips invalid page URLs and already known feed URLs", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount++;
    return new Response("<rss></rss>", { status: 200 });
  };

  assert.deepEqual(await probeCommonFeedPaths("not a url", [], fetchImpl), []);
  assert.deepEqual(
    await probeCommonFeedPaths(
      "https://example.test/page",
      [{ url: "https://example.test/feed" }],
      fetchImpl
    ),
    [
      { url: "https://example.test/feed/", title: "" },
      { url: "https://example.test/rss", title: "" },
      { url: "https://example.test/rss/", title: "" },
      { url: "https://example.test/atom.xml", title: "" },
      { url: "https://example.test/feed.xml", title: "" },
      { url: "https://example.test/rss.xml", title: "" },
      { url: "https://example.test/index.xml", title: "" },
      { url: "https://example.test/feeds/posts/default", title: "" }
    ]
  );
  assert.equal(fetchCount, 8);
});
