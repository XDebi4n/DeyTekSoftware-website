/* DeyTek Claud (escritorio) - proceso principal de Electron.
   Sirve la carpeta app/ en http://localhost:PUERTO (Firebase Auth no funciona bien desde file://),
   deja la app en la bandeja al cerrar para seguir recibiendo llamadas y avisa con ventana/notificación.
   NUEVO: lanzador de juegos (descargar, actualizar, jugar, desinstalar). */
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, desktopCapturer, nativeImage, shell } = require("electron");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const extract = require("extract-zip");

const PORT = 47321; // fijo: la sesión de Firebase se guarda por origen (incluye el puerto)
const ROOT = path.join(__dirname, "app");
const ICON = path.join(ROOT, "img", "favicon.png");
const TITLE = "DeyTek Claud";

/* ======== LANZADOR: de dónde sale la lista de juegos ========
   "" = usa app/games.json (viene dentro de la app).
   Si pones una URL (ej. "https://tusitio.com/games.json") la lista se lee de internet:
   así puedes subir un juego nuevo o una versión nueva SIN volver a compilar el instalador. */
const MANIFEST_URL = "";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg"
};

/* Que los sonidos (sirena, mensajes) suenen sin que el usuario haya hecho clic */
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win = null, tray = null, server = null, origin = "", quitting = false;

/* ---------------- Servidor local (con soporte de Range para que los videos funcionen bien) ---------------- */
function startServer(){
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      let p = "/";
      try{ p = decodeURIComponent(req.url.split("?")[0]); }catch(e){}
      if(p === "/") p = "/index.html";
      const file = path.normalize(path.join(ROOT, p));
      if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if(err || !st.isFile()){ res.writeHead(404); return res.end("No encontrado"); }
        const headers = {
          "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "no-store", "Accept-Ranges": "bytes"
        };
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        let stream;
        if(m && (m[1] || m[2])){
          const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
          const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
          if(start > end || start >= st.size){ res.writeHead(416, {"Content-Range": `bytes */${st.size}`}); return res.end(); }
          res.writeHead(206, {...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1});
          stream = fs.createReadStream(file, {start, end});
        }else{
          res.writeHead(200, {...headers, "Content-Length": st.size});
          stream = fs.createReadStream(file);
        }
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      });
    });
    server.on("error", e => {
      if(e.code === "EADDRINUSE") server.listen(0, "localhost"); // puerto ocupado: uno libre (la sesión no se recordará)
      else console.error(e);
    });
    server.on("listening", () => resolve(server.address().port));
    server.listen(PORT, "localhost");
  });
}

function showWindow(){
  if(!win) return;
  if(win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function send(ch, data){
  if(win && !win.isDestroyed()) win.webContents.send(ch, data);
}

function createWindow(){
  const hasIcon = fs.existsSync(ICON);
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 600,
    backgroundColor: "#000000", frame: false, title: TITLE, // frame:false = sin la barra de Windows (botones propios en index.html)
    icon: hasIcon ? ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false // que los sonidos y temporizadores sigan activos en segundo plano
    }
  });
  win.setMenu(null);
  win.loadURL(origin);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if(/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("focus", () => win.flashFrame(false));
  const sendMax = () => { if(win && !win.isDestroyed()) win.webContents.send("win-max", win.isMaximized()); };
  win.on("maximize", sendMax); win.on("unmaximize", sendMax);
  win.on("close", e => {
    if(!quitting && tray){ e.preventDefault(); win.hide(); }
  });

  if(hasIcon){
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 20, height: 20 }));
    tray.setToolTip(TITLE);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Abrir DeyTek Claud", click: showWindow },
      { type: "separator" },
      { label: "Salir", click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on("click", showWindow);
  }
}

function popup(title, body){
  if(!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true, icon: fs.existsSync(ICON) ? ICON : undefined }); // el sonido lo pone la página
  n.on("click", showWindow);
  n.show();
}

/* Mensajes / solicitudes: notificación nativa y parpadeo si la ventana no está en primer plano */
ipcMain.on("alert", (_e, o) => {
  if(!win || !o) return;
  if(!win.isFocused()){
    win.flashFrame(true);
    popup(String(o.title || TITLE).slice(0, 80), String(o.body || "").slice(0, 200));
  }
});

/* Llamada entrante: saca la ventana al frente mientras suena */
ipcMain.on("ringing", (_e, o) => {
  if(!win || !o) return;
  if(o.on){
    showWindow(); win.moveTop(); win.flashFrame(true);
    popup("Llamada entrante", `${String(o.name || "Alguien").slice(0, 60)} te está llamando`);
  }else win.flashFrame(false);
});

/* Botones de ventana propios: minimizar / maximizar / cerrar */
ipcMain.on("win", (_e, a) => {
  if(!win) return;
  if(a === "min") win.minimize();
  else if(a === "max") win.isMaximized() ? win.unmaximize() : win.maximize();
  else if(a === "close") win.close(); // si hay icono en la bandeja, el evento "close" solo la oculta
});

ipcMain.on("unread", (_e, n) => { try{ app.setBadgeCount(Math.max(0, +n || 0)); }catch(e){} });

/* =====================================================================
   LANZADOR DE JUEGOS
   Los juegos se publican como un .zip que contiene el juego y su .exe.
   Se instalan en  %APPDATA%/deytek-desktop/games/<id>/
   ===================================================================== */
const GAMES_DIR = () => path.join(app.getPath("userData"), "games");
const STATE_FILE = () => path.join(app.getPath("userData"), "installed.json");
const jobs = new Map();     // id -> descarga en curso {cancelled, req}
const running = new Map();  // id -> proceso del juego abierto
let catalog = [];           // última lista conocida (sirve para validar los id que llegan de la página)

const safeId = id => String(id).replace(/[^a-z0-9_-]/gi, "_");
const gameDir = id => path.join(GAMES_DIR(), safeId(id));

function readState(){ try{ return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8")) || {}; }catch(e){ return {}; } }
function writeState(s){ fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 2)); }

function fetchText(url, ms = 6000, redirects = 0){
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "Cache-Control": "no-cache" } }, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5){
        res.resume();
        return fetchText(new URL(res.headers.location, url).href, ms, redirects + 1).then(resolve, reject);
      }
      if(res.statusCode !== 200){ res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", c => buf += c);
      res.on("end", () => resolve(buf));
      res.on("error", reject);
    });
    req.setTimeout(ms, () => req.destroy(new Error("tiempo agotado")));
    req.on("error", reject);
  });
}

async function loadManifest(){
  let offline = false, raw = null;
  if(MANIFEST_URL){
    try{ raw = JSON.parse(await fetchText(MANIFEST_URL)); }catch(e){ offline = true; console.warn("[juegos] no pude leer", MANIFEST_URL, e.message); }
  }
  if(!raw){
    try{ raw = JSON.parse(fs.readFileSync(path.join(ROOT, "games.json"), "utf8")); }catch(e){ console.error("[juegos] games.json inválido", e.message); raw = { games: [] }; }
  }
  catalog = Array.isArray(raw.games) ? raw.games.filter(g => g && g.id && g.name) : [];
  return offline;
}

function exeOf(g){
  const dir = gameDir(g.id);
  const exe = path.normalize(path.join(dir, String(g.exe || "")));
  return exe.startsWith(dir + path.sep) ? exe : null; // que el manifiesto no pueda apuntar fuera de la carpeta del juego
}

async function listGames(){
  const offline = await loadManifest();
  const st = readState();
  return {
    offline,
    games: catalog.map(g => {
      const inst = st[g.id];
      const installed = !!inst && fs.existsSync(gameDir(g.id));
      return {
        id: g.id, name: g.name, tagline: g.tagline || "", description: g.description || "",
        color: g.color || "#e5384f", logo: g.logo || "", background: g.background || "",
        video: g.video || "", screenshots: Array.isArray(g.screenshots) ? g.screenshots : [],
        version: g.version || "1.0.0", size: g.size || "", downloadable: !!g.downloadUrl,
        installed, installedVersion: installed ? inst.version : null,
        updateAvailable: installed && inst.version !== (g.version || "1.0.0"),
        installing: jobs.has(g.id), running: running.has(g.id)
      };
    })
  };
}

/* Descarga con redirecciones, progreso y cancelación. Devuelve el sha256 del archivo. */
function download(url, dest, job, onProgress, redirects = 0){
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, res => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        if(redirects > 5) return reject(new Error("Demasiadas redirecciones"));
        return download(new URL(res.headers.location, url).href, dest, job, onProgress, redirects + 1).then(resolve, reject);
      }
      if(res.statusCode !== 200){ res.resume(); return reject(new Error("El servidor respondió " + res.statusCode)); }
      const total = +res.headers["content-length"] || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      const hash = crypto.createHash("sha256");
      res.on("data", c => { got += c.length; hash.update(c); onProgress(got, total); });
      res.on("aborted", () => reject(new Error("Descarga interrumpida")));
      res.on("error", reject);
      res.on("close", () => { if(!res.complete) reject(new Error("Descarga interrumpida")); });
      out.on("error", reject);
      out.on("finish", () => resolve(hash.digest("hex")));
      res.pipe(out);
    });
    job.req = req;
    req.on("error", reject);
  });
}

async function installGame(id){
  const g = catalog.find(x => x.id === id);
  if(!g || !g.downloadUrl || jobs.has(id) || running.has(id)) return;
  const job = { cancelled: false, req: null };
  jobs.set(id, job);
  const dir = gameDir(id), tmp = dir + ".zip.part", next = dir + ".new";
  try{
    fs.mkdirSync(GAMES_DIR(), { recursive: true });
    let lastT = Date.now(), lastB = 0, speed = 0, lastSend = 0;
    const digest = await download(g.downloadUrl, tmp, job, (got, total) => {
      const now = Date.now();
      if(now - lastT >= 700){ speed = (got - lastB) / ((now - lastT) / 1000); lastT = now; lastB = got; }
      if(now - lastSend >= 120 || got === total){ lastSend = now; send("games:progress", { id, phase: "download", got, total, speed }); }
    });
    if(g.sha256 && digest.toLowerCase() !== String(g.sha256).toLowerCase()) throw new Error("El archivo descargado está dañado. Inténtalo de nuevo.");

    send("games:progress", { id, phase: "extract", got: 0, total: 0, speed: 0 });
    fs.rmSync(next, { recursive: true, force: true });
    await extract(tmp, { dir: next });
    if(job.cancelled) throw new Error("cancelado");
    fs.rmSync(dir, { recursive: true, force: true }); // actualizar = reemplazar la carpeta del juego
    fs.renameSync(next, dir);

    const st = readState();
    st[id] = { version: g.version || "1.0.0", installedAt: Date.now() };
    writeState(st);
    send("games:done", { id });
  }catch(e){
    fs.rmSync(next, { recursive: true, force: true });
    send("games:error", { id, message: job.cancelled ? "" : (e.message || "No se pudo instalar.") });
  }finally{
    fs.rmSync(tmp, { force: true });
    jobs.delete(id);
  }
}

ipcMain.handle("games:list", () => listGames());

ipcMain.handle("games:install", (_e, id) => { installGame(String(id)); return true; }); // el avance llega por eventos

ipcMain.handle("games:cancel", (_e, id) => {
  const job = jobs.get(String(id));
  if(job){ job.cancelled = true; if(job.req) job.req.destroy(); }
  return true;
});

ipcMain.handle("games:play", (_e, id) => {
  id = String(id);
  const g = catalog.find(x => x.id === id);
  if(!g || !readState()[id]) return { error: "El juego no está instalado." };
  if(running.has(id)) return { error: "" };
  const exe = exeOf(g);
  if(!exe || !fs.existsSync(exe)) return { error: "No encuentro el ejecutable del juego. Intenta repararlo reinstalando." };
  try{
    const child = spawn(exe, Array.isArray(g.args) ? g.args.map(String) : [], { cwd: path.dirname(exe), detached: true, stdio: "ignore" });
    running.set(id, child);
    child.on("error", () => { running.delete(id); send("games:running", { id, running: false }); });
    child.on("exit", () => { running.delete(id); send("games:running", { id, running: false }); });
    child.unref();
    send("games:running", { id, running: true });
    return { error: "" };
  }catch(e){ return { error: "No se pudo abrir el juego: " + e.message }; }
});

ipcMain.handle("games:uninstall", (_e, id) => {
  id = String(id);
  if(running.has(id) || jobs.has(id)) return false;
  fs.rmSync(gameDir(id), { recursive: true, force: true });
  const st = readState(); delete st[id]; writeState(st);
  return true;
});

ipcMain.handle("games:folder", (_e, id) => shell.openPath(gameDir(String(id))));

if(!app.requestSingleInstanceLock()){
  app.quit();
}else{
  app.on("second-instance", showWindow);
  app.on("before-quit", () => { quitting = true; });
  app.whenReady().then(async () => {
    const port = await startServer();
    origin = `http://localhost:${port}/`;

    /* Micrófono, notificaciones y compartir pantalla solo para nuestra propia página */
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => {
      cb(wc.getURL().startsWith(origin) && ["media", "notifications", "display-capture", "fullscreen"].includes(perm));
    });
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ["screen", "window"] })
        .then(srcs => srcs.length ? cb({ video: srcs[0] }) : cb({}))
        .catch(() => cb({}));
    }, { useSystemPicker: true });

    createWindow();
  });
  app.on("window-all-closed", () => { if(process.platform !== "darwin") app.quit(); });
}