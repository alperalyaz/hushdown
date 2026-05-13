const i18n = (key) => chrome.i18n.getMessage(key) || key;

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = i18n(el.dataset.i18nTitle);
  });
}

const openDownloadsBtn = document.getElementById("openDownloads");
const logEl = document.getElementById("log");
const logEmptyEl = document.getElementById("logEmpty");

function removeLogEntry(rowIndex) {
  chrome.storage.sync.get({ downloadLog: [] }, (data) => {
    const entries = data.downloadLog || [];
    const removed = entries[rowIndex];
    const next = entries.filter((_, i) => i !== rowIndex);
    chrome.storage.sync.set({ downloadLog: next }, () => {
      if (removed && removed.id) {
        chrome.storage.local.remove("thumb_" + removed.id);
      }
      load();
    });
  });
}

function renderLog(entries, thumbMap) {
  logEl.innerHTML = "";
  if (!entries || !entries.length) {
    logEmptyEl.hidden = false;
    return;
  }
  logEmptyEl.hidden = true;
  entries.forEach((row, rowIndex) => {
    const li = document.createElement("li");
    li.className = "hd-log-row";

    const id = Number(row.id);
    const hasId = Number.isFinite(id) && id > 0;
    const thumb = hasId ? thumbMap["thumb_" + id] : null;

    if (thumb) {
      const img = document.createElement("img");
      img.className = "hd-log-thumb";
      img.src = thumb;
      img.alt = "";
      li.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "hd-log-info";

    const name = document.createElement("span");
    name.className = "hd-log-name";
    name.textContent = row.name || "";

    const time = document.createElement("span");
    time.className = "hd-log-time";
    time.textContent = row.time || "";

    info.appendChild(name);
    info.appendChild(time);
    li.appendChild(info);

    const del = document.createElement("button");
    del.className = "hd-log-del";
    del.textContent = "×";
    del.title = i18n("removeFromList");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      removeLogEntry(rowIndex);
    });
    li.appendChild(del);

    if (hasId) {
      li.dataset.downloadId = String(id);
      li.tabIndex = 0;
      li.title = i18n("clickToOpen");
    }
    logEl.appendChild(li);
  });
}

function load() {
  chrome.storage.sync.get({ downloadLog: [] }, (data) => {
    const entries = data.downloadLog || [];
    const thumbKeys = entries
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => "thumb_" + id);

    if (thumbKeys.length) {
      chrome.storage.local.get(thumbKeys, (thumbMap) => {
        renderLog(entries, thumbMap || {});
      });
    } else {
      renderLog(entries, {});
    }
  });
}

logEl.addEventListener("click", (e) => {
  const li = e.target.closest("li.hd-log-row");
  if (!li || !li.dataset.downloadId) return;
  chrome.downloads.open(Number(li.dataset.downloadId));
});

logEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const li = e.target.closest("li.hd-log-row");
  if (!li || !li.dataset.downloadId) return;
  e.preventDefault();
  chrome.downloads.open(Number(li.dataset.downloadId));
});

openDownloadsBtn.addEventListener("click", () => {
  chrome.downloads.showDefaultFolder();
});

document.getElementById("fullHistory").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://downloads/" });
});

document.getElementById("helpBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://alperalyaz.github.io/hushdown/" });
});

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  load();
});
