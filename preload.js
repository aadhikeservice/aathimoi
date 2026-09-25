const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApi', {
  isElectron: true,
  getAppVersion: () => '1.0.0',
  platform: process.platform
});
