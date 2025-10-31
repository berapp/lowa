// Secure preload script (new)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listDataDir: async () => {
    return await ipcRenderer.invoke('list-data-dir');
  },
  
  // GPS Serial Port Methods
  gps: {
    listSerialPorts: async () => {
      return await ipcRenderer.invoke('gps-list-serial-ports');
    },
    openSerialPort: async (portPath, baudRate) => {
      return await ipcRenderer.invoke('gps-open-serial-port', portPath, baudRate);
    },
    closeSerialPort: async () => {
      return await ipcRenderer.invoke('gps-close-serial-port');
    },
    onData: (callback) => {
      ipcRenderer.on('gps-data', (event, data) => callback(data));
    },
    onError: (callback) => {
      ipcRenderer.on('gps-error', (event, error) => callback(error));
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('gps-data');
      ipcRenderer.removeAllListeners('gps-error');
    }
  }
});

// Also expose a simple ping to main for diagnostics
contextBridge.exposeInMainWorld('diag', {
  pingMain: async () => await ipcRenderer.invoke('diag-ping')
});

// Preserve the small DOMContentLoaded helper from the original preload so the UI
// can show version info if the page includes elements for it.
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    try { replaceText(`${dependency}-version`, process.versions[dependency]); } catch (e) {}
  }
});
