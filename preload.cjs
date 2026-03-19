const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    open: (path, baudRate) => ipcRenderer.invoke('serial:open', { path, baudRate }),
    close: (path) => ipcRenderer.invoke('serial:close', { path }),
    write: (path, data) => ipcRenderer.invoke('serial:write', { path, data }),
    onData: (callback) => {
      ipcRenderer.on('serial:data', (event, data) => callback(data));
    },
    removeDataListener: () => {
      ipcRenderer.removeAllListeners('serial:data');
    }
  },

  store: {
    set: (key, value) => ipcRenderer.invoke('store:set', { key, value }),
    get: (key) => ipcRenderer.invoke('store:get', { key }),
    delete: (key) => ipcRenderer.invoke('store:delete', { key }),
    keys: () => ipcRenderer.invoke('store:keys'),
    clear: () => ipcRenderer.invoke('store:clear')
  },

  fs: {
    saveFile: (filename, data) => ipcRenderer.invoke('fs:saveFile', { filename, data }),
    openFile: () => ipcRenderer.invoke('fs:openFile')
  }
});