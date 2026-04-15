'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require('electron');
const { DEFAULT_API_BASE_URL } = require('./app-config');
const { createSessionStore } = require('./session-store');
const { createTrackerAgent } = require('./tracker-agent');

// Force X11 on Linux so desktopCapturer works silently without
// triggering the Wayland/PipeWire XDG portal "Share Screen" prompt.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('disable-features', 'WaylandWindowDecorations');
  process.env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
}

let mainWindow = null;
let tray = null;
let quitting = false;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 700,
    minWidth: 420,
    minHeight: 620,
    show: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
};

const buildTrayImage = () => {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  return nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
};

const setupSingleInstance = () => {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return true;
};

if (!setupSingleInstance()) {
  process.exit(0);
}

app.whenReady().then(() => {
  const store = createSessionStore(app);
  const tracker = createTrackerAgent({
    app,
    store,
    onStateChange: () => {
      refreshTray();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent:state-changed');
      }
    }
  });

  const refreshTray = () => {
    const snapshot = tracker.getSnapshot();
    if (!tray) {
      return;
    }

    tray.setToolTip(
      `${snapshot.loggedIn ? `${snapshot.user.name} (${snapshot.status})` : 'Signed out'} | ` +
      `Tracked ${formatDuration(snapshot.trackedSeconds)}`
    );

    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: snapshot.loggedIn ? `Status: ${snapshot.status}` : 'Status: SIGNED_OUT',
          enabled: false
        },
        {
          label: snapshot.loggedIn ? `User: ${snapshot.user.employeeId || snapshot.user.adminId || snapshot.user.name}` : 'User: Not signed in',
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Open Autovyn Desktop',
          click: () => {
            if (mainWindow) {
              mainWindow.setSkipTaskbar(false);
              mainWindow.show();
              mainWindow.focus();
            }
          }
        },
        snapshot.loggedIn
          ? {
              label: 'Logout',
              click: () => {
                void tracker.logout();
              }
            }
          : {
              label: 'Login',
              click: () => {
                if (mainWindow) {
                  mainWindow.setSkipTaskbar(false);
                  mainWindow.show();
                  mainWindow.focus();
                }
              }
            },
        { type: 'separator' },
        {
          label: 'Quit',
          click: async () => {
            quitting = true;
            await tracker.flush().catch(() => undefined);
            app.quit();
          }
        }
      ])
    );
  };

  createMainWindow();
  tray = new Tray(buildTrayImage());
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tracker.start();
  refreshTray();

  ipcMain.handle('agent:get-state', async () => tracker.getSnapshot());
  ipcMain.handle('agent:get-config', async () => ({
    defaultApiBaseUrl: DEFAULT_API_BASE_URL
  }));
  ipcMain.handle('agent:login', async (_event, payload) => tracker.login(payload || {}));
  ipcMain.handle('agent:logout', async () => tracker.logout());
  ipcMain.handle('agent:update-settings', async (_event, payload) => tracker.updateSettings(payload || {}));
  ipcMain.handle('agent:open-window', async () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  });

  if (tracker.shouldShowWindowOnLaunch()) {
    mainWindow.show();
    mainWindow.setSkipTaskbar(false);
  }

  ipcMain.handle('agent:hide-window', async () => {
    if (mainWindow) {
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    }
    return true;
  });

  app.on('before-quit', async () => {
    quitting = true;
    tracker.stop();
    await tracker.flush().catch(() => undefined);
  });

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

const formatDuration = (totalSeconds) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
