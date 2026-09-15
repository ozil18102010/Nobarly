// Nobarly power-saver: jeda polling saat tab disembunyikan / offline.
// Tanpa ini 3 polling (voice 2dk + chat 3dk + watch 3dk) jalan bareng di
// background Android → boros baterai + data. Dipakai semua modul poll.
(function () {
  var hidden = false;
  try {
    hidden = !!document.hidden;
    document.addEventListener('visibilitychange', function () {
      hidden = !!document.hidden;
      // Saat kembali terlihat, paksa refresh sekali supaya tidak ketinggalan.
      if (!hidden) {
        try {
          if (typeof refreshTick === 'function') refreshTick();
        } catch (_) {}
        try {
          if (window._nobarlyOnVisible) window._nobarlyOnVisible();
        } catch (_) {}
      }
    });
    window.addEventListener('online', function () {
      try { if (window._nobarlyOnVisible) window._nobarlyOnVisible(); } catch (_) {}
    });
  } catch (_) {}

  // True = polling boleh jalan. False = tab hidden ATAU offline → skip tick.
  window.NobarlyPollActive = function () {
    try {
      if (document.hidden) return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    } catch (_) {}
    return true;
  };
})();
