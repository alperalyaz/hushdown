// Pure naming helpers. Loaded by background.js via importScripts and by the
// Node test suite via require, so no chrome.* calls here.

const TR_MAP = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function formatStamp(date = new Date()) {
  return (
    String(date.getFullYear()).slice(-2) +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    "-" +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

// "Mitokondri Yapısı (2)" -> "mitokondri-yapisi-2". Keeps letters of any
// script (Chinese, Arabic...) but folds Turkish and Latin accents to ASCII.
function slugify(text, maxLen = 50) {
  if (!text) return "";
  let s = String(text).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_MAP[c]);
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
  s = s.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/-+$/, "");
  }
  return s;
}

function splitExt(name) {
  const base = String(name || "").split(/[/\\]/).pop() || "";
  const m = base.match(/^(.*)\.([A-Za-z0-9]{1,8})$/);
  if (m && m[1]) return { stem: m[1], ext: m[2].toLowerCase() };
  return { stem: base, ext: "" };
}

// Browser-made copy markers: "foto (3)", "foto(3)".
function stripCopySuffix(stem) {
  return String(stem || "").replace(/\s*\(\d{1,3}\)\s*$/, "");
}

const JUNK_WORDS =
  "image|img|images|download|downloads|file|files|untitled|unnamed|photo|" +
  "picture|pic|screenshot|scan|document|doc|dosya|indir|indirilen|resim|" +
  "gorsel|görsel|belge|adsiz|adsız|blob|media|attachment|ek|temp|tmp|out|output";
const JUNK_WORD_RE = new RegExp(`^(${JUNK_WORDS})[\\s_\\-.]*\\d*$`, "i");

// True when a filename stem tells a human nothing about the content.
function isJunkName(stem) {
  const s = stripCopySuffix(stem).trim();
  if (!s) return true;
  if (JUNK_WORD_RE.test(s)) return true;
  // Only digits, separators and dates: "1234567", "20240101_120000".
  if (/^[\d\s_\-.]+$/.test(s)) return true;
  // Hashes and UUIDs: "a8f3e2c1-9b4d-...", "3f9a0c7e1b2d4f60".
  if (/^[0-9a-f\-]{12,}$/i.test(s) && /\d/.test(s)) return true;
  // Long random tokens without separators: "AbX9kQ2mZt7LpR4w".
  if (s.length >= 14 && /^[A-Za-z0-9_\-]+$/.test(s)) {
    const digits = (s.match(/\d/g) || []).length;
    const upperInside = (s.slice(1).match(/[A-Z]/g) || []).length;
    const separators = (s.match(/[_\-]/g) || []).length;
    if (separators === 0 && digits >= 3 && upperInside >= 3) return true;
  }
  // Camera and messenger names: "IMG_20240101_1234", "WhatsApp Image 2024-...".
  if (/^(img|dsc|dscn|pxl|vid|mvimg)[_\-]?\d/i.test(s)) return true;
  if (/^whatsapp (image|video)/i.test(s)) return true;
  return false;
}

const SECOND_LEVEL = new Set(["com", "co", "org", "net", "gov", "edu", "ac", "k12", "bel", "gen"]);

// "https://tr.wikipedia.org/x" -> "wikipedia", "dergipark.org.tr" -> "dergipark".
function siteName(url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "";
  }
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return "";
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return slugify(host, 30);
  labels.pop();
  if (labels.length >= 2 && SECOND_LEVEL.has(labels[labels.length - 1])) labels.pop();
  return slugify(labels[labels.length - 1], 30);
}

// Best human-readable topic from a page URL: the last meaningful path
// segment ("/wiki/Mitokondri" -> "mitokondri"), else the site name.
function topicFromPageUrl(url) {
  if (!url || /^(blob|data):/i.test(url)) return "";
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return "";
  }
  const segments = path.split("/").filter(Boolean).reverse();
  for (const raw of segments) {
    let seg = raw;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      /* keep raw */
    }
    seg = seg.replace(/\.[A-Za-z0-9]{1,5}$/, "");
    if (/^(index|default|home|wiki|search|view|detail|details|p|post|article|amp)$/i.test(seg)) continue;
    if (isJunkName(seg)) continue;
    const slug = slugify(seg.replace(/_/g, " "), 40);
    if (slug) return slug;
  }
  return siteName(url);
}

// "Mitokondri - Vikipedi" -> "mitokondri", "hücre zarı - Google'da Ara" -> "hucre-zari".
// Drops the site name that most titles carry after a separator.
function topicFromTitle(title) {
  let t = String(title || "").trim();
  if (!t) return "";
  const parts = t.split(/\s+[-|–—·:]\s+/).filter(Boolean);
  if (parts.length > 1) t = parts.slice(0, -1).join(" ");
  if (isJunkName(t)) return "";
  return slugify(t, 40);
}

// Readable body for a downloaded file, without extension.
function meaningfulBody(originalName, pageUrl, fileUrl, pageTitle) {
  const { stem } = splitExt(originalName);
  const cleaned = stripCopySuffix(stem);
  if (!isJunkName(cleaned)) {
    const slug = slugify(cleaned);
    if (slug) return slug;
  }
  return topicFromTitle(pageTitle) || topicFromPageUrl(pageUrl) || topicFromPageUrl(fileUrl) || "";
}

// Folder name shown to the user: keep their spelling, drop what Windows forbids.
function projectFolderName(project) {
  let n = String(project || "").trim();
  n = n.replace(/[\x00-\x1f<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim();
  n = n.replace(/^[. ]+|[. ]+$/g, "");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(n)) n = "_" + n;
  return n.slice(0, 60).trim();
}

// Short prefix that starts every file of a project: "Biyoloji Ödevi" -> "biyoloji-odevi".
function projectPrefix(project) {
  return slugify(project, 20) || "is";
}

function withExt(body, ext) {
  return ext ? `${body}.${ext}` : body;
}

// "Biyoloji Ödevi/biyoloji-odevi_003_mitokondri.jpg"
function buildProjectPath({ project, number, originalName, pageUrl, fileUrl, pageTitle, ext }) {
  const folder = projectFolderName(project);
  const body = meaningfulBody(originalName, pageUrl, fileUrl, pageTitle);
  const name = [projectPrefix(project), pad3(number), body].filter(Boolean).join("_");
  return { folder, filename: `${folder}/${withExt(name, ext)}` };
}

// Outside a project we only touch names that carry no meaning.
// Returns null when the original name should be kept as is.
function buildLooseFilename({ originalName, pageUrl, fileUrl, pageTitle, ext, date }) {
  const { stem } = splitExt(originalName);
  if (!isJunkName(stem)) return null;
  const topic = topicFromTitle(pageTitle) || topicFromPageUrl(pageUrl) || topicFromPageUrl(fileUrl) || "dosya";
  return withExt(`${topic}_${formatStamp(date)}`, ext);
}

if (typeof module !== "undefined") {
  module.exports = {
    formatStamp,
    slugify,
    splitExt,
    stripCopySuffix,
    isJunkName,
    siteName,
    topicFromPageUrl,
    topicFromTitle,
    meaningfulBody,
    projectFolderName,
    projectPrefix,
    buildProjectPath,
    buildLooseFilename,
    pad3,
  };
}
