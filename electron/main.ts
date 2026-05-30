import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import log from 'electron-log';
import { registerIpcHandlers, setMainWindow } from './ipc/handlers';

log.initialize();

const isDev = !app.isPackaged;

if (isDev) {
  const defaultUserData = app.getPath('userData');
  const devUserData = join(defaultUserData + '-dev');
  app.setPath('userData', devUserData);
  log.info(`[Dev] userData redirected to: ${devUserData}`);
}

const logsDir = isDev
  ? join(process.cwd(), 'logs')
  : join(app.getPath('userData'), 'logs');
log.transports.file.resolvePathFn = () => join(logsDir, 'main.log');
log.transports.console.level = isDev ? 'debug' : 'error';
log.transports.file.level = isDev ? 'debug' : 'warn';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = isDev
    ? join(process.cwd(), 'buildResources', 'splash.html')
    : join(process.resourcesPath, 'splash.html');
  
  splashWindow.loadFile(splashPath);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow(): void {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: false }),
    show: false, // Don't show until ready
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Only open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Log renderer errors
  mainWindow.webContents.on('crashed', (_event, killed) => {
    log.error('Renderer process crashed:', { killed });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error('Failed to load:', { errorCode, errorDescription });
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (!isDev && level < 3) return;
    const levels = ['debug', 'info', 'warn', 'error'];
    log[levels[level] || 'info'](`[Renderer] ${message} (${sourceId}:${line})`);
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = join(__dirname, 'renderer', 'index.html');
    log.info('Loading renderer from:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready and close splash
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Show splash screen immediately
  createSplashWindow();
  
  // Create main window (takes time to load)
  createWindow();
  
  if (mainWindow) {
    registerIpcHandlers(mainWindow);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window when the dock icon is clicked
  // and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
    if (mainWindow) {
      setMainWindow(mainWindow);
    }
  }
});
