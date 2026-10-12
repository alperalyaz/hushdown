const i18n = (key, subs) => chrome.i18n.getMessage(key, subs) || key;

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

const RECENT_MAX = 6;

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const logEmptyEl = $("logEmpty");
const searchInput = $("searchInput");

let allEntries = [];
let allThumbMap = {};
let current = { project: "", fromGroup: false };
// Loaded ahead of time: permissions.request must run straight from the click.
let tabsState = { granted: false, asked: false };

async function loadTabsState() {
  const granted = await chrome.permissions.contains({ permissions: ["tabs"] });
  const { tabsAsked = false } = await chrome.storage.local.get("tabsAsked");
  tabsState = { granted, asked: tabsAsked };
}

// Full page address and title for the sources list. Chrome words this as
// "Read your browsing history"; HushDown only looks at the tab a file is
// downloaded from, at that moment, and keeps it on this computer.
function requestTabs() {
  chrome.storage.local.set({ tabsAsked: true });
  return chrome.permissions.request({ permissions: ["tabs"] }).catch(() => false);
}

function showToast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (el.hidden = true), 1800);
}

// ── Project ──

async function activeTabGroupTitle() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.groupId === undefined || tab.groupId < 0) return "";
    const group = await chrome.tabGroups.get(tab.groupId);
    return (group && group.title ? group.title : "").trim();
  } catch {
    return "";
  }
}

async function getSources(folder) {
  const { sources = {} } = await chrome.storage.local.get("sources");
  return sources[folder] || [];
}

async function render() {
  const settings = await chrome.storage.sync.get({
    activeProject: "",
    recentProjects: [],
    useTabGroups: true,
    notifications: false,
  });
  $("useTabGroups").checked = settings.useTabGroups === true;
  $("notifications").checked = settings.notifications === true;

  const groupTitle = settings.useTabGroups ? await activeTabGroupTitle() : "";
  const fromGroup = !!projectFolderName(groupTitle);
  const project = fromGroup ? groupTitle : settings.activeProject;
  current = { project: projectFolderName(project) ? project : "", fromGroup };

  $("groupCard").hidden = !fromGroup;
  if (fromGroup) $("groupText").textContent = i18n("groupActive", [groupTitle]);

  const isActive = !!current.project;
  $("activeCard").hidden = !isActive;
  $("startForm").hidden = isActive;
  $("idleHint").hidden = isActive;
  $("recentList").hidden = isActive;
  $("stopProject").hidden = fromGroup;

  if (isActive) {
    const folder = projectFolderName(current.project);
    const entries = await getSources(folder);
    const { projectCounters = {} } = await chrome.storage.local.get("projectCounters");
    const next = (projectCounters[folder.toLocaleLowerCase()] || 0) + 1;
    $("activeName").textContent = current.project;
    $("activeMeta").textContent = entries.length
      ? i18n("projectCount", [String(entries.length), i18n("sourcesFileName")])
      : i18n("projectEmpty");
    $("activeExample").textContent =
      i18n("nextFile") + " " + folder + "/" + projectPrefix(current.project) + "_" + pad3(next) + "_…";
    $("copySources").disabled = entries.length === 0;
    $("permRow").hidden = tabsState.granted;
  } else {
    renderRecents(settings.recentProjects);
  }
}

function renderRecents(recents) {
  const box = $("recentList");
  box.innerHTML = "";
  (recents || []).forEach((name) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hd-chip";
    chip.textContent = name;
    chip.addEventListener("click", () => startWithPermission(name));
    box.appendChild(chip);
  });
}

async function startProject(raw) {
  let name = String(raw || "").trim().replace(/\s+/g, " ");
  if (!projectFolderName(name)) return;
  const { recentProjects = [] } = await chrome.storage.sync.get({ recentProjects: [] });
  // "biyoloji ödevi" and "Biyoloji Ödevi" are the same folder on Windows and Mac.
  const same = recentProjects.find((p) => p.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (same) name = same;
  const recents = [name, ...recentProjects.filter((p) => p !== name)].slice(0, RECENT_MAX);
  await chrome.storage.sync.set({ activeProject: name, recentProjects: recents });
  $("projectInput").value = "";
  render();
}

function startWithPermission(name) {
  if (!projectFolderName(name)) return;
  const ask = !tabsState.granted && !tabsState.asked ? requestTabs() : Promise.resolve();
  ask.then(loadTabsState).then(() => startProject(name));
}

$("startForm").addEventListener("submit", (e) => {
  e.preventDefault();
  startWithPermission($("projectInput").value);
});

$("grantTabs").addEventListener("click", () => {
  requestTabs().then(loadTabsState).then(render);
});

$("stopProject").addEventListener("click", async () => {
  await chrome.storage.sync.set({ activeProject: "" });
  render();
});

$("copySources").addEventListener("click", async () => {
  const folder = projectFolderName(current.project);
  const entries = await getSources(folder);
  if (!entries.length) return;
  try {
    await navigator.clipboard.writeText(sourcesText(folder, entries));
    showToast(i18n("copied"));
  } catch {
    showToast(i18n("copyFailed"));
  }
});

$("showFolder").addEventListener("click", async () => {
  const entries = await getSources(projectFolderName(current.project));
  const last = entries[entries.length - 1];
  if (!last || !last.downloadId) {
    chrome.downloads.showDefaultFolder();
    return;
  }
  const [item] = await chrome.downloads.search({ id: last.downloadId });
  if (item && item.exists) chrome.downloads.show(last.downloadId);
  else chrome.downloads.showDefaultFolder();
});

$("useTabGroups").addEventListener("change", (e) => {
  chrome.storage.sync.set({ useTabGroups: e.target.checked }).then(render);
});

$("notifications").addEventListener("change", (e) => {
  chrome.storage.sync.set({ notifications: e.target.checked });
});

// ── History ──

// Removes the row from HushDown's list only; the file stays on disk.
async function removeLogEntry(downloadId, entryTime) {
  const { downloadLog = [] } = await chrome.storage.local.get({ downloadLog: [] });
  const next = downloadLog.filter((e) =>
    downloadId ? Number(e.id) !== downloadId : e.time !== entryTime,
  );
  await chrome.storage.local.set({ downloadLog: next });
  if (downloadId) await chrome.storage.local.remove("thumb_" + downloadId);
  loadLog();
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

    const meta = document.createElement("span");
    meta.className = "hd-log-time";
    meta.textContent = row.time || "";
    if (row.project) {
      const tag = document.createElement("span");
      tag.className = "hd-log-tag";
      tag.textContent = row.project;
      meta.appendChild(tag);
    }

    info.appendChild(name);
    info.appendChild(meta);
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
  const q = searchInput.value.trim().toLocaleLowerCase();
  if (!q) return renderLog(allEntries, allThumbMap);
  const filtered = allEntries.filter((e) =>
    ((e.name || "") + " " + (e.project || "")).toLocaleLowerCase().includes(q),
  );
  renderLog(filtered, allThumbMap);
}

async function loadLog() {
  const { downloadLog = [] } = await chrome.storage.local.get({ downloadLog: [] });
  allEntries = downloadLog;
  const thumbKeys = allEntries
    .map((e) => Number(e.id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .map((id) => "thumb_" + id);
  allThumbMap = thumbKeys.length ? await chrome.storage.local.get(thumbKeys) : {};
  applySearch();
}

function openRow(li) {
  if (!li || !li.dataset.downloadId) return;
  chrome.downloads.open(Number(li.dataset.downloadId));
}

logEl.addEventListener("click", (e) => openRow(e.target.closest("li.hd-log-row")));

logEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  openRow(e.target.closest("li.hd-log-row"));
});

$("openDownloads").addEventListener("click", () => chrome.downloads.showDefaultFolder());

$("fullHistory").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://downloads/" });
});

$("helpBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://alperalyaz.github.io/hushdown/" });
});

searchInput.addEventListener("input", applySearch);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.downloadLog || changes.sources)) {
    loadLog();
    render();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  $("versionLabel").textContent = "v" + chrome.runtime.getManifest().version;
  loadTabsState().then(render);
  loadLog();
});
