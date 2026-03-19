const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const { SerialPort } = require('serialport');
const fs = require('fs').promises;

const isDev = !app.isPackaged;
const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    titleBarStyle: 'default',
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Serial Port Handlers
global.serialPorts = {};

ipcMain.handle('serial:list', async () => {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (error) {
    console.error('Error listing ports:', error);
    return [];
  }
});

ipcMain.handle('serial:open', async (event, { path, baudRate }) => {
  try {
    const port = new SerialPort({
      path,
      baudRate: baudRate || 115200,
      autoOpen: false
    });

    return new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) {
          reject(err);
        } else {
          global.serialPorts[path] = port;

          port.on('data', (data) => {
            mainWindow?.webContents.send('serial:data', {
              path,
              data: data.toString()
            });
          });

          resolve({ success: true, path });
        }
      });
    });
  } catch (error) {
    console.error('Error opening port:', error);
    throw error;
  }
});

ipcMain.handle('serial:close', async (event, { path }) => {
  try {
    const port = global.serialPorts[path];
    if (port && port.isOpen) {
      return new Promise((resolve, reject) => {
        port.close((err) => {
          if (err) {
            reject(err);
          } else {
            delete global.serialPorts[path];
            resolve({ success: true });
          }
        });
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error closing port:', error);
    throw error;
  }
});

ipcMain.handle('serial:write', async (event, { path, data }) => {
  try {
    const port = global.serialPorts[path];
    if (port && port.isOpen) {
      return new Promise((resolve, reject) => {
        port.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true });
          }
        });
      });
    }
    throw new Error('Port not open');
  } catch (error) {
    console.error('Error writing to port:', error);
    throw error;
  }
});

// Storage Handlers
ipcMain.handle('store:set', async (event, { key, value }) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle('store:get', async (event, { key }) => {
  return store.get(key);
});

ipcMain.handle('store:delete', async (event, { key }) => {
  store.delete(key);
  return { success: true };
});

ipcMain.handle('store:keys', async () => {
  return Object.keys(store.store);
});

ipcMain.handle('store:clear', async () => {
  store.clear();
  return { success: true };
});

// File System Handlers
ipcMain.handle('fs:saveFile', async (event, { filename, data }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
      await fs.writeFile(filePath, data, 'utf-8');
      return { success: true };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
});

ipcMain.handle('fs:openFile', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      const data = await fs.readFile(filePaths[0], 'utf-8');
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});