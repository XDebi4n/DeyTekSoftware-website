const { contextBridge, ipcRenderer } = require("electron");

/* Puente mínimo y seguro entre la página y el proceso principal */
contextBridge.exposeInMainWorld("deytekDesktop", {
  alert: o => ipcRenderer.send("alert", { title: o && o.title, body: o && o.body }),
  ringing: (on, name) => ipcRenderer.send("ringing", { on: !!on, name }),
  unread: n => ipcRenderer.send("unread", n),
  win: a => ipcRenderer.send("win", String(a)),
  onMax: cb => ipcRenderer.on("win-max", (_e, v) => cb(!!v))
});