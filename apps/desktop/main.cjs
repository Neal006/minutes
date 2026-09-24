// Minutes desktop: a thin, locked-down shell around the web app whose one job is
// capturing *system* audio (the other side of a Zoom/Meet call) without a screen picker.
const { app, BrowserWindow, desktopCapturer, session, shell } = require('electron');
const path = require('node:path');

const APP_URL = process.env.MINUTES_URL || 'http://localhost:3001';
const appOrigin = new URL(APP_URL).origin;

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Minutes',
    backgroundColor: '#111113',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links to anywhere else open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== appOrigin) e.preventDefault();
  });

  win.loadURL(APP_URL).catch(() => {
    const msg = `Can't reach the Minutes server at ${APP_URL}. Start it with "npm start" (or set MINUTES_URL), then press Ctrl+R.`;
    void win.loadURL(`data:text/html,<body style="font:16px system-ui;padding:40px;background:#111113;color:#ececef">${encodeURIComponent(msg)}</body>`);
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // Mic access for our own origin only.
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl ? new URL(details.requestingUrl).origin : '';
    callback(origin === appOrigin && (permission === 'media' || permission === 'clipboard-sanitized-write'));
  });

  // getDisplayMedia() from the web recorder → primary screen + system audio loopback, no picker.
  // Loopback audio is supported on Windows; elsewhere the web app sees no audio track and falls back to mic-only.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (new URL(request.frame?.url ?? request.securityOrigin ?? '').origin !== appOrigin) return callback({});
      const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
      callback(screen ? { video: screen, audio: 'loopback' } : {});
    } catch (e) {
      console.error('display media request failed', e);
      callback({});
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
