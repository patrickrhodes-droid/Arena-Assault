'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const PORT = 3001;
let mainWindow = null;

async function startServer() {
  // In the packaged app, app.getAppPath() is the bundled resources/app/ folder.
  // In dev, __dirname is the project root.
  const appRoot = app.isPackaged ? app.getAppPath() : __dirname;
  process.chdir(appRoot);

  // Redirect persistent data (leaderboard, career stats) to a user-writable
  // directory so it survives app updates and doesn't hit Program Files ACLs.
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  process.env.ARENA_DATA_DIR = userData;

  const serverPath = path.join(appRoot, 'server.js');
  await import(pathToFileURL(serverPath).href);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0a0f14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Arena Assault',
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // External links open in the system browser, not inside the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error('[Electron] Server failed to start:', err);
    app.quit();
    return;
  }

  // Give the HTTP server a moment to bind to the port before loading the UI
  await new Promise(r => setTimeout(r, 1500));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
