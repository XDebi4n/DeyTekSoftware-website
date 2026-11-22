const { contextBridge, ipcRenderer } = require("electron");

/* Puente mínimo y seguro entre la página y el proceso principal */
contextBridge.exposeInMainWorld("deytekDesktop", {
  alert: o => ipcRenderer.send("alert", { title: o && o.title, body: o && o.body }),
  ringing: (on, name) => ipcRenderer.send("ringing", { on: !!on, name }),
  unread: n => ipcRenderer.send("unread", n),
  win: a => ipcRenderer.send("win", String(a)),
  onMax: cb => ipcRenderer.on("win-max", (_e, v) => cb(!!v))
});

/* Lanzador de juegos */
const on = (ch, cb) => ipcRenderer.on(ch, (_e, d) => cb(d));
contextBridge.exposeInMainWorld("deytekGames", {
  list: () => ipcRenderer.invoke("games:list"),
  install: id => ipcRenderer.invoke("games:install", String(id)),
  cancel: id => ipcRenderer.invoke("games:cancel", String(id)),
  play: id => ipcRenderer.invoke("games:play", String(id)),
  uninstall: id => ipcRenderer.invoke("games:uninstall", String(id)),
  openFolder: id => ipcRenderer.invoke("games:folder", String(id)),
  onProgress: cb => on("games:progress", cb),
  onDone: cb => on("games:done", cb),
  onError: cb => on("games:error", cb),
  onRunning: cb => on("games:running", cb)
});