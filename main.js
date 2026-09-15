const { app, BrowserWindow, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');

// Server lokal DHIDUPKAN OTOMATIS oleh aplikasi desktop.
// Kenapa: YouTube menolak halaman file:// (Error 153) walau video yang sama
// jalan di HP. Lewat http://localhost:PORT origin valid → player normal + sync jalan.
// Port ikut env (PORT/SERVER_PORT) supaya selaras dengan server.js (default 5000).
const SERVER_PORT = process.env.PORT || process.env.SERVER_PORT || 5000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

async function serverHealthy() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(SERVER_URL + '/api/health', { signal: ctrl.signal });
    clearTimeout(timer);
    return !!(res && res.ok);
  } catch (_) {
    return false;
  }
}

// Cek apakah port 5000 benar-benar bebas sebelum menghidupkan server
// embedded. Tanpa ini: port dipakai proses zombie → require() crash
// (EADDRINUSE async tidak ketangkap try/catch).
function portFree(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}

// Kalau belum ada server di :5000 (user cuma `npm start`), hidupkan server
// di dalam proses ini. Kalau sudah ada (user `npm run dev`), pakai itu.
async function ensureServer() {
  if (await serverHealthy()) return true;
  if (!(await portFree(SERVER_PORT))) return false; // port dihuni proses lain
  try {
    require('./server/server.js');
  } catch (_) { /* lanjut ke polling, mungkin DB bermasalah */ }
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await serverHealthy()) return true;
  }
  return false;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Nobarly',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    },
    autoHideMenuBar: true
  });

  // Share layar: Electron WAJIB punya handler ini, tanpa itu
  // getDisplayMedia() selalu NotSupportedError (laporan bug Admin).
  // Otomatis pilih layar utama supaya 1 klik langsung jalan.
  try {
    const ses = mainWindow.webContents.session;
    if (ses && typeof ses.setDisplayMediaRequestHandler === 'function') {
      ses.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
          const screen = sources.find(s => s.display_id !== '') || sources[0];
          callback({ video: screen || sources[0] || null });
        } catch (_) {
          callback({ video: null });
        }
      });
    }
  } catch (_) {}

  // Masuk ke halaman login dulu. dashboard.html punya guard:
  // kalau belum login, otomatis redirect ke login.html
  ensureServer().then((ok) => {
    if (ok) {
      mainWindow.loadURL(SERVER_URL + '/login.html');
    } else {
      // Darurat: server tidak bisa nyala (mis. MariaDB mati).
      // Buka file lokal supaya app tetap kebuka; nobar YouTube
      // mungkin Error 153 sampai server diperbaiki.
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Server Nobarly tidak jalan',
        message: `Tidak bisa menghidupkan server lokal di ${SERVER_URL}. Pastikan MariaDB jalan, lalu restart aplikasi.`,
      }).catch(() => {});
      mainWindow.loadFile(path.join(__dirname, 'src', 'login.html'));
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
