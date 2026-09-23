// Login sosial (Google / GitHub) — via browser sistem + deep link.
// Alur: tombol → GET /api/auth/oauth/:provider → provider → server callback
// → native: nobarly://auth?token=... (ditangkap di sini)
// → web: login.html?oauth_token=... ( diverifikasi di sini)
function _oauthApiBase() {
  try {
    if (window.NobarlyConfig) return window.NobarlyConfig.getApiBase();
    if (typeof API_BASE !== 'undefined') return API_BASE;
  } catch (_) {}
  return 'http://localhost:5000/api';
}

function _isNative() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (_) { return false; }
}

async function _oauthSaveToken(token, provider) {
  var base = _oauthApiBase();
  var res = await fetch(base + '/auth/me', {
    headers: { Authorization: 'Bearer ' + token }
  });
  var json = await res.json();
  if (json.error || !json.data) throw new Error('Token OAuth tidak valid.');
  if (typeof saveSession === 'function') saveSession(token, json.data);
  else {
    localStorage.setItem('nobarly_token', token);
    localStorage.setItem('nobarly_user', JSON.stringify(json.data));
  }
  if (typeof goDashboard === 'function') goDashboard();
  else window.location.href = 'dashboard.html';
}

function startOAuth(provider) {
  // Cegah navigasi buta ke halaman JSON 400 kalau provider belum dikonfigurasi
  // (mis. server lokal tanpa GOOGLE_CLIENT_ID) — tampilkan pesan ramah di form.
  try {
    var cfg = window._oauthProviders || null;
    if (cfg && cfg[provider] === false) {
      var msg = provider === 'google'
        ? 'Login Google belum dikonfigurasi di server ini. Isi GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET di .env (lokal) / Railway (online), lalu restart server.'
        : 'Login ' + provider + ' belum dikonfigurasi di server ini.';
      if (typeof showError === 'function') showError(msg);
      else alert(msg);
      return;
    }
  } catch (_) {}
  var base = _oauthApiBase();
  var native = _isNative();
  var url = base + '/auth/oauth/' + encodeURIComponent(provider) + '?target=' + (native ? 'native' : 'web');
  if (!native) {
    try { url += '&web_origin=' + encodeURIComponent(window.location.origin); } catch (_) {}
    window.location.href = url;
    return;
  }
  // APK: buka browser sistem (Custom Tab) — Google memblokir WebView
  try {
    var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (Browser && Browser.open) { Browser.open({ url: url }); return; }
  } catch (_) {}
  window.open(url, '_blank');
}

function _oauthFromUrl(url) {
  try {
    var q = url.split('?')[1] || '';
    var m = {};
    q.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) m[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return m.token || m.oauth_token ? { token: m.token || m.oauth_token, provider: m.provider || '' } : null;
  } catch (_) { return null; }
}

document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('oauth-buttons');
  var isLoginPage = !!document.getElementById('form-login');
  if (!box && !isLoginPage) return;

  // 1) Kembalian OAuth versi web: ?oauth_token=...
  try {
    var back = _oauthFromUrl(window.location.href);
    if (back && isLoginPage) {
      window.history.replaceState({}, '', window.location.pathname);
      _oauthSaveToken(back.token, back.provider).catch(function (e) {
        try { showError(e.message || 'Login sosial gagal.'); } catch (_) {}
      });
    }
  } catch (_) {}

  // 2) Kembalian OAuth versi APK: nobarly://auth?token=... via deep link
  if (_isNative()) {
    try {
      var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.addListener) {
        App.addListener('appUrlOpen', function (data) {
          try {
            var r = _oauthFromUrl(data.url || '');
            if (!r) return;
            var Browser = window.Capacitor.Plugins.Browser;
            if (Browser && Browser.close) { try { Browser.close(); } catch (_) {} }
            _oauthSaveToken(r.token, r.provider).catch(function () {});
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  // 3) Tampilkan tombol yang dikonfigurasi server
  if (box) {
    var show = function (cfg) {
      try { window._oauthProviders = cfg || null; } catch (_) {}
      ['google', 'github'].forEach(function (p) {
        var btn = document.getElementById('oauth-' + p);
        if (!btn) return;
        if (!cfg) {
          // Server tidak menjawab / server lama: tampilkan semua, server yang menolak
          btn.style.display = 'flex';
          btn.removeAttribute('disabled');
          btn.title = '';
          return;
        }
        if (cfg[p] === false) {
          // Provider belum dikonfigurasi: sembunyikan biar user tidak klik → 400
          btn.style.display = 'none';
          return;
        }
        btn.style.display = 'flex';
      });
      if (box.querySelectorAll('[id^="oauth-"]:not([style*="none"])').length > 0) box.style.display = 'block';
    };
    box.style.display = 'none';
    fetch(_oauthApiBase() + '/auth/oauth/providers')
      .then(function (r) { return r.json(); })
      .then(function (j) { show(j && j.data); })
      .catch(function () { show(null); });
    ['google', 'github'].forEach(function (p) {
      var btn = document.getElementById('oauth-' + p);
      if (btn) btn.addEventListener('click', function () { startOAuth(p); });
    });
  }
});
