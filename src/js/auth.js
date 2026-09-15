// Auth client untuk Nobarly — localStorage session + JWT dari backend MariaDB
// NOTE: pakai `var` (bukan const) karena dashboard.html me-load auth.js dan
// db.js di global scope yang sama dan keduanya butuh API_BASE.
// Redeclarasi `const` antar <script> = SyntaxError yang mematikan seluruh file.
// API_BASE di-resolve oleh js/config.js (dinamis: localhost / WiFi / online / APK).
// Jangan hardcode lagi supaya APK bisa ganti server tanpa rebuild.
var API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : 'http://localhost:5000/api';

function showError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  if (!msg) {
    el.classList.remove('show');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.add('show');
}

function saveSession(token, user) {
  localStorage.setItem('nobarly_token', token);
  localStorage.setItem('nobarly_user', JSON.stringify(user));
}

function getSession() {
  try {
    const token = localStorage.getItem('nobarly_token');
    const user = JSON.parse(localStorage.getItem('nobarly_user') || 'null');
    if (token && user) return { token, user };
  } catch (_) { /* ignore */ }
  return null;
}

function clearSession() {
  localStorage.removeItem('nobarly_token');
  localStorage.removeItem('nobarly_user');
}

function goDashboard() {
  window.location.href = 'dashboard.html';
}

async function apiAuth(path, body) {
  try {
    if (typeof window !== 'undefined' && window.NobarlyConfig) {
      API_BASE = window.NobarlyConfig.getApiBase();
    }
  } catch (_) {}
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function switchTab(mode) {
  const isLogin = mode === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : 'block';
  showError(null);
}

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const span = btn.querySelector('.btn-label');
  if (span) span.textContent = loading ? 'Memproses...' : label;
}

document.addEventListener('DOMContentLoaded', async () => {
  // File ini dimuat di login.html DAN dashboard.html.
  // Guard semua elemen: di dashboard tidak ada tab/form login,
  // dan redirect otomatis hanya boleh jalan di halaman login
  // (tanpa guard ini: crash null + reload-loop dashboard).
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const isAuthPage = !!(formLogin || tabLogin);
  if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => switchTab('register'));
  if (!isAuthPage) return; // dashboard: dashboard.js yang atur via requireAuth()
  // Di HP: pastikan server terkonfigurasi dulu (overlay kalau belum)
  if (typeof ensureServerConfigured === 'function' && !ensureServerConfigured()) return;

  // Kalau sudah ada token valid, langsung ke dashboard
  const existing = getSession();
  if (existing) {
    try {
      if (typeof window !== 'undefined' && window.NobarlyConfig) {
        API_BASE = window.NobarlyConfig.getApiBase();
      }
    } catch (_) {}
    try {
      const res = await fetch(API_BASE + '/auth/me', {
        headers: { Authorization: `Bearer ${existing.token}` }
      });
      const json = await res.json();
      if (!json.error && json.data) {
        localStorage.setItem('nobarly_user', JSON.stringify(json.data));
        goDashboard();
        return;
      }
    } catch (_) { /* token invalid -> tetap di login */ }
    clearSession();
  }

  if (formLogin) formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(null);
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      showError('Email dan password wajib diisi.');
      return;
    }
    setLoading('btn-login', true);
    try {
      const { data, error } = await apiAuth('/auth/login', { email, password });
      if (error) {
        showError(error.message || 'Gagal masuk.');
        return;
      }
      saveSession(data.token, data.user);
      goDashboard();
    } catch (err) {
      showError('Tidak bisa menghubungi server. Pastikan backend jalan (npm run server).');
    } finally {
      setLoading('btn-login', false, 'Masuk');
    }
  });

  if (formRegister) formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(null);
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!username || !email || !password) {
      showError('Semua field wajib diisi.');
      return;
    }
    if (username.length < 3) {
      showError('Username minimal 3 karakter.');
      return;
    }
    if (password.length < 6) {
      showError('Password minimal 6 karakter.');
      return;
    }
    setLoading('btn-register', true);
    try {
      const { data, error } = await apiAuth('/auth/register', { username, email, password });
      if (error) {
        showError(error.message || 'Gagal daftar.');
        return;
      }
      saveSession(data.token, data.user);
      goDashboard();
    } catch (err) {
      showError('Tidak bisa menghubungi server. Pastikan backend jalan (npm run server).');
    } finally {
      setLoading('btn-register', false, 'Buat Akun');
    }
  });
});

// Dipakai dashboard.html
async function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  // Resync server (user HP bisa ganti server tanpa reload file)
  try {
    if (typeof window !== 'undefined' && window.NobarlyConfig) {
      API_BASE = window.NobarlyConfig.getApiBase();
    }
  } catch (_) {}
  // Verifikasi token ke server, refresh data user
  try {
    const res = await fetch(API_BASE + '/auth/me', {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    // 401 = token basi/invalid → wajib logout (jangan dianggap offline)
    if (res && res.status === 401) {
      clearSession();
      window.location.href = 'login.html';
      return null;
    }
    const json = await res.json();
    if (json.error || !json.data) {
      // Server jawab tapi aneh (bukan offline): kalau offline flag tidak ada,
      // anggap sesi invalid. Kalau fetch gagal total, catch di bawah yang handle.
      clearSession();
      window.location.href = 'login.html';
      return null;
    }
    localStorage.setItem('nobarly_user', JSON.stringify(json.data));
    return { token: session.token, user: json.data };
  } catch (_) {
    // Offline / server mati (fetch throw): pakai session lokal apa adanya
    return session;
  }
}

function logout() {
  try {
    if (window._presenceTimer) { clearInterval(window._presenceTimer); window._presenceTimer = null; }
    if (typeof stopChannelChat === 'function') stopChannelChat();
    if (typeof stopDM === 'function') stopDM();
    if (typeof stopVoiceRoomPoll === 'function') stopVoiceRoomPoll();
    if (typeof leaveVoiceChannel === 'function') { try { leaveVoiceChannel(); } catch (_) {} }
  } catch (_) {}
  clearSession();
  window.location.href = 'login.html';
}
