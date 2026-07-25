export function t(key, substitutions) {
  // chrome.i18n.getMessage returns "" for unknown keys
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function applyI18n(root = document) {
  // Elements with data-i18n="key" get textContent replaced
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text && text !== key) el.textContent = text;
  }
  // Elements with data-i18n-placeholder="key" get placeholder replaced
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.getAttribute("data-i18n-placeholder");
    const text = t(key);
    if (text && text !== key) el.placeholder = text;
  }
  // Elements with data-i18n-title="key" get title replaced
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    const key = el.getAttribute("data-i18n-title");
    const text = t(key);
    if (text && text !== key) el.title = text;
  }
  // Elements with data-i18n-aria-label="key" get aria-label replaced
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    const key = el.getAttribute("data-i18n-aria-label");
    const text = t(key);
    if (text && text !== key) el.setAttribute("aria-label", text);
  }
  // Elements with data-i18n-aria-description="key" get aria-description replaced
  for (const el of root.querySelectorAll("[data-i18n-aria-description]")) {
    const key = el.getAttribute("data-i18n-aria-description");
    const text = t(key);
    if (text && text !== key) el.setAttribute("aria-description", text);
  }
}
