// Navigasi mobile: hamburger (drawer) + rel server kiri ala Discord.
// Bottom bar + mini-profile DIHAPUS (biar lega, tidak keramaian):
// semua menu tetap 1-2 tap via hamburger/drawer dan rel server.
// Desktop tidak terpengaruh (CSS menyembunyikan elemen ini di >768px).
(function () {
  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function closeNav() {
    document.body.classList.remove('nav-open');
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Tandai WebView native sedini mungkin (CSS sembunyikan title-bar Electron,
    // safe-area, dsb. — berlaku juga di tablet lebar >767px).
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        document.body.classList.add('is-native', 'is-capacitor');
      }
    } catch (_) {}
    // Hanya di dashboard yang punya sidebar
    var sidebar = document.querySelector('.sidebar');
    var header = document.querySelector('.content-header');
    var title = document.getElementById('page-title');
    if (!sidebar || !header) return;

    // 1. Tombol hamburger di header
    if (!document.querySelector('.mobile-nav-btn')) {
      var btn = document.createElement('button');
      btn.className = 'mobile-nav-btn';
      btn.id = 'mobile-nav-btn';
      btn.title = 'Menu';
      btn.innerHTML = '<i class="fas fa-bars"></i>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        document.body.classList.toggle('nav-open');
      });
      header.insertBefore(btn, header.firstChild);
    }

    // 2b. Rel server kiri ala Discord (khusus layar kecil, CSS yang menampilkan).
    // Beranda, Pesan, lalu ikon tiap komunitas. Daftar komunitas diisi
    // refreshServerRail() yang dipanggil dashboard setelah login.
    if (!document.querySelector('.server-rail')) {
      var rail = document.createElement('div');
      rail.className = 'server-rail';
      rail.id = 'server-rail';
      rail.innerHTML =
        '<button type="button" class="rail-btn" data-rail="home" title="Beranda"><i class="fas fa-home"></i></button>' +
        '<div class="rail-sep"></div>' +
        '<button type="button" class="rail-btn" data-rail="dm" title="Pesan"><i class="fas fa-envelope"></i></button>' +
        '<div class="rail-sep"></div>' +
        '<div class="rail-comms" id="rail-comms"></div>' +
        '<button type="button" class="rail-btn rail-bug" data-rail="bug" title="Lapor Bug"><i class="fas fa-bug"></i></button>';
      // Rel HARUS jadi anak dashboard-container (flex baris). Kalau ditempel
      // ke body (flex kolom), rel nyangkut di bawah layar desktop.
      var host = document.querySelector('.dashboard-container');
      if (host) host.prepend(rail);
      else document.body.appendChild(rail);
      rail.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-rail],[data-comm]') : null;
        if (!b) return;
        closeNav();
        if (b.dataset.rail === 'home') {
          var home = document.querySelector('.sidebar-item[data-page="communities"]');
          if (home) home.click();
          else if (typeof renderPage === 'function') renderPage('communities');
          markRail(null);
        } else if (b.dataset.rail === 'dm') {
          var dm = document.querySelector('.sidebar-item[data-page="dm"]');
          if (dm) dm.click();
          else if (typeof renderPage === 'function') renderPage('dm');
          markRail(null);
        } else if (b.dataset.rail === 'bug') {
          if (typeof openBugReportModal === 'function') openBugReportModal();
        } else if (b.dataset.comm) {
          if (typeof openCommunity === 'function') openCommunity(b.dataset.comm);
          markRail(b.dataset.comm);
        }
      });
    }

    function markRail(commId) {
      document.querySelectorAll('#server-rail [data-comm]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.comm === commId);
      });
    }

    // Dipanggil dashboard.js setelah login & tiap daftar komunitas berubah.
    async function refreshServerRail() {
      var box = document.getElementById('rail-comms');
      if (!box) return;
      try {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        var res = await db.from('community_members').select('*').eq('user_id', currentUser.id);
        var memberships = (res && res.data) || [];
        var html = '';
        for (var i = 0; i < memberships.length; i++) {
          var m = memberships[i];
          var c = await db.from('communities').select('*').eq('id', m.community_id).maybeSingle();
          var comm = c && c.data;
          if (!comm) continue;
          var initial = (comm.name || '?').charAt(0).toUpperCase();
          html += '<button type="button" class="rail-btn rail-comm" data-comm="' + comm.id +
            '" title="' + String(comm.name || '').replace(/"/g, '&quot;') + '">' + initial + '</button>';
        }
        box.innerHTML = html || '<div class="rail-empty">•</div>';
      } catch (_) { /* rel opsional, jangan ganggu app */ }
    }
    // (Bottom nav + mini-profile dihapus permanen — navigasi via drawer & rel.)

    // 3. Tutup drawer saat item sidebar diklik (delegasi: mencakup juga
    // item komunitas dinamis #my-communities yang baru muncul belakangan).
    // Tanpa ini drawer tetap terbuka menutupi daftar channel
    // (sidebar z-900 di atas channel-sidebar z-850) sehingga tap channel
    // malah mengenai drawer: pesan tidak terbuka & tombol terasa mati.
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('nav-open')) return;
      if (!isMobile()) return;
      var t = e.target && e.target.closest ? e.target.closest('.sidebar-item') : null;
      if (t) {
        closeNav();
        if (t.dataset && t.dataset.page) markActive(t.dataset.page);
      }
    });

    // 4. Klik area konten menutup drawer
    document.querySelector('.main-content').addEventListener('click', function (e) {
      if (document.body.classList.contains('nav-open') && isMobile()) {
        // Jangan tutup kalau klik tombol hamburger
        if (e.target.closest && e.target.closest('.mobile-nav-btn')) return;
        closeNav();
      }
    });

    function markActive(page) {
      // Bottom nav dihapus — tinggal tandai judul (dipakai drawer).
      if (title) title.dataset.page = page;
    }

    // Expose untuk modul lain
    window.NobarlyMobile = { closeNav: closeNav, isMobile: isMobile, refreshRail: refreshServerRail, refreshMini: function () {} };
    window.refreshServerRail = refreshServerRail;
    window.markRail = markRail;

    // refreshMiniProfile dipertahankan sebagai no-op aman: pemanggil lama
    // (dashboard/profile/selfprofile) memanggilnya dengan guard typeof.
    function refreshMiniProfile() { /* mini-profile bar dihapus */ }
    window.refreshMiniProfile = refreshMiniProfile;
  });
})();
