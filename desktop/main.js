// KAIROS OS Beta desktop shell: intro + update check, then the app.
// The site's files ship inside this app (web/) and are served on the real address (meyerjos004.github.io/rewind),
// so sign-in, Spotify and YouTube keep working, and a new version only arrives through the updater.
const { app, BrowserWindow, protocol, net, session, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");
const HOST = "meyerjos004.github.io", BASE = "/rewind/", WEB = path.join(__dirname, "web"), HOME = `https://${HOST}${BASE}`;
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
if (!app.requestSingleInstanceLock()) app.quit();
let splash = null, win = null, opened = false;
const send = (s, d = {}) => { if (splash && !splash.isDestroyed()) splash.webContents.send("upd", { s, ...d }); };

function serveBundled() {
  session.defaultSession.protocol.handle("https", (req) => {
    const u = new URL(req.url);
    if (u.host === HOST && u.pathname.startsWith(BASE)) {
      let rel = decodeURIComponent(u.pathname.slice(BASE.length)) || "index.html"; if (rel.endsWith("/")) rel += "index.html";
      const file = path.normalize(path.join(WEB, rel));
      if (file.startsWith(WEB) && fs.existsSync(file) && fs.statSync(file).isFile()) return net.fetch(pathToFileURL(file).toString());
    }
    return net.fetch(req, { bypassCustomProtocolHandlers: true });
  });
}
function openMain() {
  if (opened) return; opened = true;
  win = new BrowserWindow({ width: 1600, height: 950, minWidth: 1000, minHeight: 640, show: false, backgroundColor: "#050507", title: "KAIROS OS Beta", icon: path.join(__dirname, "build", "icon.png"), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const u = new URL(url);
    if ((u.host === HOST && u.pathname.startsWith(BASE)) || /(^|\.)(spotify\.com|google\.com|googleusercontent\.com)$/.test(u.host))
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true, backgroundColor: "#050507" } };
    shell.openExternal(url); return { action: "deny" };
  });
  win.loadURL(HOME);
  win.once("ready-to-show", () => { win.maximize(); win.show(); if (splash && !splash.isDestroyed()) { splash.webContents.send("upd", { s: "bye" }); setTimeout(() => splash && !splash.isDestroyed() && splash.close(), 700); } });
}
function createSplash() {
  splash = new BrowserWindow({ width: 980, height: 600, frame: false, resizable: false, transparent: false, backgroundColor: "#050507", show: false, center: true, icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "splash-preload.js"), contextIsolation: true, sandbox: true } });
  splash.loadFile(path.join(__dirname, "splash.html"), { query: { v: app.getVersion() } });
  splash.once("ready-to-show", () => splash.show());
}
ipcMain.on("intro-done", () => checkUpdates());
ipcMain.on("update-now", () => { send("downloading", { percent: 0 }); autoUpdater.downloadUpdate().catch((e) => { send("error", { msg: String(e.message || e) }); setTimeout(openMain, 1500); }); });
ipcMain.on("update-later", () => openMain());
ipcMain.on("version-sync", (e) => { e.returnValue = app.getVersion(); });
function checkUpdates() {
  if (!app.isPackaged) { send("none"); return setTimeout(openMain, 800); }
  autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = true;
  send("checking");
  let done = false; const fallback = setTimeout(() => { if (!done) { send("none"); openMain(); } }, 9000);   // offline or GitHub slow: just open
  autoUpdater.once("update-available", (i) => { done = true; clearTimeout(fallback); send("available", { version: i.version, notes: typeof i.releaseNotes === "string" ? i.releaseNotes : Array.isArray(i.releaseNotes) ? i.releaseNotes.map((n) => n.note).join("<br>") : "" }); });
  autoUpdater.once("update-not-available", () => { done = true; clearTimeout(fallback); send("none"); setTimeout(openMain, 600); });
  autoUpdater.on("error", (e) => { if (!done) { done = true; clearTimeout(fallback); send("none"); setTimeout(openMain, 600); } else { send("error", { msg: String(e.message || e) }); setTimeout(openMain, 1500); } });
  autoUpdater.on("download-progress", (p) => send("downloading", { percent: p.percent, speed: p.bytesPerSecond, total: p.total }));
  autoUpdater.on("update-downloaded", () => { send("installing"); setTimeout(() => autoUpdater.quitAndInstall(true, true), 2600); });
  autoUpdater.checkForUpdates().catch(() => { if (!done) { done = true; clearTimeout(fallback); send("none"); openMain(); } });
}
app.on("second-instance", () => { const w = win || splash; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.whenReady().then(() => { serveBundled(); createSplash(); if (process.env.KZ_SELFTEST) selfTest(); });
function selfTest() {   // dev-only smoke test: node_modules/.bin/electron . with KZ_SELFTEST=1
  const out = process.env.KZ_SELFTEST; setTimeout(async () => { try { (await splash.webContents.capturePage()).toPNG && fs.writeFileSync(out + "/splash.png", (await splash.webContents.capturePage()).toPNG()); } catch (e) { console.log("splash shot", e.message); } }, 1800);
  const iv = setInterval(async () => { if (!win) return; clearInterval(iv);
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      const r = await win.webContents.executeJavaScript(`(async()=>{ const m = await fetch(location.origin + "/rewind/_kz_test.txt").then(r=>r.ok?r.text():"HTTP "+r.status).catch(e=>"ERR "+e.message); return { title: document.title, href: location.href, marker: m, desktop: window.KAIROS_DESKTOP || null, hasApp: typeof boot === "function" }; })()`);
      console.log("SELFTEST", JSON.stringify(r)); fs.writeFileSync(out + "/main.png", (await win.webContents.capturePage()).toPNG()); app.quit(); }, 4000)); }, 200); }
app.on("window-all-closed", () => app.quit());
