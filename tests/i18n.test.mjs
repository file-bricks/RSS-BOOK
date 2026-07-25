import { test } from "node:test";
import assert from "node:assert/strict";

import { applyI18n } from "../lib/i18n.js";

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = "";
    this.placeholder = "";
    this.title = "";
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

test("applyI18n maps aria label and description attributes", () => {
  const ariaTarget = new FakeElement({
    "data-i18n-aria-label": "optionsFeedUrlLabel",
    "data-i18n-aria-description": "optionsFeedUrlDescription",
    "data-i18n-placeholder": "optionsFeedUrlPlaceholder"
  });

  globalThis.chrome = {
    i18n: {
      getMessage(key) {
        return {
          optionsFeedUrlLabel: "Feed URL",
          optionsFeedUrlDescription: "Enter the full RSS or Atom feed URL to subscribe to it.",
          optionsFeedUrlPlaceholder: "https://example.com/feed.xml"
        }[key] || "";
      }
    }
  };

  const root = {
    querySelectorAll(selector) {
      if (selector === "[data-i18n-aria-label]") return [ariaTarget];
      if (selector === "[data-i18n-aria-description]") return [ariaTarget];
      if (selector === "[data-i18n-placeholder]") return [ariaTarget];
      return [];
    }
  };

  applyI18n(root);

  assert.equal(ariaTarget.getAttribute("aria-label"), "Feed URL");
  assert.equal(
    ariaTarget.getAttribute("aria-description"),
    "Enter the full RSS or Atom feed URL to subscribe to it."
  );
  assert.equal(ariaTarget.placeholder, "https://example.com/feed.xml");
});
