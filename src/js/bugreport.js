// Lapor Bug Nobarly — tombol 🐞 + tangkap error otomatis.
// Cara kerja simpel:
// 1. Teman klik "Lapor Bug", isi apa yang rusak, klik kirim.
// 2. Laporan masuk ke server (tabel bug_reports) + bawa info otomatis:
//    versi app, halaman, tipe HP, username.
// 3. Kamu lihat di: GET /api/feedback  atau halaman admin sederhana.
// 4. Error JS yang crash juga otomatis terkirim (tanpa ganggu teman).

function getBugApiBase() {
  try {
    if (window.NobarlyConfig) return window.NobarlyConfig.getApiBase();
    if (typeof API_BASE !== 'undefined') return API_BASE;
  } catch (_) {}
  return 'http://localhost:5000/api';
}

function getBugDeviceInfo() {
  try {
    const parts = [];
    parts.push('UA:' + (navigator.userAgent || '-').slice(0, 200));
    parts.push('Lang:' + (navigator.language || '-'));
    parts.push('Screen:' + (window.screen ? window.screen.width + 'x' + window.screen.height : '-'));
    try {
      const native = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'APK-native' : 'web';
      parts.push('Platform:' + native);
    } catch (_) {}
    return parts.join(' | ').slice(0, 1000);
  } catch (_) {
    return '';
  }
}

function getBugUser() {
  try {
    const u = JSON.parse(localStorage.getItem('nobarly_user') || 'null');
    if (u) return { id: u.id || null, username: u.username || u.email || null };
  } catch (_) {}
  return { id: null, username: null };
}

async function sendBugReport(title, message) {
  const base = getBugApiBase();
  const user = getBugUser();
  const version = (typeof NOBARLY_VERSION !== 'undefined' && NOBARLY_VERSION) || (window.NOBARLY_VERSION || '1.0.0');
  const res = await fetch(base + '/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title || 'Laporan Bug',
      message: message,
      page: (window.location.pathname.split('/').pop() || 'app') + ' | ' + (typeof currentPage !== 'undefined' ? currentPage : ''),
      app_version: version,
      device_info: getBugDeviceInfo(),
      user_id: user.id,
      username: user.username,
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Gagal kirim laporan.');
  return json.data;
}

function openBugReportModal(prefillMessage) {
  let overlay = document.getElementById('bug-report-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bug-report-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>🐞 Lapor Bug</h3>
          <button class="modal-close" id="bug-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:#b0b0b0;margin-bottom:12px;">
            Ceritakan apa yang rusak (mis. "tombol nobar muter terus di HP Xiaomi").
            Info versi + tipe HP terkirim otomatis.
          </p>
          <div class="auth-error" id="bug-error"></div>
          <div class="form-group">
            <label for="bug-title">Judul singkat</label>
            <input type="text" id="bug-title" placeholder="Contoh: Gagal login di HP" maxlength="200">
          </div>
          <div class="form-group">
            <label for="bug-message">Detail bug</label>
            <textarea id="bug-message" rows="4" placeholder="Langkah: 1. buka... 2. klik... 3. error..." style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:10px;font-family:inherit;font-size:13px;resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="bug-cancel">Batal</button>
          <button class="btn btn-primary" id="bug-send" style="width:auto;"><span class="btn-label">Kirim Laporan</span></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.classList.add('active');
  }
  const errBox = document.getElementById('bug-error');
  const showErr = (m) => {
    if (!m) { errBox.classList.remove('show'); errBox.textContent = ''; return; }
    errBox.textContent = m;
    errBox.classList.add('show');
  };
  showErr(null);
  if (prefillMessage) document.getElementById('bug-message').value = prefillMessage;
  document.getElementById('bug-close').onclick = () => overlay.classList.remove('active');
  document.getElementById('bug-cancel').onclick = () => overlay.classList.remove('active');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
  document.getElementById('bug-send').onclick = async (e) => {
    const btn = e.currentTarget;
    const title = document.getElementById('bug-title').value.trim();
    const message = document.getElementById('bug-message').value.trim();
    if (message.length < 3) { showErr('Isi detail bug dulu.'); return; }
    btn.disabled = true;
    showErr(null);
    try {
      await sendBugReport(title, message);
      overlay.classList.remove('active');
      document.getElementById('bug-title').value = '';
      document.getElementById('bug-message').value = '';
      alert('Makasih! Laporan bug terkirim. 🙏');
    } catch (err) {
      showErr(err.message || 'Gagal kirim. Cek koneksi ke server.');
    } finally {
      btn.disabled = false;
    }
  };
}

// Tangkap error JS yang bikin crash → kirim diam-diam ke server (max 1x per menit).
(function setupAutoBugCapture() {
  let lastSent = 0;
  function stackOf(err) {
    try {
      const s = (err && err.stack) || '';
      return s ? '\nStack: ' + String(s).slice(0, 600) : '';
    } catch (_) {
      return '';
    }
  }
  async function autoSend(msg, src, stack) {
    const now = Date.now();
    if (now - lastSent < 60000) return;
    lastSent = now;
    try {
      await sendBugReport('Auto-error: ' + String(msg).slice(0, 120), 'Otomatis dari app.\nSumber: ' + (src || '-') + '\nPesan: ' + msg + (stack || ''));
    } catch (_) { /* jangan ganggu user */ }
  }
  window.addEventListener('error', (e) => {
    try { autoSend(e.message || 'unknown error', e.filename + ':' + e.lineno, stackOf(e.error)); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const r = e.reason;
      autoSend((r && r.message) || String(r), 'promise', stackOf(r));
    } catch (_) {}
  });
})();

// Cek update: bandingkan versi APK vs versi server. Kalau beda → kasih banner.
async function checkAppUpdate() {
  try {
    const base = getBugApiBase();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(base.replace(/\/api$/i, '') + '/api/version', { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();
    const serverVer = json && json.data && json.data.version;
    const localVer = (typeof NOBARLY_VERSION !== 'undefined' && NOBARLY_VERSION) || window.NOBARLY_VERSION;
    if (!serverVer || !localVer || serverVer === localVer) return;
    const apkUrl = json.data.apk_url;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:9999;background:#fff;color:#000;padding:12px 14px;font-size:13px;font-weight:700;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:4px 4px 0 #333;border:1px solid #000;';
    banner.innerHTML = `<span>⬆️ Ada versi baru ${serverVer} (kamu: ${localVer}). Download biar bug lama hilang.</span>`;
    if (apkUrl) {
      const a = document.createElement('a');
      a.href = apkUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Download';
      a.style.cssText = 'background:#000;color:#fff;padding:8px 12px;text-decoration:none;white-space:nowrap;';
      banner.appendChild(a);
    } else {
      const b = document.createElement('button');
      b.textContent = 'OK';
      b.style.cssText = 'background:#000;color:#fff;padding:8px 12px;border:none;cursor:pointer;';
      b.onclick = () => banner.remove();
      banner.appendChild(b);
    }
    document.body.appendChild(banner);
  } catch (_) { /* offline → diam */ }
}

document.addEventListener('DOMContentLoaded', () => {
  try { checkAppUpdate(); } catch (_) {}
  // Tampilkan versi di sidebar kalau ada
  try {
    const v = (typeof NOBARLY_VERSION !== 'undefined' && NOBARLY_VERSION) || window.NOBARLY_VERSION;
    if (v) {
      const el = document.getElementById('app-version');
      if (el) el.textContent = 'v' + v;
    }
  } catch (_) {}
});
