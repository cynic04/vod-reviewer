import { fileURLToPath } from 'node:url';
import { BrowserWindow, shell } from 'electron';

const PRELOAD_PATH = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const RENDERER_INDEX_PATH = fileURLToPath(new URL('../renderer/index.html', import.meta.url));

/** Set by electron-vite while developing; absent in a production build. */
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

/** Whether a URL is the app's own UI, as opposed to anything it may have been navigated to. */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (DEV_SERVER_URL) return parsed.origin === new URL(DEV_SERVER_URL).origin;
    return parsed.protocol === 'file:' && fileURLToPath(parsed) === RENDERER_INDEX_PATH;
  } catch {
    return false;
  }
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e10',
    title: 'VOD Reviewer',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // The app is a single local page: open real links in the browser and never navigate away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(RENDERER_INDEX_PATH);
  }

  return window;
}
