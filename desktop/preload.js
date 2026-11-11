const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("KAIROS_DESKTOP", { version: ipcRenderer.sendSync("version-sync"), platform: process.platform });
