// Pengenalan Nobarly: onboarding carousel (pertama buka APK) + halaman Tentang.
// Versi kita: bukan playlist musik — tapi NOBAR (nonton bareng sinkron + komunitas).

var NOBARLY_ONBOARD_KEY = 'nobarly_onboarded_v2';

var NOBARLY_INTRO_SLIDES = [
  {
    emoji: '🎬',
    title: 'Selamat datang di Nobarly!',
    desc: 'Nonton streaming bareng (nobar) YouTube & Twitch — playback ngikutin host otomatis. Kapan aja, di mana aja.'
  },
  {
    emoji: '🔊',
    title: 'Voice + Chat Rame-rame',
    desc: 'Ngobrol suara di voice channel, chat teks real-time, plus reaksi melayang biar nobar makin seru.'
  },
  {
    emoji: '👥',
    title: 'Komunitas & Teman',
    desc: 'Gabung komunitas game favoritmu, tambah teman, lanjut ngobrol di DM.'
  },
  {
    emoji: '🎨',
    title: 'Customize, Gratis Semua',
    desc: 'Avatar GIF animasi, nameplate, banner profil — tanpa Nitro, tanpa Shop, tanpa kunci.'
  },
  {
    emoji: '🚀',
    title: 'Mulai Nobar Pertamamu!',
    desc: 'Buat party, share ke teman, dan tonton bareng sekarang.'
  }
];

function _onboardDone() {
  try { localStorage.setItem(NOBARLY_ONBOARD_KEY, '1'); } catch (_) {}
}

function showOnboarding() {
  if (document.getElementById('onboard-overlay')) return;
  var idx = 0;
  var overlay = document.createElement('div');
  overlay.id = 'onboard-overlay';
  overlay.className = 'onboard-overlay';
  document.body.appendChild(overlay);

  function render() {
    var s = NOBARLY_INTRO_SLIDES[idx];
    var last = idx === NOBARLY_INTRO_SLIDES.length - 1;
    var dots = NOBARLY_INTRO_SLIDES.map(function (_, i) {
      return '<button class="onboard-dot' + (i === idx ? ' sel' : '') + '" data-i="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join('');
    overlay.innerHTML =
      '<div class="onboard-card">' +
        '<div class="onboard-emoji">' + s.emoji + '</div>' +
        '<h2>' + s.title + '</h2>' +
        '<p>' + s.desc + '</p>' +
        '<div class="onboard-dots">' + dots + '</div>' +
        '<div class="onboard-actions">' +
          (last
            ? '<button class="btn btn-primary" id="onboard-next" style="flex:1;">🚀 Mulai Nobar</button>'
            : '<button class="btn btn-secondary" id="onboard-skip" style="width:auto;">Lewati</button>' +
              '<button class="btn btn-primary" id="onboard-next" style="flex:1;">Lanjut ›</button>') +
        '</div>' +
      '</div>';
    overlay.querySelectorAll('.onboard-dot').forEach(function (d) {
      d.onclick = function () { idx = parseInt(d.dataset.i, 10) || 0; render(); };
    });
    var skip = document.getElementById('onboard-skip');
    if (skip) skip.onclick = close;
    document.getElementById('onboard-next').onclick = function () {
      if (last) {
        close();
        try {
          var side = document.querySelector('.sidebar-item[data-page="nobar"]');
          if (side) side.click();
          else if (typeof renderPage === 'function') renderPage('nobar');
        } catch (_) {}
      } else {
        idx++;
        render();
      }
    };
  }

  function esc(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight' && idx < NOBARLY_INTRO_SLIDES.length - 1) { idx++; render(); }
    if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
  }

  function close() {
    _onboardDone();
    try { document.removeEventListener('keydown', esc); } catch (_) {}
    try { overlay.remove(); } catch (_) {}
  }

  document.addEventListener('keydown', esc);
  render();
}
window.showOnboarding = showOnboarding;

// Tampilkan otomatis sekali per versi intro (user lama ikut lihat setelah update)
function maybeShowOnboarding() {
  try {
    if (!localStorage.getItem(NOBARLY_ONBOARD_KEY)) {
      setTimeout(function () {
        try { showOnboarding(); } catch (_) {}
      }, 600);
      return true;
    }
  } catch (_) {}
  return false;
}
window.maybeShowOnboarding = maybeShowOnboarding;

// ===== HALAMAN TENTANG NOBARLY =====
function loadAboutPage() {
  var body = document.getElementById('content-body');
  document.getElementById('page-title').textContent = 'Tentang Nobarly';
  document.getElementById('header-actions').innerHTML = '';
  var ver = (typeof NOBARLY_VERSION !== 'undefined' && NOBARLY_VERSION) || window.NOBARLY_VERSION || '?';
  var feats = [
    { icon: '📺', title: 'Nobar Sinkron', desc: 'Party YouTube & Twitch, playback ngikutin host.' },
    { icon: '🔊', title: 'Voice Channel', desc: 'Ngobrol suara + soundboard bareng komunitas.' },
    { icon: '💬', title: 'Chat & DM', desc: 'Chat channel real-time + pesan pribadi ke teman.' },
    { icon: '👥', title: 'Komunitas', desc: 'Buat / gabung komunitas game favoritmu.' },
    { icon: '🎨', title: 'Customize Gratis', desc: 'Avatar GIF, nameplate, banner. Tanpa Nitro.' },
    { icon: '🐞', title: 'Lapor Bug', desc: 'Ketemu bug? Lapor langsung dari APK.' }
  ];
  body.innerHTML =
    '<div style="max-width:640px;">' +
      '<div class="about-hero">' +
        '<div class="about-emoji">📺</div>' +
        '<h2>Nobarly v' + String(ver).replace(/</g, '&lt;') + '</h2>' +
        '<p>Platform nonton streaming bareng (nobar) dan komunitas gamer. Gratis, tanpa Nitro.</p>' +
      '</div>' +
      '<div class="about-grid">' +
        feats.map(function (f) {
          return '<div class="about-card"><div class="about-icon">' + f.icon + '</div><b>' + f.title + '</b><p>' + f.desc + '</p></div>';
        }).join('') +
      '</div>' +
      '<div class="xp-card">' +
        '<b>🚀 Cara Nobar (3 langkah)</b>' +
        '<p>1. Masuk / buat komunitas<br>2. Buka menu <b>Nobar</b><br>3. Buat party + ajak teman nonton bareng</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-primary" id="about-nobar" style="width:auto;">📺 Buat Nobar</button>' +
          '<button class="btn btn-secondary" id="about-intro" style="width:auto;">▶️ Lihat Intro Lagi</button>' +
        '</div>' +
      '</div>' +
      '<div class="xp-card">' +
        '<b>⬆️ Update & Bantuan</b>' +
        '<p>Pastikan selalu pakai versi terbaru biar bug lama hilang.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary" id="about-update" style="width:auto;">Cek Update</button>' +
          '<button class="btn btn-secondary" id="about-bug" style="width:auto;">🐞 Lapor Bug</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.getElementById('about-nobar').addEventListener('click', function () {
    var side = document.querySelector('.sidebar-item[data-page="nobar"]');
    if (side) side.click();
    else if (typeof renderPage === 'function') renderPage('nobar');
  });
  document.getElementById('about-intro').addEventListener('click', function () {
    if (typeof showOnboarding === 'function') showOnboarding();
  });
  document.getElementById('about-update').addEventListener('click', async function () {
    try {
      if (typeof checkAppUpdate === 'function') {
        var r = await checkAppUpdate(true);
        if (!r) alert('Kamu sudah pakai versi terbaru 🎉');
      }
    } catch (_) {}
  });
  document.getElementById('about-bug').addEventListener('click', function () {
    if (typeof openBugReportModal === 'function') openBugReportModal();
  });
}
window.loadAboutPage = loadAboutPage;
