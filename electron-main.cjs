'use strict';

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { get } = require('http');
const fs = require('fs');

const PORT = 3001;
let mainWindow = null;

async function startServer() {
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

// Poll localhost:PORT until it responds (max ~10 s) instead of a fixed sleep.
function waitForServer(port, maxMs = 10000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      get(`http://localhost:${port}/`, (res) => {
        res.resume(); // drain response
        resolve();
      }).on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Server did not respond on port ${port} within ${maxMs / 1000} s`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    }
    attempt();
  });
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer(PORT);
  } catch (err) {
    await dialog.showErrorBox(
      'Arena Assault — startup error',
      `The game server failed to start.\n\n${err.message}\n\nMake sure port ${PORT} is not already in use by another application.`,
    );
    app.quit();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => app.quit());
