import { test } from "node:test";
import assert from "node:assert/strict";

import { generateOPML, parseOPML } from "../lib/opml.js";

test("generates OPML with escaped feed titles and URLs", () => {
  const opml = generateOPML([
    { title: 'News & "Updates"', url: "https://example.test/rss?topic=a&b=1" },
    { title: "Less <More>", url: "https://example.test/atom.xml" }
  ]);

  assert.match(opml, /<opml version="2\.0">/);
  assert.match(opml, /text="News &amp; &quot;Updates&quot;"/);
  assert.match(opml, /xmlUrl="https:\/\/example\.test\/rss\?topic=a&amp;b=1"/);
  assert.match(opml, /text="Less &lt;More&gt;"/);
});

test("parses OPML outlines with title or text fallback", () => {
  const feeds = parseOPML(`
    <opml version="2.0">
      <body>
        <outline text="Folder">
          <outline text="Feed One" type="rss" xmlUrl="https://example.test/one.xml" />
          <outline title="Feed &amp; Two" type="rss" xmlUrl='https://example.test/two.xml' />
          <outline text="No URL" />
        </outline>
      </body>
    </opml>
  `);

  assert.deepEqual(feeds, [
    { url: "https://example.test/one.xml", title: "Feed One" },
    { url: "https://example.test/two.xml", title: "Feed & Two" }
  ]);
});

test("round-trips generated OPML back into feed records", () => {
  const sourceFeeds = [
    { title: "Alpha", url: "https://alpha.test/feed.xml" },
    { title: "Beta & Friends", url: "https://beta.test/rss.xml" }
  ];

  assert.deepEqual(parseOPML(generateOPML(sourceFeeds)), sourceFeeds);
});
