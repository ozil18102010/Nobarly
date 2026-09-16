// Halaman Quests / Shop / Nitro / Settings (bottom nav HP + sidebar laptop).
// Orbs: mata uang Nobarly. Dapat dari check-in harian, dipakai di Shop.

function xpHead(title, orbs) {
  return `
    <div class="xp-head">
      <h3>${title}</h3>
      <div class="xp-balance">🪙 ${orbs != null ? orbs : (currentUser ? (currentUser.orbs || 0) : 0)}</div>
    </div>`;
}

function refreshMyOrbs(orbs) {
  if (currentUser) {
    currentUser.orbs = orbs;
    try { localStorage.setItem('nobarly_user', JSON.stringify(currentUser)); } catch (_) {}
  }
  document.querySelectorAll('.xp-balance').forEach(el => { el.textContent = '🪙 ' + orbs; });
}

// ===== CUSTOMIZE (pengganti Shop + Edit Profile, semua gratis) =====
// Satu-satunya editor profil. Dibuka dari: sidebar Customize, Settings,
// floating profile card (tombol Customize), dan halaman Profil.
async function loadCustomizePage() {
  const body = document.getElementById('content-body');
  document.getElementById('page-title').textContent = 'Customize';
  document.getElementById('header-actions').innerHTML = '';
  const u = (typeof currentUser !== 'undefined') ? currentUser : {};
  const presets = (window.NAMEPLATE_PRESETS || []);
  body.innerHTML = `
    <div style="max-width:640px;">
      <div class="xp-head"><h3>🎨 Customize — gratis semua</h3></div>
      <div class="xp-card">
        <b>👤 Avatar & Nameplate</b>
        <p>Upload foto/GIF sendiri. GIF ikut bergerak di chat, DM, voice & profil.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="cz-edit" style="width:auto;">🎨 Buka Customize</button>
          <button class="btn btn-secondary" id="cz-nameplate" style="width:auto;">Change Nameplate</button>
          <button class="btn btn-secondary" id="cz-avatar" style="width:auto;">Change Avatar</button>
        </div>
      </div>
      <div class="xp-card">
        <b>🖼️ Nameplate milikmu</b>
        <p>Klik untuk pratinjau. Semua preset gratis.</p>
        <div class="np-list" id="cz-nplist"></div>
      </div>
      <div class="xp-card">
        <b>🌈 Banner</b>
        <p>Warna bebas / foto sendiri via tombol Buka Customize di atas. Profile Effect & Frame menyusul (skip dulu).</p>
      </div>
      <div class="xp-card" style="border-color:#23a55a;">
        <b>💡 Tanpa Nitro, tanpa Shop</b>
        <p>Semua kosmetik Nobarly gratis penuh. Tidak ada fitur yang dikunci.</p>
      </div>
    </div>`;
  const box = document.getElementById('cz-nplist');
  const cur = u.nameplate || '';
  const styleOf = (np) => {
    try { return window.nameplateStyle(np); } catch (_) { return ''; }
  };
  box.innerHTML = [{ id: '', label: 'None' }].concat(presets).map(it =>
    `<button class="np-item${cur === it.id ? ' sel' : ''}" data-v="${it.id}">
      <span class="np-thumb" style="${it.css ? 'background:' + it.css + ';' : 'background:#111;'}"></span>
      <span>${it.label}</span></button>`
  ).join('') + (cur && (/^\//.test(cur) || /^https?:/.test(cur))
    ? `<button class="np-item sel" data-v="${cur}"><span class="np-thumb" style="${styleOf(cur)}"></span><span>Foto sendiri</span></button>` : '');
  box.querySelectorAll('.np-item').forEach(b => {
    b.addEventListener('click', () => {
      if (typeof openNameplateDialog === 'function') {
        openNameplateDialog(cur, async (v) => {
          try {
            const res = await db.from('profiles').update({ nameplate: v || null }).eq('id', currentUser.id);
            if (!res.error) {
              currentUser.nameplate = v || null;
              try { localStorage.setItem('nobarly_user', JSON.stringify(currentUser)); } catch (_) {}
              loadCustomizePage();
            } else {
              try { localStorage.setItem('nobarly_nameplate_' + currentUser.id, v || ''); } catch (_) {}
              currentUser.nameplate = v || null;
              loadCustomizePage();
            }
          } catch (_) {}
        });
      }
    });
  });
  document.getElementById('cz-edit').addEventListener('click', () => {
    if (typeof openEditProfileModal === 'function') openEditProfileModal();
  });
  document.getElementById('cz-nameplate').addEventListener('click', () => {
    if (typeof openNameplateDialog === 'function') openNameplateDialog(cur, () => loadCustomizePage());
  });
  document.getElementById('cz-avatar').addEventListener('click', () => {
    if (typeof openAvatarDialog === 'function') openAvatarDialog(u.avatar_url, () => {
      if (typeof openEditProfileModal === 'function') openEditProfileModal();
    });
  });
}

// Deprecated: Quests/Shop/Nitro dihapus dari menu (APK gratis). Jaga cache lama.
async function loadQuestsPage() { return loadCustomizePage(); }
async function loadShopPage() { return loadCustomizePage(); }
function loadNitroPage() { return loadCustomizePage(); }

// ===== SETTINGS (gear): theme, status, server, bug, versi, logout =====
function loadSettingsPage() {
  const body = document.getElementById('content-body');
  document.getElementById('page-title').textContent = 'Settings';
  document.getElementById('header-actions').innerHTML = '';
  const ver = (typeof NOBARLY_VERSION !== 'undefined' && NOBARLY_VERSION) || window.NOBARLY_VERSION || '?';
  let server = '';
  try { server = window.NobarlyConfig ? window.NobarlyConfig.getApiBase() : ''; } catch (_) {}
  const theme = (window.NobarlyTheme ? window.NobarlyTheme.get() : 'dark');
  const st = (currentUser && currentUser.status) || 'online';
  body.innerHTML = `
    <div style="max-width:560px;">
      <div class="set-row" onclick="openProfile()">
        <i class="fas fa-user"></i><b>Profilku</b><span>›</span>
      </div>
      <div class="set-row" id="set-theme">
        <i class="fas fa-adjust"></i><b>Tampilan: ${theme === 'light' ? 'Light' : 'Dark'}</b><span>klik untuk switch ›</span>
      </div>
      <div class="set-row" id="set-status">
        <i class="fas fa-circle"></i><b>Status: ${st}</b><span>ganti ›</span>
      </div>
      <div class="set-row" id="set-customize">
        <i class="fas fa-palette"></i><b>Customize profil</b><span>nameplate • avatar • banner ›</span>
      </div>
      <div class="set-row" id="set-server">
        <i class="fas fa-server"></i><b>Server</b><span>${escapeHtml(server)}</span>
      </div>
      <div class="set-row" id="set-bug">
        <i class="fas fa-bug"></i><b>Lapor Bug</b><span>›</span>
      </div>
      <div class="set-row" id="set-about">
        <i class="fas fa-info-circle"></i><b>Tentang Nobarly</b><span>fitur • cara nobar • versi ›</span>
      </div>
      <div class="set-row">
        <i class="fas fa-tag"></i><b>Versi</b><span>Nobarly v${escapeHtml(ver)} • gratis, tanpa Nitro</span>
      </div>
      <div class="set-row" id="set-update">
        <i class="fas fa-arrow-circle-up"></i><b>Cek Update</b><span>lihat versi + changelog ›</span>
      </div>
      <div class="set-row" id="set-logout" style="border-color:#f23f43;">
        <i class="fas fa-sign-out-alt" style="color:#f23f43;"></i><b style="color:#f23f43;">Keluar</b><span></span>
      </div>
    </div>`;
  document.getElementById('set-theme').addEventListener('click', () => {
    try {
      const next = window.NobarlyTheme.toggle();
      loadSettingsPage();
    } catch (_) {}
  });
  document.getElementById('set-customize').addEventListener('click', () => {
    if (typeof loadCustomizePage === 'function') {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.toggle('active', i.dataset.page === 'customize'));
      renderPage('customize');
    }
  });
  document.getElementById('set-server').addEventListener('click', () => {
    if (typeof openServerSettings === 'function') openServerSettings();
  });
  document.getElementById('set-bug').addEventListener('click', () => {
    if (typeof openBugReportModal === 'function') openBugReportModal();
  });
  document.getElementById('set-about').addEventListener('click', () => {
    if (typeof renderPage === 'function') renderPage('about');
  });
  document.getElementById('set-update').addEventListener('click', async () => {
    try {
      if (typeof checkAppUpdate === 'function') {
        const r = await checkAppUpdate(true);
        if (!r) alert('Kamu sudah pakai versi terbaru 🎉');
      }
    } catch (_) {}
  });
  document.getElementById('set-logout').addEventListener('click', () => {
    if (confirm('Keluar dari Nobarly?')) logout();
  });
  document.getElementById('set-status').addEventListener('click', async () => {
    const order = ['online', 'idle', 'dnd', 'invisible'];
    const cur = (currentUser && currentUser.status) || 'online';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    try {
      const { error } = await db.from('profiles').update({ status: next }).eq('id', currentUser.id);
      if (error) throw new Error(error.message);
      currentUser.status = next;
      try { localStorage.setItem('nobarly_user', JSON.stringify(currentUser)); } catch (_) {}
      loadSettingsPage();
    } catch (err) {
      alert('Gagal: ' + (err.message || err));
    }
  });
}
