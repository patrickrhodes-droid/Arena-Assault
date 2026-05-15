'use strict';

const { app, BrowserWindow, shell, dialog, utilityProcess } = require('electron');
const path = require('path');
const { get } = require('http');
const { createServer: createTcpServer } = require('net');
const fs = require('fs');

let mainWindow = null;
let serverChild = null;
let PORT = 3001;

// Try preferred port first; fall back to an OS-assigned free port.
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = createTcpServer();
    srv.listen(preferred, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', () => {
      const srv2 = createTcpServer();
      srv2.listen(0, '127.0.0.1', () => {
        const p = srv2.address().port;
        srv2.close(() => resolve(p));
      });
    });
  });
}

async function startServer() {
  const appRoot = app.isPackaged ? app.getAppPath() : __dirname;
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });

  PORT = await findFreePort(3001);

  const serverPath = path.join(appRoot, 'server.js');
  serverChild = utilityProcess.fork(serverPath, [], {
    env: { ...process.env, PORT: String(PORT), ARENA_DATA_DIR: userData },
    cwd: appRoot,
    stdio: 'pipe',
  });

  if (serverChild.stdout) serverChild.stdout.on('data', (d) => process.stdout.write(d));
  if (serverChild.stderr) serverChild.stderr.on('data', (d) => process.stderr.write(d));

  serverChild.on('exit', (code) => {
    serverChild = null;
    if (mainWindow) {
      dialog.showErrorBox(
        'Arena Assault — server crashed',
        `The game server stopped unexpectedly (exit code ${code ?? 'unknown'}).\n\nPlease restart the application.`,
      );
      mainWindow.close();
    }
  });
}

// Poll localhost:PORT until it responds (max ~10 s) instead of a fixed sleep.
function waitForServer(port, maxMs = 10000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    function attempt() {
      get(`http://localhost:${port}/`, (res) => {
        res.resume();
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
      `The game server failed to start.\n\n${err.message}\n\nMake sure no other application is blocking the port.`,
    );
    if (serverChild) { serverChild.kill(); serverChild = null; }
    app.quit();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (serverChild) { serverChild.kill(); serverChild = null; }
  app.quit();
});
