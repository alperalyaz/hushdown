// End-to-end check: loads the unpacked extension into a real Chromium,
// downloads files from a local test site and inspects what lands on disk.
// Run: node tests/e2e.mjs   (CHROMIUM=/path/to/chrome to override the binary)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SRC_EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../extension");
const CHROME = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// TABS=1 simulates a user who granted the optional "tabs" permission.
const WITH_TABS = process.env.TABS === "1";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hushdown-e2e-"));
const EXT = path.join(tmp, "extension");
fs.cpSync(SRC_EXT, EXT, { recursive: true });
if (WITH_TABS) {
  const mf = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
  mf.permissions.push("tabs");
  fs.writeFileSync(path.join(EXT, "manifest.json"), JSON.stringify(mf));
}
console.log(`mode: ${WITH_TABS ? "tabs permission granted" : "no tabs permission"}`);
const DL = path.join(tmp, "downloads");
const PROFILE = path.join(tmp, "profile");
fs.mkdirSync(DL);
fs.mkdirSync(path.join(PROFILE, "Default"), { recursive: true });
fs.writeFileSync(path.join(PROFILE, "Default", "Preferences"), JSON.stringify({
  download: { default_directory: DL, prompt_for_download: false, directory_upgrade: true },
  // Chrome asks before a page starts several downloads; a real user clicks "Allow".
  profile: { default_content_setting_values: { automatic_downloads: 1 } },
}));

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url);
  if (url.startsWith("/files/")) {
    const name = url.slice(7);
    const type = name.endsWith(".png") ? "image/png" : name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Disposition": "attachment" });
    return res.end(type === "image/png" ? PNG : Buffer.from("%PDF-1.4 test"));
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><title>Mitokondri - Vikipedi</title>
    <a id="junk" href="/files/image931.png">junk</a>
    <a id="notes" href="/files/Hafta4 Notlari.pdf">notes</a>
    <a id="camera" href="/files/IMG_20240101_1234.png">camera</a>
    <a id="cross" href="http://localhost:${server.address().port}/files/image931.png">cross-origin</a>`);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--no-sandbox",
  `--user-data-dir=${PROFILE}`, "--remote-debugging-port=9339",
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "about:blank",
], { stdio: "ignore", env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}
function listFiles(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(path.join(dir, d.name), prefix + d.name + "/") : [prefix + d.name]);
}
async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  return fn();
}

// Minimal Chrome DevTools Protocol client (Node 22 has WebSocket built in).
// Playwright is not used on purpose: it takes over Chrome's download
// handling, which would bypass the extension we are testing.
async function connect() {
  let info;
  for (let i = 0; i < 60 && !info; i++) {
    try { info = await (await fetch("http://127.0.0.1:9339/json/version")).json(); } catch { await sleep(250); }
  }
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const waiting = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const attach = async (targetId) => (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  const evaluate = async (sessionId, expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, attach, evaluate, close: () => ws.close() };
}

async function findTarget(cdp, pred) {
  for (let i = 0; i < 60; i++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const t = targetInfos.find(pred);
    if (t) return t;
    await sleep(250);
  }
  throw new Error("target not found");
}

try {
  const cdp = await connect();
  const swTarget = await findTarget(cdp, (t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
  const extId = swTarget.url.split("/")[2];
  const sw = await cdp.attach(swTarget.targetId);
  const inSw = (code) => cdp.evaluate(sw, code);

  const { targetId: pageTarget } = await cdp.send("Target.createTarget", { url: `${BASE}/wiki/Mitokondri` });
  const page = await cdp.attach(pageTarget);
  for (let i = 0; i < 40; i++) {
    if (await cdp.evaluate(page, "!!document.getElementById('junk')")) break;
    await sleep(150);
  }
  const click = (id) => cdp.evaluate(page, `document.getElementById(${JSON.stringify(id)}).click()`);
  const has = (p) => listFiles(DL).some((f) => p.test(f));
  // The extension looks at the active tab, so the test does the same.
  const pageTabId = async () => {
    await cdp.send("Target.activateTarget", { targetId: pageTarget });
    return inSw("chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([t]) => t.id)");
  };

  // 1. No project: junk name is replaced, a meaningful one is kept.
  await click("junk");
  await click("notes");
  check("loose: image931.png -> mitokondri_<stamp>.png",
    await waitFor(() => has(/^mitokondri_\d{6}-\d{6}\.png$/)), listFiles(DL).join(", "));
  check("loose: meaningful name kept", await waitFor(() => has(/^Hafta4 Notlari\.pdf$/)), listFiles(DL).join(", "));

  // 2. Project from the popup setting.
  await inSw(`chrome.storage.sync.set({ activeProject: "Biyoloji Ödevi", recentProjects: ["Biyoloji Ödevi"] })`);
  await click("junk");
  await waitFor(() => has(/_001_/));
  await click("notes");
  await waitFor(() => has(/_002_/));
  await click("camera");
  check("project: 001 named after the page",
    await waitFor(() => has(/^Biyoloji Ödevi\/biyoloji-odevi_001_mitokondri\.png$/)), listFiles(DL).join(", "));
  check("project: 002 keeps meaningful name",
    await waitFor(() => has(/^Biyoloji Ödevi\/biyoloji-odevi_002_hafta4-notlari\.pdf$/)), listFiles(DL).join(", "));
  check("project: 003 camera name replaced",
    await waitFor(() => has(/^Biyoloji Ödevi\/biyoloji-odevi_003_mitokondri\.png$/)), listFiles(DL).join(", "));
  const srcPath = path.join(DL, "Biyoloji Ödevi", "_sources.txt");
  const readSrc = () => (fs.existsSync(srcPath) ? fs.readFileSync(srcPath, "utf8") : "");
  const srcOk = await waitFor(() => readSrc().includes("003"), 10000);
  check("sources file written with 3 entries", srcOk, readSrc());
  check("sources file lists the page", readSrc().includes(`${BASE}/wiki/Mitokondri`), readSrc());
  check("sources file overwritten, not duplicated",
    !listFiles(DL).some((f) => /_sources ?\(\d+\)\.txt$/.test(f)), listFiles(DL).join(", "));
  await sleep(500);
  const ownInList = await inSw(`chrome.downloads.search({ filenameRegex: "_sources" }).then((r) => r.length)`);
  check("sources file hidden from Chrome's download list", ownInList === 0, String(ownInList));

  // 2b. Cross-site file (like upload.wikimedia.org): Chrome trims the
  // referrer to the site root, so only the tabs permission recovers the page.
  await click("cross");
  const crossName = WITH_TABS ? /^Biyoloji Ödevi\/biyoloji-odevi_004_mitokondri\.png$/ : /^Biyoloji Ödevi\/biyoloji-odevi_004\.png$/;
  check("cross-site: " + (WITH_TABS ? "named from tab title" : "no page topic without permission"),
    await waitFor(() => has(crossName)), listFiles(DL).join(", "));
  const entry4 = () => readSrc().split("\r\n004  ")[1] || "";
  const crossSrc = await waitFor(() => entry4(), 10000);
  check("cross-site: sources " + (WITH_TABS ? "has full page address and title" : "has trimmed address"),
    WITH_TABS
      ? crossSrc.includes(`${BASE}/wiki/Mitokondri`) && crossSrc.includes("Mitokondri - Vikipedi")
      : crossSrc.includes(`${BASE}/\r\n`),
    String(crossSrc));

  // 3. Simultaneous downloads get distinct numbers.
  // Distinct URLs: Chrome merges identical clicks made in the same instant.
  await cdp.evaluate(page, `[1, 2, 3].forEach((n) => {
    const a = document.createElement("a");
    a.href = "/files/image931.png?copy=" + n;
    a.download = "";
    document.body.appendChild(a);
    a.click();
  })`);
  const nums = await waitFor(() => listFiles(DL).filter((f) => /biyoloji-odevi_00[5-7]_/.test(f)).length === 3);
  check("parallel downloads numbered 005-007", !!nums, listFiles(DL).join(", "));

  // 4. A named tab group overrides the popup project.
  await inSw(`(async () => {
    const tab = await chrome.tabs.get(${await pageTabId()});
    await chrome.tabs.update(tab.id, { active: true });
    const gid = await chrome.tabs.group({ tabIds: tab.id });
    await chrome.tabGroups.update(gid, { title: "Tarih Sunumu" });
  })()`);
  await click("notes");
  check("tab group: goes to its folder",
    await waitFor(() => has(/^Tarih Sunumu\/tarih-sunumu_001_hafta4-notlari\.pdf$/)), listFiles(DL).join(", "));
  await inSw(`chrome.tabs.ungroup(${await pageTabId()})`);

  // 5. Popup renders the active project.
  const { targetId: popupTarget } = await cdp.send("Target.createTarget", { url: `chrome-extension://${extId}/popup.html` });
  const popup = await cdp.attach(popupTarget);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 380, height: 700, deviceScaleFactor: 2, mobile: false }, popup);
  await sleep(1200);
  const title = await cdp.evaluate(popup, "document.getElementById('activeName').textContent");
  check("popup shows active project", title === "Biyoloji Ödevi", title);
  const shot = async (file) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, popup);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  };
  if (process.env.SHOT) await shot(process.env.SHOT);

  // 6. Finishing the project returns to loose mode.
  await cdp.evaluate(popup, "document.getElementById('stopProject').click()");
  await sleep(500);
  check("popup: start form visible after finishing",
    await cdp.evaluate(popup, "!document.getElementById('startForm').hidden"));
  check("popup: recent project chip",
    (await cdp.evaluate(popup, "document.getElementById('recentList').textContent")).includes("Biyoloji Ödevi"));
  if (process.env.SHOT) await shot(process.env.SHOT.replace(/\.png$/, "-idle.png"));

  console.log("\nFiles on disk:\n  " + listFiles(DL).join("\n  "));
  cdp.close();
} catch (e) {
  console.error(e);
  failures++;
} finally {
  chrome.kill();
  server.close();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
