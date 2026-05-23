import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { fetchFeedAndParse } from "../lib/rss.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const feedFixtures = [
  {
    name: "WordPress RSS 2.0",
    url: "https://example.test/wordpress/feed",
    xml: `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>WordPress News</title>
          <item>
            <title>Release Notes</title>
            <link>https://example.test/wp/release</link>
            <guid isPermaLink="false">wp-1</guid>
            <pubDate>Thu, 21 May 2026 10:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>Body</p>]]></content:encoded>
          </item>
        </channel>
      </rss>`,
    expected: {
      title: "WordPress News",
      count: 1,
      firstTitle: "Release Notes",
      firstLink: "https://example.test/wp/release",
      firstGuid: "wp-1",
      firstPublished: "Thu, 21 May 2026 10:00:00 GMT"
    }
  },
  {
    name: "Podcast RSS",
    url: "https://example.test/podcast.xml",
    xml: `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Audio Briefing</title>
        <item>
          <title>Episode 42</title>
          <link>https://example.test/podcast/42</link>
          <guid>episode-42</guid>
          <pubDate>Wed, 20 May 2026 08:30:00 GMT</pubDate>
          <enclosure url="https://cdn.example.test/42.mp3" type="audio/mpeg" />
        </item>
      </channel>
    </rss>`,
    expected: {
      title: "Audio Briefing",
      count: 1,
      firstTitle: "Episode 42",
      firstLink: "https://example.test/podcast/42",
      firstGuid: "episode-42",
      firstPublished: "Wed, 20 May 2026 08:30:00 GMT"
    }
  },
  {
    name: "FeedBurner-style RSS",
    url: "https://example.test/feedburner",
    xml: `<rss version="2.0" xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0">
      <channel>
        <title>Burned Feed</title>
        <item>
          <title>Canonical Story</title>
          <link>https://example.test/story?utm_source=feed</link>
          <guid isPermaLink="false">burn-1</guid>
          <pubDate>Tue, 19 May 2026 12:00:00 GMT</pubDate>
          <feedburner:origLink>https://example.test/story</feedburner:origLink>
        </item>
      </channel>
    </rss>`,
    expected: {
      title: "Burned Feed",
      count: 1,
      firstTitle: "Canonical Story",
      firstLink: "https://example.test/story?utm_source=feed",
      firstGuid: "burn-1",
      firstPublished: "Tue, 19 May 2026 12:00:00 GMT"
    }
  },
  {
    name: "Media RSS",
    url: "https://example.test/media-rss",
    xml: `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
      <channel>
        <title>Media Updates</title>
        <item>
          <title>Gallery Item</title>
          <link>https://example.test/gallery/item</link>
          <guid>media-1</guid>
          <pubDate>Mon, 18 May 2026 09:15:00 GMT</pubDate>
          <media:content url="https://img.example.test/item.jpg" medium="image" />
        </item>
      </channel>
    </rss>`,
    expected: {
      title: "Media Updates",
      count: 1,
      firstTitle: "Gallery Item",
      firstLink: "https://example.test/gallery/item",
      firstGuid: "media-1",
      firstPublished: "Mon, 18 May 2026 09:15:00 GMT"
    }
  },
  {
    name: "RSS 1.0 RDF",
    url: "https://example.test/rdf.xml",
    xml: `<rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/">
      <channel rdf:about="https://example.test/">
        <title>RDF Feed</title>
        <link>https://example.test/</link>
      </channel>
      <item rdf:about="https://example.test/rdf-one">
        <title>RDF Item</title>
        <link>https://example.test/rdf-one</link>
        <guid>rdf-1</guid>
      </item>
    </rdf:RDF>`,
    expected: {
      title: "RDF Feed",
      count: 1,
      firstTitle: "RDF Item",
      firstLink: "https://example.test/rdf-one",
      firstGuid: "rdf-1",
      firstPublished: ""
    }
  },
  {
    name: "Atom GitHub releases",
    url: "https://example.test/releases.atom",
    xml: `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Repo Releases</title>
      <entry>
        <title>v1.1.2</title>
        <id>tag:example.test,2026:Release/112</id>
        <updated>2026-05-17T21:00:00Z</updated>
        <link type="text/html" rel="alternate" href="https://example.test/releases/v1.1.2" />
      </entry>
    </feed>`,
    expected: {
      title: "Repo Releases",
      count: 1,
      firstTitle: "v1.1.2",
      firstLink: "https://example.test/releases/v1.1.2",
      firstGuid: "tag:example.test,2026:Release/112",
      firstPublished: "2026-05-17T21:00:00Z"
    }
  },
  {
    name: "Blogger Atom",
    url: "https://example.test/blogger/feeds/posts/default",
    xml: `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Blogger Feed</title>
      <entry>
        <title>Post One</title>
        <id>tag:blogger.example.test,2026:post-1</id>
        <updated>2026-05-16T07:45:00Z</updated>
        <link rel="self" href="https://example.test/blogger/self" />
        <link rel="alternate" type="text/html" href="https://example.test/blogger/post-one" />
      </entry>
    </feed>`,
    expected: {
      title: "Blogger Feed",
      count: 1,
      firstTitle: "Post One",
      firstLink: "https://example.test/blogger/post-one",
      firstGuid: "tag:blogger.example.test,2026:post-1",
      firstPublished: "2026-05-16T07:45:00Z"
    }
  },
  {
    name: "YouTube Atom",
    url: "https://example.test/youtube.xml",
    xml: `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <title>Channel Videos</title>
      <entry>
        <title>Video One</title>
        <id>yt:video:abc123</id>
        <updated>2026-05-15T15:30:00Z</updated>
        <link rel="alternate" href="https://example.test/watch?v=abc123" />
        <yt:videoId>abc123</yt:videoId>
      </entry>
    </feed>`,
    expected: {
      title: "Channel Videos",
      count: 1,
      firstTitle: "Video One",
      firstLink: "https://example.test/watch?v=abc123",
      firstGuid: "yt:video:abc123",
      firstPublished: "2026-05-15T15:30:00Z"
    }
  },
  {
    name: "Mastodon Atom",
    url: "https://example.test/@rss.atom",
    xml: `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Profile Feed</title>
      <entry>
        <title>Short status</title>
        <id>https://example.test/@user/1</id>
        <updated>2026-05-14T13:00:00Z</updated>
        <link href="https://example.test/@user/1" />
      </entry>
    </feed>`,
    expected: {
      title: "Profile Feed",
      count: 1,
      firstTitle: "Short status",
      firstLink: "https://example.test/@user/1",
      firstGuid: "https://example.test/@user/1",
      firstPublished: "2026-05-14T13:00:00Z"
    }
  },
  {
    name: "Minimal RSS with CDATA title",
    url: "https://example.test/minimal.xml",
    xml: `<channel>
      <title><![CDATA[Minimal & Useful]]></title>
      <item>
        <title><![CDATA[Plain Link]]></title>
        <link><![CDATA[https://example.test/plain]]></link>
        <guid>plain-1</guid>
      </item>
    </channel>`,
    expected: {
      title: "Minimal & Useful",
      count: 1,
      firstTitle: "Plain Link",
      firstLink: "https://example.test/plain",
      firstGuid: "plain-1",
      firstPublished: ""
    }
  }
];

test("parses ten common RSS and Atom feed variants", async () => {
  assert.equal(feedFixtures.length, 10);

  for (const fixture of feedFixtures) {
    globalThis.fetch = async (url) => {
      assert.equal(url, fixture.url, fixture.name);
      return new Response(fixture.xml, { status: 200 });
    };

    const parsed = await fetchFeedAndParse(fixture.url);

    assert.ok(parsed, `${fixture.name} should parse`);
    assert.equal(parsed.title, fixture.expected.title, fixture.name);
    assert.equal(parsed.items.length, fixture.expected.count, fixture.name);
    assert.equal(parsed.items[0].title, fixture.expected.firstTitle, fixture.name);
    assert.equal(parsed.items[0].link, fixture.expected.firstLink, fixture.name);
    assert.equal(parsed.items[0].guid, fixture.expected.firstGuid, fixture.name);
    assert.equal(parsed.items[0].published, fixture.expected.firstPublished, fixture.name);
  }
});
