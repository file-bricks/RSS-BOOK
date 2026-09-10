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

test("parseOPML decodes numeric XML entities in feed titles", () => {
  // Regression: older OPML exporters may encode accented chars as &#233; or &#xE9;
  const opml = `<opml version="2.0"><body>
    <outline text="Caf&#233; Scientifique" title="Caf&#233; Scientifique" type="rss" xmlUrl="https://cafe.test/feed" />
    <outline text="R&#xE9;sum&#233;" type="rss" xmlUrl="https://resume.test/feed" />
  </body></opml>`;

  const feeds = parseOPML(opml);
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].title, "Café Scientifique");
  assert.equal(feeds[1].title, "Résumé");
});

test("parseOPML decodes XML entities once without double-decoding escaped entity text", () => {
  const feeds = parseOPML(
    `<opml><body>
      <outline text="Literal &amp;lt;Feed&amp;gt;" xmlUrl="https://entity.example/feed" />
    </body></opml>`
  );

  assert.deepEqual(feeds, [
    { url: "https://entity.example/feed", title: "Literal &lt;Feed&gt;" }
  ]);
});

test("parseOPML trimmt fuehrenden/trailing Whitespace aus Feed-Titeln", () => {
  // Regression: xmlUrl wurde bereits getrimmt, der title/text-Wert aber nicht.
  // Führende/trailing Leerzeichen im OPML-Attribut würden als Bookmark-Ordnertitel landen.
  const feeds = parseOPML(
    `<opml><body><outline text="  Padded Title  " xmlUrl="https://example.test/feed" /></body></opml>`
  );
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].title, "Padded Title");
});

test("parseOPML trims whitespace from xmlUrl values", () => {
  const feeds = parseOPML(
    `<opml><body><outline text="Padded" xmlUrl="  https://padded.example/feed  " /></body></opml>`
  );
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].url, "https://padded.example/feed");
});

test("parseOPML falls back to text attribute when title attribute is present but empty", () => {
  const feeds = parseOPML(
    `<opml><body>
      <outline title="" text="Fallback Title" xmlUrl="https://fallback.example/feed" />
    </body></opml>`
  );
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].title, "Fallback Title");
  assert.equal(feeds[0].url, "https://fallback.example/feed");
});

test("parseOPML strips UTF-8 BOM if present", () => {
  const bomOpml = "\uFEFF<opml version=\"2.0\"><body><outline text=\"BOM Feed\" xmlUrl=\"https://bom.example/feed\" /></body></opml>";
  const feeds = parseOPML(bomOpml);
  assert.equal(feeds.length, 1);
  assert.equal(feeds[0].title, "BOM Feed");
  assert.equal(feeds[0].url, "https://bom.example/feed");
});

test("parses real-world Feedly OPML export with nested categories and multi-line outlines", () => {
  const feedlyExport = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>feedly Cloud OPML Export</title>
  </head>
  <body>
    <outline text="Technology" title="Technology">
      <outline
        type="rss"
        text="Ars Technica"
        title="Ars Technica"
        xmlUrl="https://feeds.arstechnica.com/arstechnica/index"
        htmlUrl="https://arstechnica.com" />
      <outline
        type="rss"
        htmlUrl="https://news.ycombinator.com"
        xmlUrl="https://news.ycombinator.com/rss"
        text="Hacker News"
        title="Hacker News" />
    </outline>
    <outline text="Science &amp; Nature" title="Science &amp; Nature">
      <outline
        type="rss"
        text="Nature News &amp; Comment"
        title="Nature News &amp; Comment"
        xmlUrl="https://www.nature.com/nature.rss"
        htmlUrl="https://www.nature.com" />
    </outline>
  </body>
</opml>`;

  const feeds = parseOPML(feedlyExport);
  assert.equal(feeds.length, 3);
  assert.deepEqual(feeds, [
    { url: "https://feeds.arstechnica.com/arstechnica/index", title: "Ars Technica" },
    { url: "https://news.ycombinator.com/rss", title: "Hacker News" },
    { url: "https://www.nature.com/nature.rss", title: "Nature News & Comment" }
  ]);
});

test("parses real-world Thunderbird OPML export with CRLF line endings and entities", () => {
  const thunderbirdExport = "<?xml version=\"1.0\"?>\r\n" +
    "<opml version=\"1.0\">\r\n" +
    "  <head>\r\n" +
    "    <title>Thunderbird Feeds</title>\r\n" +
    "  </head>\r\n" +
    "  <body>\r\n" +
    "    <outline title=\"Nachrichten\" text=\"Nachrichten\">\r\n" +
    "      <outline type=\"rss\" version=\"RSS\" text=\"Tagesschau &amp; Aktuelles\" title=\"Tagesschau &amp; Aktuelles\" xmlUrl=\"https://www.tagesschau.de/xml/rss2/\" htmlUrl=\"https://www.tagesschau.de/\" />\r\n" +
    "      <outline type=\"rss\" version=\"RSS2\" text=\"Heise &Ouml;ffentlichkeit\" title=\"Heise &#214;ffentlichkeit\" xmlUrl=\"https://www.heise.de/rss/heise-atom.xml\" htmlUrl=\"https://www.heise.de/\" />\r\n" +
    "    </outline>\r\n" +
    "  </body>\r\n" +
    "</opml>\r\n";

  const feeds = parseOPML(thunderbirdExport);
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].url, "https://www.tagesschau.de/xml/rss2/");
  assert.equal(feeds[0].title, "Tagesschau & Aktuelles");
  assert.equal(feeds[1].url, "https://www.heise.de/rss/heise-atom.xml");
  assert.equal(feeds[1].title, "Heise Öffentlichkeit");
});

test("parseOPML handles empty or non-string inputs gracefully", () => {
  assert.deepEqual(parseOPML(""), []);
  assert.deepEqual(parseOPML(null), []);
  assert.deepEqual(parseOPML(undefined), []);
  assert.deepEqual(parseOPML("<opml><body><outline text='No Feeds Here'/></body></opml>"), []);
});
