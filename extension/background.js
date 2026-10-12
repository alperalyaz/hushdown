importScripts("naming.js", "sources.js");

const DEFAULT_SETTINGS = {
  activeProject: "",
  recentProjects: [],
  useTabGroups: true,
  notifications: false,
};

const SOURCES_MAX = 500;
const LOG_MAX = 200;

function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

chrome.runtime.onInstalled.addListener((details) => {
  // 2.0 replaced the timestamp modes with projects; show 1.x users what changed.
  const fromV1 = details.reason === "update" && /^1\./.test(details.previousVersion || "");
  if (details.reason === "install" || fromV1) {
    chrome.tabs.create({ url: "https://alperalyaz.github.io/hushdown/" });
  }
  chrome.runtime.setUninstallURL("https://docs.google.com/forms/d/e/1FAIpQLScXM4JdMBO0hhssBI7sNwtXIVdveTn1_I_Qp1AwuIW-n229Ow/viewform");
});

// ── Which project does this download belong to? ──

// A named tab group wins over the project chosen in the popup: the student
// who groups tabs as "Biyoloji" never has to touch the popup at all.
async function tabGroupProject() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.groupId === undefined || tab.groupId < 0) return "";
    const group = await chrome.tabGroups.get(tab.groupId);
    return (group && group.title ? group.title : "").trim();
  } catch {
    return "";
  }
}

async function resolveProject(settings) {
  if (settings.useTabGroups) {
    const fromGroup = await tabGroupProject();
    if (projectFolderName(fromGroup)) return fromGroup;
  }
  return projectFolderName(settings.activeProject) ? settings.activeProject : "";
}

// ── Which page did the download come from? ──

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// Browsers usually cut the referrer of a cross-site download down to the
// site root ("https://tr.wikipedia.org/"). With the optional "tabs"
// permission we can read the full address and title of the tab instead.
async function sourcePage(item) {
  const referrer = /^(blob|data):/i.test(item.referrer || "") ? "" : item.referrer || "";
  const fallback = { url: referrer, title: "" };
  try {
    if (!(await chrome.permissions.contains({ permissions: ["tabs"] }))) return fallback;
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const web = tabs.filter((t) => /^https?:/i.test(t.url || ""));
    const want = originOf(referrer);
    const active = web.find((t) => t.active);
    const pick = want
      ? (active && originOf(active.url) === want ? active : web.find((t) => originOf(t.url) === want))
      : active;
    return pick ? { url: pick.url, title: pick.title || "" } : fallback;
  } catch {
    return fallback;
  }
}

// ── Extension of the downloaded file ──

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
};

function getExtension(item) {
  for (const name of [item.filename, item.suggestedFilename]) {
    const { ext } = splitExt(name);
    if (ext) return ext;
  }
  try {
    const { ext } = splitExt(new URL(item.finalUrl || item.url || "").pathname);
    if (ext) return ext;
  } catch {
    /* ignore */
  }
  const mime = (item.mime || "").split(";")[0].trim().toLowerCase();
  return MIME_EXT[mime] || "";
}

function originalName(item) {
  if (item.suggestedFilename) return item.suggestedFilename;
  const leaf = (item.filename || "").split(/[/\\]/).pop();
  if (leaf) return leaf;
  try {
    const u = item.finalUrl || item.url || "";
    if (/^(blob|data):/i.test(u)) return "";
    const last = new URL(u).pathname.split("/").filter(Boolean).pop() || "";
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return "";
  }
}

// ── Per-project numbering. Downloads can start together, so numbers are
// handed out one at a time. ──

let numberQueue = Promise.resolve();

function nextNumber(folder) {
  const key = folder.toLocaleLowerCase();
  const run = numberQueue.then(async () => {
    const { projectCounters = {} } = await chrome.storage.local.get("projectCounters");
    const n = (projectCounters[key] || 0) + 1;
    projectCounters[key] = n;
    await chrome.storage.local.set({ projectCounters });
    return n;
  });
  numberQueue = run.catch(() => {});
  return run;
}

// ── Our own sources-file writes go through the same download pipeline. ──

const ownDownloads = new Map(); // data URL -> target filename

async function decideFilename(item) {
  if (item.byExtensionId === chrome.runtime.id) {
    const target = ownDownloads.get(item.url);
    return target ? { filename: target, conflictAction: "overwrite" } : null;
  }

  const settings = await getSettings();
  const project = await resolveProject(settings);
  const ext = getExtension(item);
  const name = originalName(item);
  const page = await sourcePage(item);
  const pageUrl = page.url;
  const pageTitle = page.title;
  const fileUrl = item.finalUrl || item.url || "";

  if (!project) {
    const loose = buildLooseFilename({ originalName: name, pageUrl, fileUrl, pageTitle, ext });
    return loose ? { filename: loose, conflictAction: "uniquify" } : null;
  }

  const folder = projectFolderName(project);
  const number = await nextNumber(folder);
  const built = buildProjectPath({ project, number, originalName: name, pageUrl, fileUrl, pageTitle, ext });

  await chrome.storage.session.set({
    ["pending_" + item.id]: {
      folder: built.folder,
      number,
      file: built.filename.split("/").pop(),
      original: name,
      pageTitle,
      pageUrl,
      fileUrl: /^(blob|data):/i.test(fileUrl) ? "" : fileUrl,
    },
  });
  return { filename: built.filename, conflictAction: "uniquify" };
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  decideFilename(item)
    .then((suggestion) => (suggestion ? suggest(suggestion) : suggest()))
    .catch(() => suggest());
  return true;
});

// ── Sources list (_sources.txt / _kaynaklar.txt) ──

function toDataUrl(text) {
  const bytes = new TextEncoder().encode("﻿" + text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return "data:text/plain;charset=utf-8;base64," + btoa(bin);
}

const writeTimers = new Map();

function scheduleSourcesWrite(folder) {
  clearTimeout(writeTimers.get(folder));
  writeTimers.set(folder, setTimeout(() => {
    writeTimers.delete(folder);
    writeSourcesFile(folder);
  }, 2500));
}

async function writeSourcesFile(folder) {
  const { sources = {} } = await chrome.storage.local.get("sources");
  const entries = sources[folder];
  if (!entries || !entries.length) return;
  const url = toDataUrl(sourcesText(folder, entries));
  const target = `${folder}/${chrome.i18n.getMessage("sourcesFileName")}`;
  ownDownloads.set(url, target);
  chrome.downloads.download(
    { url, filename: target, conflictAction: "overwrite", saveAs: false },
    () => void chrome.runtime.lastError,
  );
}

async function recordSource(item) {
  const key = "pending_" + item.id;
  const { [key]: pending } = await chrome.storage.session.get(key);
  if (!pending) return null;
  await chrome.storage.session.remove(key);
  // Chrome falls back to the original name if it rejects our path; then
  // the file is not in the project folder and must not be listed.
  const segments = (item.filename || "").split(/[/\\]/);
  if (segments[segments.length - 2] !== pending.folder) return null;
  const savedAs = segments[segments.length - 1] || pending.file;

  const { sources = {} } = await chrome.storage.local.get("sources");
  const list = sources[pending.folder] || [];
  list.push({
    number: pending.number,
    file: savedAs,
    original: pending.original,
    pageTitle: pending.pageTitle || "",
    pageUrl: pending.pageUrl,
    fileUrl: pending.fileUrl,
    downloadId: item.id,
    accessed: new Date().toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }),
  });
  sources[pending.folder] = list.slice(-SOURCES_MAX);
  await chrome.storage.local.set({ sources });
  scheduleSourcesWrite(pending.folder);
  return pending.folder;
}

// ── History list and thumbnails ──

async function pushDownloadLog(entry) {
  const { downloadLog } = await chrome.storage.local.get({ downloadLog: [] });
  const prev = Array.isArray(downloadLog) ? downloadLog : [];
  const next = [entry, ...prev].slice(0, LOG_MAX);
  const removedIds = prev.slice(LOG_MAX - 1).map((e) => e.id).filter(Boolean);
  await chrome.storage.local.set({ downloadLog: next });
  if (removedIds.length) {
    chrome.storage.local.remove(removedIds.map((id) => "thumb_" + id));
  }
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Make a small preview of a downloaded image",
  });
}

function filePathToFileUrl(filepath) {
  const p = filepath.replace(/\\/g, "/");
  return "file://" + (p.startsWith("/") ? "" : "/") + encodeURI(p).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Needs "Allow access to file URLs"; quietly returns null without it.
async function getImageInfo(filePath) {
  try {
    await ensureOffscreen();
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "image-to-dataurl", fileUrl: filePathToFileUrl(filePath) },
        (resp) => {
          if (chrome.runtime.lastError || !resp || resp.error) resolve(null);
          else resolve(resp);
        },
      );
    });
  } catch {
    return null;
  }
}

function showNotification(item, fileName, imageInfo, project) {
  const nid = "hushdown-dl-" + item.id;
  const iconUrl = chrome.runtime.getURL("icons/icon128.png");
  const parts = [project ? "📁 " + project : chrome.i18n.getMessage("notifDownloaded")];
  if (imageInfo && imageInfo.width && imageInfo.height) {
    parts.push(imageInfo.width + "×" + imageInfo.height + " px");
  }
  const size = formatBytes(item.fileSize);
  if (size) parts.push(size);
  const base = { iconUrl, title: fileName, message: parts.join(" · "), priority: 0 };

  const basic = () =>
    chrome.notifications.create(nid, { type: "basic", ...base }, () => void chrome.runtime.lastError);

  if (imageInfo && imageInfo.dataUrl) {
    chrome.notifications.create(nid, { type: "image", imageUrl: imageInfo.dataUrl, ...base }, () => {
      if (chrome.runtime.lastError) basic();
    });
  } else {
    basic();
  }
}

async function onDownloadComplete(item) {
  if (item.byExtensionId === chrome.runtime.id) {
    // Keep our sources-file rewrites out of Chrome's download list.
    ownDownloads.delete(item.url);
    chrome.downloads.erase({ id: item.id }, () => void chrome.runtime.lastError);
    return;
  }

  const project = await recordSource(item);
  const name = (item.filename || "").split(/[/\\]/).pop() || chrome.i18n.getMessage("downloadedFile");
  const time = new Date().toLocaleString(undefined, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  await pushDownloadLog({ id: item.id, name, time, project: project || "" });

  const isImage = (item.mime || "").toLowerCase().startsWith("image/");
  const imageInfo = isImage && item.filename ? await getImageInfo(item.filename) : null;
  if (imageInfo && imageInfo.thumbUrl) {
    chrome.storage.local.set({ ["thumb_" + item.id]: imageInfo.thumbUrl });
  }

  const { notifications } = await getSettings();
  if (notifications) showNotification(item, name, imageInfo, project);
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  if (delta.state.current === "interrupted") {
    chrome.storage.session.remove("pending_" + delta.id);
    return;
  }
  if (delta.state.current !== "complete") return;
  chrome.downloads.search({ id: delta.id }, (results) => {
    if (chrome.runtime.lastError || !results || !results.length) return;
    onDownloadComplete(results[0]);
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const m = /^hushdown-dl-(\d+)/.exec(notificationId);
  if (!m) return;
  chrome.downloads.show(Number(m[1]), () => void chrome.runtime.lastError);
});

