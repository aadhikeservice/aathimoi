const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApi', {
  isElectron: true,
  getAppVersion: () => '1.0.1',
  platform: process.platform,
  refocusWindow: () => ipcRenderer.send('refocus-window'),
  printThermalReceipt: (payload) => ipcRenderer.invoke('print-thermal-receipt', payload),
  printCurrentWindow: (options) => ipcRenderer.invoke('print-current-window', options),
  selectLocalFolder: () => ipcRenderer.invoke('select-local-folder'),
  savePdfDialog: (payload) => ipcRenderer.invoke('save-pdf-dialog', payload)
});
