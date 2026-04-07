import { getAllFeeds } from "../lib/storage.js";

const feedList = document.getElementById("feedList");
const statusEl = document.getElementById("status");

async function render() {
  const feeds = await getAllFeeds();

  if (feeds.length === 0) {
    feedList.innerHTML = '<div class="empty">Keine Feeds abonniert.<br>Klicke auf Einstellungen.</div>';
    return;
  }

  feedList.innerHTML = "";
  for (const feed of feeds) {
    const div = document.createElement("div");
    div.className = "feed-item";

    const name = document.createElement("span");
    name.className = "feed-name";
    name.textContent = feed.title || feed.url;
    name.title = feed.url;

    const info = document.createElement("span");
    info.className = "feed-count";
    if (feed.lastFetch) {
      const ago = Math.round((Date.now() - feed.lastFetch) / 60000);
      info.textContent = ago < 1 ? "gerade eben" : `vor ${ago} Min`;
    } else {
      info.textContent = "nie aktualisiert";
    }

    div.appendChild(name);
    div.appendChild(info);
    feedList.appendChild(div);
  }
}

document.getElementById("updateBtn").addEventListener("click", async () => {
  const btn = document.getElementById("updateBtn");
  statusEl.textContent = "Aktualisiere...";
  btn.disabled = true;

  try {
    const res = await chrome.runtime.sendMessage({ action: "updateAll" });
    if (res?.ok) {
      statusEl.textContent = "Fertig!";
    } else {
      statusEl.textContent = "Fehler: " + (res?.error || "Unbekannt");
    }
  } catch (err) {
    statusEl.textContent = "Fehler: " + err.message;
  }

  btn.disabled = false;
  setTimeout(() => { statusEl.textContent = ""; }, 3000);
  await render();
});

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
