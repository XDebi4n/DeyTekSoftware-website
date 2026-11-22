/* DeyTek Claud (escritorio) - proceso principal de Electron.
   Sirve la carpeta app/ en http://localhost:PUERTO (Firebase Auth no funciona bien desde file://),
   deja la app en la bandeja al cerrar para seguir recibiendo llamadas y avisa con ventana/notificación. */
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, session, desktopCapturer, nativeImage, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 47321; // fijo: la sesión de Firebase se guarda por origen (incluye el puerto)
const ROOT = path.join(__dirname, "app");
const ICON = path.join(ROOT, "img", "deytekclaud.png");
const TITLE = "DeyTek Claud";
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".webp": "image/webp", ".mp4": "video/mp4", ".json": "application/json", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg"
};


/* Que los sonidos (sirena, mensajes) suenen sin que el usuario haya hecho clic */
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win = null, tray = null, server = null, origin = "", quitting = false;

function startServer(){
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      let p = "/";
      try{ p = decodeURIComponent(req.url.split("?")[0]); }catch(e){}
      if(p === "/") p = "/index.html";
      const file = path.normalize(path.join(ROOT, p));
      if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if(err){ res.writeHead(404); return res.end("No encontrado"); }
               /* no-store: así siempre ves los cambios que hagas en app/ sin que quede nada en caché */
        res.writeHead(200, {"Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store"});
        res.end(data);
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

function createWindow(){
  const hasIcon = fs.existsSync(ICON);
  win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 420, minHeight: 520,
    backgroundColor: "#000000", autoHideMenuBar: true, title: TITLE,
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

ipcMain.on("unread", (_e, n) => { try{ app.setBadgeCount(Math.max(0, +n || 0)); }catch(e){} });

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
