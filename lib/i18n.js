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
}
