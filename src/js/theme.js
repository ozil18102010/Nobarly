// Theme Nobarly: dark (default) / light. Gratis, tersimpan lokal.
// Dipakai Settings (switch) + load awal semua halaman.
(function () {
  var KEY = 'nobarly_theme';
  function get() {
    try { return localStorage.getItem(KEY) || 'dark'; } catch (_) { return 'dark'; }
  }
  function apply(t) {
    var theme = (t === 'light') ? 'light' : 'dark';
    try {
      if (theme === 'light') document.body.classList.add('theme-light');
      else document.body.classList.remove('theme-light');
      try { document.documentElement.classList.toggle('theme-light-pre', theme === 'light'); } catch (_) {}
      localStorage.setItem(KEY, theme);
    } catch (_) {}
    try { window.NobarlyTheme = window.NobarlyTheme || {}; window.NobarlyTheme.current = theme; } catch (_) {}
    return theme;
  }
  function toggle() { return apply(get() === 'light' ? 'dark' : 'light'); }
  try {
    window.NobarlyTheme = { get: get, apply: apply, toggle: toggle, current: get() };
  } catch (_) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(get()); });
  } else {
    apply(get());
  }
})();
