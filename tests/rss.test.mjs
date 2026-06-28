import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { fetchFeedAndParse } from "../lib/rss.js";

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

function muteWarnings() {
  console.warn = () => {};
}

test("parses RSS 2.0 feeds and sends cache validators", async () => {
  let capturedRequest;
  globalThis.fetch = async (url, options = {}) => {
    capturedRequest = { url, headers: options.headers };
    return new Response(
      `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Example &amp; News</title>
          <item>
            <title>First &lt;Post&gt;</title>
            <link>https://example.test/first</link>
            <guid>item-1</guid>
            <pubDate>Thu, 30 Apr 2026 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`,
      {
        status: 200,
        headers: {
          ETag: '"fresh"',
          "Last-Modified": "Thu, 30 Apr 2026 09:00:00 GMT"
        }
      }
    );
  };

  const parsed = await fetchFeedAndParse("https://example.test/feed.xml", {
    etag: '"old"',
    lastModified: "Wed, 29 Apr 2026 09:00:00 GMT"
  });

  assert.equal(capturedRequest.url, "https://example.test/feed.xml");
  assert.equal(capturedRequest.headers["If-None-Match"], '"old"');
  assert.equal(capturedRequest.headers["If-Modified-Since"], "Wed, 29 Apr 2026 09:00:00 GMT");
  assert.equal(parsed.title, "Example & News");
  assert.equal(parsed.etag, '"fresh"');
  assert.equal(parsed.lastModified, "Thu, 30 Apr 2026 09:00:00 GMT");
  assert.deepEqual(parsed.items, [
    {
      title: "First <Post>",
      link: "https://example.test/first",
      guid: "item-1",
      published: "Thu, 30 Apr 2026 10:00:00 GMT"
    }
  ]);
});

test("strips CDATA wrappers from RSS and Atom text content", async () => {
  globalThis.fetch = async () => new Response(
    `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title><![CDATA[Example & News]]></title>
        <item>
          <title><![CDATA[First <Post>]]></title>
          <link><![CDATA[https://example.test/first]]></link>
          <guid>item-1</guid>
        </item>
      </channel>
    </rss>`,
    { status: 200 }
  );

  const rssParsed = await fetchFeedAndParse("https://example.test/feed.xml");

  assert.equal(rssParsed.title, "Example & News");
  assert.deepEqual(rssParsed.items, [
    {
      title: "First <Post>",
      link: "https://example.test/first",
      guid: "item-1",
      published: ""
    }
  ]);

  globalThis.fetch = async () => new Response(
    `<feed xmlns="http://www.w3.org/2005/Atom">
      <title><![CDATA[Atom Feed]]></title>
      <entry>
        <title><![CDATA[Atom & One]]></title>
        <id>urn:post:1</id>
        <updated><![CDATA[2026-04-30T10:00:00Z]]></updated>
        <link href="https://example.test/one" rel="alternate" />
      </entry>
    </feed>`,
    { status: 200 }
  );

  const atomParsed = await fetchFeedAndParse("https://example.test/atom.xml");

  assert.equal(atomParsed.title, "Atom Feed");
  assert.deepEqual(atomParsed.items, [
    {
      title: "Atom & One",
      link: "https://example.test/one",
      guid: "urn:post:1",
      published: "2026-04-30T10:00:00Z"
    }
  ]);
});

test("decodes XML entities once without double-decoding escaped entity text", async () => {
  globalThis.fetch = async () => new Response(
    `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Literal &amp;lt;Feed&amp;gt;</title>
        <item>
          <title>Literal &amp;lt;Post&amp;gt;</title>
          <link>https://example.test/entity</link>
        </item>
      </channel>
    </rss>`,
    { status: 200 }
  );

  const parsed = await fetchFeedAndParse("https://example.test/feed.xml");

  assert.equal(parsed.title, "Literal &lt;Feed&gt;");
  assert.equal(parsed.items[0].title, "Literal &lt;Post&gt;");
});

test("parses Atom entries and prefers rel alternate links regardless of attribute order", async () => {
  globalThis.fetch = async () => new Response(
    `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <title>Atom &amp; One</title>
        <id>urn:post:1</id>
        <updated>2026-04-30T10:00:00Z</updated>
        <link href="https://example.test/self" rel="self" />
        <link href="https://example.test/one" rel="alternate" />
      </entry>
      <entry>
        <title>Fallback Link</title>
        <id>urn:post:2</id>
        <updated>2026-04-30T11:00:00Z</updated>
        <link rel="alternate" href="https://example.test/two" />
      </entry>
    </feed>`,
    { status: 200 }
  );

  const parsed = await fetchFeedAndParse("https://example.test/atom.xml");

  assert.equal(parsed.title, "Atom Feed");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].link, "https://example.test/one");
  assert.equal(parsed.items[1].link, "https://example.test/two");
});

test("returns empty items on 304 and keeps cached validators", async () => {
  globalThis.fetch = async () => new Response(null, { status: 304 });

  const parsed = await fetchFeedAndParse("https://example.test/feed.xml", {
    etag: '"cached"',
    lastModified: "Thu, 30 Apr 2026 09:00:00 GMT"
  });

  assert.deepEqual(parsed, {
    title: "",
    items: [],
    etag: '"cached"',
    lastModified: "Thu, 30 Apr 2026 09:00:00 GMT"
  });
});

test("RSS-Feed mit <feed>-Text im CDATA-Block wird nicht als Atom fehlinterpretiert", async () => {
  // Regression: Wenn ein RSS-Item in seinem Beschreibungs-CDATA den Text "<feed " enthält,
  // darf die Format-Erkennung nicht auf Atom umschalten und 0 Items liefern.
  globalThis.fetch = async () => new Response(
    `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Dev Blog</title>
        <item>
          <title>Feed-Referenz im Text</title>
          <link>https://example.test/post</link>
          <description><![CDATA[Abonniere unseren <feed type="rss"> hier.]]></description>
          <guid>post-cdata-feed</guid>
        </item>
      </channel>
    </rss>`,
    { status: 200 }
  );

  const parsed = await fetchFeedAndParse("https://example.test/rss.xml");
  assert.ok(parsed, "Feed muss geparst werden");
  assert.equal(parsed.items.length, 1, "RSS-Feed muss 1 Item liefern");
  assert.equal(parsed.items[0].title, "Feed-Referenz im Text");
  assert.equal(parsed.items[0].link, "https://example.test/post");
});

test("returns null for failed requests and unknown feed formats", async () => {
  muteWarnings();
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  assert.equal(await fetchFeedAndParse("https://example.test/fail.xml"), null);

  globalThis.fetch = async () => new Response("<html>not a feed</html>", { status: 200 });
  assert.equal(await fetchFeedAndParse("https://example.test/page.html"), null);
});
