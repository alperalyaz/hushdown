const i18n = (key) => chrome.i18n.getMessage(key) || key;

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = i18n(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = i18n(el.dataset.i18nPlaceholder);
  });
}

const MODE_TIMESTAMP = "timestamp";
const MODE_TIMESTAMP_ORIGINAL = "timestamp-original";
const MODE_ORIGINAL = "original";

const VALID_MODES = new Set([
  MODE_TIMESTAMP,
  MODE_TIMESTAMP_ORIGINAL,
  MODE_ORIGINAL,
]);

const openDownloadsBtn = document.getElementById("openDownloads");
const logEl = document.getElementById("log");
const logEmptyEl = document.getElementById("logEmpty");
const searchInput = document.getElementById("searchInput");
const filenameModeRadios = document.querySelectorAll('input[name="filenameMode"]');
const folderOrganizationCheckbox = document.getElementById("folderOrganization");

let allEntries = [];
let allThumbMap = {};

function loadFilenameMode() {
  chrome.storage.sync.get({ filenameMode: MODE_TIMESTAMP }, (data) => {
    const mode = VALID_MODES.has(data.filenameMode)
      ? data.filenameMode
      : MODE_TIMESTAMP;
    filenameModeRadios.forEach((radio) => {
      radio.checked = radio.value === mode;
    });
  });
}

function showVersion() {
  const el = document.getElementById("versionLabel");
  if (el) el.textContent = "v" + chrome.runtime.getManifest().version;
}

function initFilenameModeRadios() {
  filenameModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      chrome.storage.sync.set({ filenameMode: radio.value });
    });
  });
}

function loadFolderOrganization() {
  chrome.storage.sync.get({ folderOrganization: false }, (data) => {
    folderOrganizationCheckbox.checked = data.folderOrganization === true;
  });
}

function initFolderOrganizationToggle() {
  folderOrganizationCheckbox.addEventListener("change", () => {
    chrome.storage.sync.set({ folderOrganization: folderOrganizationCheckbox.checked });
  });
}

function removeLogEntry(downloadId, entryTime) {
  chrome.storage.local.get({ downloadLog: [] }, (data) => {
    const entries = data.downloadLog || [];
    const idx = entries.findIndex((e) =>
      downloadId ? Number(e.id) === downloadId : e.time === entryTime
    );
    if (idx === -1) { load(); return; }
    const removed = entries[idx];
    const next = entries.filter((_, i) => i !== idx);

    function cleanup() {
      chrome.storage.local.set({ downloadLog: next }, () => {
        if (removed && removed.id) {
          chrome.storage.local.remove("thumb_" + removed.id);
        }
        load();
      });
    }

    if (removed && removed.id) {
      chrome.downloads.removeFile(Number(removed.id), () => {
        void chrome.runtime.lastError;
        cleanup();
      });
    } else {
      cleanup();
    }
  });
}

function renderLog(entries, thumbMap) {
  logEl.innerHTML = "";
  if (!entries || !entries.length) {
    logEmptyEl.hidden = false;
    return;
  }
  logEmptyEl.hidden = true;
  entries.forEach((row) => {
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
      removeLogEntry(hasId ? id : null, row.time);
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

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return renderLog(allEntries, allThumbMap);
  const filtered = allEntries.filter((e) =>
    (e.name || "").toLowerCase().includes(q)
  );
  renderLog(filtered, allThumbMap);
}

function load() {
  chrome.storage.local.get({ downloadLog: [] }, (data) => {
    allEntries = data.downloadLog || [];
    const thumbKeys = allEntries
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => "thumb_" + id);

    if (thumbKeys.length) {
      chrome.storage.local.get(thumbKeys, (thumbMap) => {
        allThumbMap = thumbMap || {};
        applySearch();
      });
    } else {
      allThumbMap = {};
      applySearch();
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

searchInput.addEventListener("input", applySearch);

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  showVersion();
  initFilenameModeRadios();
  loadFilenameMode();
  initFolderOrganizationToggle();
  loadFolderOrganization();
  load();
});
