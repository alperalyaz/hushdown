const MODE_TIMESTAMP = "timestamp";
const MODE_TIMESTAMP_ORIGINAL = "timestamp-original";
const MODE_ORIGINAL = "original";

function normalizeFilenameMode(mode) {
  if (mode === MODE_TIMESTAMP_ORIGINAL) return MODE_TIMESTAMP_ORIGINAL;
  if (mode === MODE_ORIGINAL) return MODE_ORIGINAL;
  return MODE_TIMESTAMP;
}

const DEFAULT_SETTINGS = {
  filenameMode: MODE_TIMESTAMP,
  folderOrganization: false,
};

let settingsCache = {
  filenameMode: MODE_TIMESTAMP,
  folderOrganization: false,
};

function applyStorageResult(result) {
  settingsCache.filenameMode = normalizeFilenameMode(result.filenameMode);
  settingsCache.folderOrganization = result.folderOrganization === true;
}

chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
  applyStorageResult(result);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "https://alperalyaz.github.io/hushdown/" });
  }
  chrome.runtime.setUninstallURL("https://docs.google.com/forms/d/e/1FAIpQLScXM4JdMBO0hhssBI7sNwtXIVdveTn1_I_Qp1AwuIW-n229Ow/viewform");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.filenameMode) {
    settingsCache.filenameMode = normalizeFilenameMode(
      changes.filenameMode.newValue,
    );
  }
  if (changes.folderOrganization) {
    settingsCache.folderOrganization = changes.folderOrganization.newValue === true;
  }
});

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTimestampStamp(date = new Date()) {
  return (
    String(date.getFullYear()) +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

function getExtensionFromDownload(item) {
  const extFromName = (name) => {
    if (!name) return "";
    const base = name.split(/[/\\]/).pop() || "";
    const m = base.match(/\.([A-Za-z0-9]{1,8})$/);
    return m ? m[1].toLowerCase() : "";
  };

  let ext = extFromName(item.filename);
  if (ext) return ext;

  ext = extFromName(item.suggestedFilename || "");
  if (ext) return ext;

  try {
    const url = item.finalUrl || item.url || "";
    const pathname = new URL(url).pathname;
    ext = extFromName(pathname);
    if (ext) return ext;
  } catch (_) {
    /* ignore */
  }

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
  };
  const mime = item.mime ? item.mime.split(";")[0].trim().toLowerCase() : "";
  if (mime && mimeMap[mime]) return mimeMap[mime];

  return "";
}

function getSuggestedBasename(item) {
  if (item.suggestedFilename) {
    const leaf = String(item.suggestedFilename).split(/[/\\]/).pop();
    if (leaf) return leaf;
  }
  try {
    const u = item.finalUrl || item.url || "";
    if (!u || u.startsWith("blob:") || u.startsWith("data:")) return "";
    const pathname = new URL(u).pathname;
    const parts = pathname.split("/").filter(Boolean);
    const last = parts.pop();
    if (!last) return "";
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  } catch {
    return "";
  }
}

function sanitizeWindowsBasename(name) {
  if (!name || typeof name !== "string") return "";
  let n = name.split(/[/\\]/).pop().trim();
  n = n.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_");
  n = n.replace(/[. ]+$/, "");
  n = n.replace(/^\.+/, "");
  if (!n) return "";
  const stem = n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : n;
  const stemCheck = stem || n;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stemCheck)) {
    return "file_" + n;
  }
  return n;
}

function nameHasExtensionSegment(name) {
  return /\.[A-Za-z0-9]{1,12}$/.test(name);
}

function buildTimestampOnlyFilename(downloadItem) {
  const stamp = formatTimestampStamp();
  const ext = getExtensionFromDownload(downloadItem);
  return ext ? `${stamp}.${ext}` : stamp;
}

function buildSuggestedBody(downloadItem) {
  const mimeExt = getExtensionFromDownload(downloadItem);
  const raw = getSuggestedBasename(downloadItem);
  let body = sanitizeWindowsBasename(raw);
  if (!body) body = "download";
  if (mimeExt && !nameHasExtensionSegment(body)) {
    body = `${body}.${mimeExt}`;
  }
  return body;
}

function buildTimestampOriginalFilename(downloadItem) {
  const stamp = formatTimestampStamp();
  const prefix = stamp + "-";
  let body = buildSuggestedBody(downloadItem);
  const maxTotal = 200;
  let out = prefix + body;
  if (out.length > maxTotal) {
    const budget = Math.max(1, maxTotal - prefix.length);
    body = body.slice(0, budget);
    out = prefix + body;
  }
  return out;
}

function buildOriginalOnlyFilename(downloadItem) {
  let body = buildSuggestedBody(downloadItem);
  if (body.length > 200) body = body.slice(0, 200);
  return body;
}

const EXT_TO_FOLDER = (() => {
  const map = {
    images:   ["jpg","jpeg","png","gif","webp","svg","bmp","ico","tiff","avif","heic"],
    docs:     ["pdf","doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","txt","rtf","csv","md"],
    videos:   ["mp4","mkv","avi","mov","wmv","flv","webm","m4v","3gp"],
    audio:    ["mp3","flac","wav","ogg","aac","m4a","wma","opus"],
    archives: ["zip","rar","7z","tar","gz","bz2","xz","tgz"],
  };
  const result = {};
  for (const [folder, exts] of Object.entries(map)) {
    for (const ext of exts) result[ext] = folder;
  }
  return result;
})();

function buildDownloadFilename(downloadItem) {
  const mode = settingsCache.filenameMode;
  if (mode === MODE_TIMESTAMP_ORIGINAL) {
    return buildTimestampOriginalFilename(downloadItem);
  }
  if (mode === MODE_ORIGINAL) {
    return buildOriginalOnlyFilename(downloadItem);
  }
  return buildTimestampOnlyFilename(downloadItem);
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  let filename = buildDownloadFilename(downloadItem);

  if (settingsCache.folderOrganization) {
    const ext = getExtensionFromDownload(downloadItem);
    const folder = EXT_TO_FOLDER[ext] || "";
    if (folder) filename = folder + "/" + filename;
  }

  suggest({
    filename,
    conflictAction: "uniquify",
  });
});

const LOG_MAX = 200;

function pushDownloadLog(entry) {
  chrome.storage.local.get({ downloadLog: [] }, (data) => {
    const prev = Array.isArray(data.downloadLog) ? data.downloadLog : [];
    const next = [entry, ...prev].slice(0, LOG_MAX);
    const removedIds = prev.slice(LOG_MAX - 1).map((e) => e.id).filter(Boolean);
    chrome.storage.local.set({ downloadLog: next });
    if (removedIds.length) {
      chrome.storage.local.remove(removedIds.map((id) => "thumb_" + id));
    }
  });
}

function saveThumb(downloadId, thumbUrl) {
  chrome.storage.local.set({ ["thumb_" + downloadId]: thumbUrl });
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Convert downloaded image to data URL for notification",
  });
}

function filePathToFileUrl(filepath) {
  return "file:///" + filepath.replace(/\\/g, "/");
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function getImageInfo(filePath) {
  try {
    await ensureOffscreen();
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "image-to-dataurl", fileUrl: filePathToFileUrl(filePath) },
        (resp) => {
          if (chrome.runtime.lastError || !resp || resp.error) {
            resolve(null);
          } else {
            resolve(resp);
          }
        },
      );
    });
  } catch {
    return null;
  }
}

async function showDownloadDoneNotification(item) {
  const downloadId = item.id;
  const fileName =
    (item.filename || "").split(/[/\\]/).pop() || chrome.i18n.getMessage("downloadedFile");
  const nid = "hushdown-dl-" + downloadId;
  const extensionIcon = chrome.runtime.getURL("icons/icon128.png");
  const mime = (item.mime || "").toLowerCase();
  const isImage = mime.startsWith("image/");

  const sizeStr = formatBytes(item.fileSize);

  let imageInfo = null;
  if (isImage && item.filename) {
    imageInfo = await getImageInfo(item.filename);
  }

  const imageDataUrl = imageInfo && imageInfo.dataUrl ? imageInfo.dataUrl : null;
  if (imageInfo && imageInfo.thumbUrl) {
    saveThumb(downloadId, imageInfo.thumbUrl);
  }

  let messageParts = [chrome.i18n.getMessage("notifDownloaded")];
  if (imageInfo && imageInfo.width && imageInfo.height) {
    messageParts.push(imageInfo.width + "×" + imageInfo.height + " px");
  }
  if (sizeStr) messageParts.push(sizeStr);
  const message = messageParts.join(" · ");

  if (imageDataUrl) {
    chrome.notifications.create(
      nid,
      {
        type: "image",
        iconUrl: extensionIcon,
        imageUrl: imageDataUrl,
        title: fileName,
        message: message,
        priority: 2,
      },
      () => {
        if (chrome.runtime.lastError) {
          chrome.notifications.create(
            nid,
            {
              type: "basic",
              iconUrl: extensionIcon,
              title: fileName,
              message: message,
              priority: 2,
            },
            () => void chrome.runtime.lastError,
          );
        }
      },
    );
  } else {
    chrome.notifications.create(
      nid,
      {
        type: "basic",
        iconUrl: extensionIcon,
        title: fileName,
        message: message,
        priority: 2,
      },
      () => void chrome.runtime.lastError,
    );
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== "complete") return;

  chrome.downloads.search({ id: delta.id }, (results) => {
    if (chrome.runtime.lastError || !results || !results.length) return;
    const item = results[0];
    const fullPath = item.filename || "";
    const name =
      fullPath.split(/[/\\]/).pop() || chrome.i18n.getMessage("downloadedFile");
    const timeLabel = new Date().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    pushDownloadLog({ id: item.id, name, time: timeLabel });
    showDownloadDoneNotification(item);
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const m = /^hushdown-dl-(\d+)/.exec(notificationId);
  if (!m) return;
  const downloadId = Number(m[1]);
  if (!Number.isFinite(downloadId)) return;
  chrome.downloads.show(downloadId, () => {
    void chrome.runtime.lastError;
  });
});
