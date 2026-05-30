import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import log from 'electron-log';
import { registerIpcHandlers, setMainWindow } from './ipc/handlers';

log.initialize();

// Configure logs to output to project-root/logs/
const logsDir = join(process.cwd(), 'logs');
log.transports.file.resolvePathFn = () => join(logsDir, 'main.log');
log.transports.console.level = 'debug';
log.transports.file.level = 'debug';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: false }),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
