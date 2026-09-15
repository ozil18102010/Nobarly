// Konfigurasi alamat server Nobarly.
// Di PC (Electron/browser): default http://localhost:5000/api.
// Di HP (aplikasi native): localhost = HP itu sendiri, jadi APK WAJIB menunjuk
// ke server ONLINE (https://...), bukan IP lokal, supaya bisa dipakai teman
// dari mana saja tanpa satu WiFi.
// File ini WAJIB di-load pertama sebelum auth.js / db.js di semua halaman.
var API_BASE_DEFAULT = 'http://localhost:5000/api';
// Server permanen (Railway, live 2026-09-15). Menggantikan tunnel sementara.
// Semua HP otomatis pindah ke sini via BAKED_SERVER_V (tidak perlu setting manual).
var PROD_SERVER = 'https://nobarly-server-production.up.railway.app/api';
// Server bawaan untuk APK (di-bake saat build). Kalau URL produksi berubah,
// naikkan BAKED_SERVER_V supaya setting lama di HP otomatis ikut update.
var BAKED_NATIVE_SERVER = PROD_SERVER;
var BAKED_SERVER_V = 7;
var API_BASE = (function () {
  try {
    // Migrasi otomatis khusus aplikasi HP: tanpa ini user harus isi manual,
    // dan update APK tidak akan memperbaiki setting lama yang salah.
    var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (native) {
      var v = null;
      try { v = localStorage.getItem('nobarly_server_v'); } catch (_) {}
      if (String(v) !== String(BAKED_SERVER_V)) {
        try {
          localStorage.setItem('nobarly_server', BAKED_NATIVE_SERVER);
          localStorage.setItem('nobarly_server_v', String(BAKED_SERVER_V));
        } catch (_) {}
        return BAKED_NATIVE_SERVER;
      }
    }
    return localStorage.getItem('nobarly_server') || API_BASE_DEFAULT;
  } catch (_) {
    return API_BASE_DEFAULT;
  }
})();

function isNativeApp() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (_) {
    return false;
  }
}

function normalizeServerUrl(input) {
  let u = String(input || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  if (!/\/api$/i.test(u)) u = u + '/api';
  return u;
}

function setApiBase(url) {
  const clean = normalizeServerUrl(url);
  if (!clean) return API_BASE;
  API_BASE = clean;
  try {
    localStorage.setItem('nobarly_server', clean);
  } catch (_) {}
  return API_BASE;
}

// Objek kompatibilitas: kode lama (login.html dsb.) memanggil
// window.NobarlyConfig.getApiBase() / setApiBase().
try {
  window.NobarlyConfig = window.NobarlyConfig || {};
  window.NobarlyConfig.getApiBase = function () { return API_BASE; };
  window.NobarlyConfig.setApiBase = function (url) { return setApiBase(url); };
  window.NobarlyConfig.isNativeApp = isNativeApp;
  window.NobarlyConfig.testServerConnection = testServerConnection;
} catch (_) {}

async function testServerConnection(url) {
  const base = normalizeServerUrl(url);
  if (!base) return { ok: false, message: 'Alamat kosong.' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(base.replace(/\/api$/i, '') + '/api/health', { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();
    if (json && json.status === 'ok') return { ok: true, base };
    return { ok: false, message: 'Bukan server Nobarly.' };
  } catch (_) {
    return { ok: false, message: 'Tidak tersambung. Pastikan server jalan & satu WiFi.' };
  }
}

// Overlay setup/pengaturan alamat server. Dipakai saat pertama kali di HP
// dan lewat tombol ⚙ di dashboard.
function openServerSettings(onSaved) {
  let overlay = document.getElementById('server-setup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'server-setup-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header"><h3><i class="fas fa-server"></i> Alamat Server</h3></div>
        <div class="modal-body">
          <p style="font-size:13px;color:#b0b0b0;margin-bottom:12px;">
            ${isNativeApp()
              ? 'HP tidak bisa pakai localhost. Isi alamat server dari laptop yang menjalankan <b>npm run server</b> (satu WiFi), contoh: <b>http://192.168.1.5:5000/api</b>'
              : 'Alamat backend Nobarly. Default localhost untuk PC.'}
          </p>
          <div class="auth-error" id="server-setup-error"></div>
          <div class="form-group">
            <label for="server-url-input">URL Server</label>
            <input type="text" id="server-url-input" placeholder="http://192.168.1.5:5000/api">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="server-use-localhost">Localhost</button>
          <button class="btn btn-primary" id="server-save-btn" style="width:auto;"><span class="btn-label">Simpan & Sambungkan</span></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.classList.add('active');
  }

  const input = document.getElementById('server-url-input');
  const errBox = document.getElementById('server-setup-error');
  input.value = API_BASE === API_BASE_DEFAULT ? '' : API_BASE;
  const showErr = (m) => {
    if (!m) { errBox.classList.remove('show'); errBox.textContent = ''; return; }
    errBox.textContent = m;
    errBox.classList.add('show');
  };
  showErr(null);

  const localhostBtn = document.getElementById('server-use-localhost');
  // Di HP native: localhost = HP itu sendiri → 1 tap bikin app mati sampai clear-data.
  // Sembunyikan tombolnya sekalian.
  if (isNativeApp() && localhostBtn) localhostBtn.style.display = 'none';
  localhostBtn.onclick = () => {
    if (isNativeApp()) {
      showErr('HP tidak bisa pakai localhost. Isi alamat server laptop (satu WiFi).');
      return;
    }
    setApiBase(API_BASE_DEFAULT);
    overlay.classList.remove('active');
    if (typeof onSaved === 'function') onSaved();
    else window.location.reload();
  };
  document.getElementById('server-save-btn').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    showErr(null);
    const check = await testServerConnection(input.value);
    btn.disabled = false;
    if (!check.ok) {
      showErr(check.message);
      return;
    }
    setApiBase(check.base);
    overlay.classList.remove('active');
    if (typeof onSaved === 'function') onSaved();
    else window.location.reload();
  };
}

// Dipanggil di awal tiap halaman: kalau aplikasi HP dan server belum diset,
// tampilkan overlay dan hentikan init (lanjut setelah user simpan → reload).
// Return true = sudah terkonfigurasi, lanjutkan init.
function ensureServerConfigured() {
  let saved = null;
  try {
    saved = localStorage.getItem('nobarly_server');
  } catch (_) {}
  if (isNativeApp() && !saved) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => openServerSettings());
    } else {
      openServerSettings();
    }
    return false;
  }
  return true;
}
