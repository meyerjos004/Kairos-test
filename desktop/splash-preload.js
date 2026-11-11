const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("kz", { on: (fn) => ipcRenderer.on("upd", (_e, d) => fn(d)), introDone: () => ipcRenderer.send("intro-done"), updateNow: () => ipcRenderer.send("update-now"), later: () => ipcRenderer.send("update-later") });
