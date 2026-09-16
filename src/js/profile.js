// Halaman profil ala Discord: banner, avatar + frame, status, orbs,
// In Voice, bio, connections, + edit profil (own).
// Dibuka via openProfile(userId?) dari mana saja.

var BANNERS = [
  { id: '', label: 'Default' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'neon', label: 'Neon' },
];
var FRAMES = [
  { id: '', label: 'Tanpa' },
  { id: 'white', label: 'Putih' },
  { id: 'gold', label: 'Emas' },
  { id: 'red', label: 'Merah' },
  { id: 'blue', label: 'Biru' },
];
var STATUSES = [
  { id: 'online', label: 'Online' },
  { id: 'idle', label: 'Idle' },
  { id: 'dnd', label: 'Do Not Disturb' },
  { id: 'invisible', label: 'Invisible' },
];
var CONN_KEYS = [
  { id: 'roblox', label: 'Roblox' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'xbox', label: 'Xbox' },
];

function openProfile(userId) {
  window._profileId = userId || (currentUser && currentUser.id) || null;
  if (!window._profileId) return;
  if (window.NobarlyMobile) window.NobarlyMobile.closeNav();
  if (typeof closeChannelSidebar === 'function') closeChannelSidebar();
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  renderPage('profile');
}

function parseConns(u) {
  try {
    if (!u) return {};
    if (typeof u === 'object') return u;
    return JSON.parse(u) || {};
  } catch (_) {
    return {};
  }
}

function statusLabel(p) {
  const st = presenceOf(p.status, p.last_seen);
  if (st === 'off') return 'Offline';
  if (st === 'idle') return 'Idle';
  if (st === 'dnd') return 'Do Not Disturb';
  return 'Online';
}

async function renderProfilePage() {
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');
  const uid = window._profileId || (currentUser && currentUser.id);
  if (!uid) return;
  title.textContent = 'Profil';
  actions.innerHTML = '';
  body.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

  let p = null;
  try {
    if (uid === currentUser.id) {
      // Segarkan data sendiri (orbs / status terbaru)
      const s = await requireAuth();
      if (s) { currentUser = s.user; }
      p = currentUser;
    } else {
      const res = await db.from('profiles').select('*').eq('id', uid).maybeSingle();
      p = res.data;
    }
  } catch (_) {}
  if (!p) {
    body.innerHTML = '<div class="empty-state"><h3>Profil tidak ketemu</h3></div>';
    return;
  }
  const isMe = currentUser && p.id === currentUser.id;
  const conns = parseConns(p.connections);
  const bannerCls = p.banner ? 'banner-' + p.banner : 'banner-default';
  const st = presenceOf(p.status, p.last_seen);
  const frameCls = p.avatar_frame ? ' avframe-' + p.avatar_frame : '';
  // nameplate lokal fallback (sebelum migrasi 012 jalan di server)
  try {
    if (!p.nameplate && p.id) {
      const ln = localStorage.getItem('nobarly_nameplate_' + p.id);
      if (ln) p.nameplate = ln;
    }
  } catch (_) {}

  const connChips = CONN_KEYS.filter(k => conns[k.id]).map(k =>
    `<span class="conn-chip conn-${k.id}">${k.label}: ${escapeHtml(conns[k.id])}</span>`
  ).join('') || '<p class="no-comments">Belum ada koneksi.</p>';

  let inVoice = '';
  if (isMe && typeof currentVoiceChannel !== 'undefined' && currentVoiceChannel) {
    inVoice = `
      <div class="pf-section">
        <div class="pf-section-title">IN VOICE</div>
        <div class="pf-invoice">🔊 Sedang di voice channel — <a href="#" onclick="resumeVoice();return false;" style="color:#fff;">kembali</a></div>
      </div>`;
  }

  body.innerHTML = `
    <div style="max-width:560px;">
      ${bannerHtml(p.banner)}
      <div class="pf-card">
        <div class="pf-avatarrow">
          ${avatarHtml(p.username, p.avatar_url, 'dmsg-avatar pf-avatar' + frameCls, true, st)}
          ${p.nameplate ? `<div class="pf-nameplate" style="${window.nameplateStyle ? window.nameplateStyle(p.nameplate) : ''}">${escapeHtml(p.username)}</div>` : ''}
          ${isMe ? `<div class="pf-orbs">GRATIS</div>` : ''}
        </div>
        <div class="pf-body">
          <h2>${escapeHtml(p.username)}</h2>
          <div class="pf-status">${statusLabel(p)}</div>
          ${inVoice}
          <div class="pf-section">
            <div class="pf-section-title">BIO</div>
            <div class="pf-bio">${escapeHtml(p.bio || 'Belum ada bio.')}</div>
          </div>
          <div class="pf-section">
            <div class="pf-section-title">CONNECTIONS</div>
            <div class="conn-chips">${connChips}</div>
          </div>
          <div class="pf-section" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${isMe
              ? `<button class="btn btn-primary" style="width:auto;" onclick="renderProfileEdit()">🎨 Customize</button>`
              : `<button class="btn btn-primary" style="width:auto;" onclick="openDM('${p.id}', '${jsq(p.username)}', '${jsq(p.avatar_url || '')}', '${jsq(p.last_seen || '')}', '${jsq(p.status || 'online')}')">💬 Kirim Pesan</button>
                 <button class="btn btn-secondary" style="width:auto;" onclick="sendFriendRequest('${p.id}')">+ Teman</button>`}
          </div>
        </div>
      </div>
    </div>`;
}

function resumeVoice() {
  try {
    if (window._resumeVoice) {
      renderVoiceRoom(window._resumeVoice.channel, window._resumeVoice.community);
    } else if (typeof currentVoiceChannel !== 'undefined' && currentVoiceChannel) {
      renderVoiceRoom(currentVoiceChannel, currentVoiceCommunity);
    }
  } catch (_) {}
}

async function renderProfileEdit() {
  // Alur baru: tidak ada halaman Edit Profil terpisah — semua via modal Customize
  // (sama isi dengan halaman Customize). Jaga kompatibilitas tombol lama.
  if (typeof openCustomizeModal === 'function') {
    openCustomizeModal();
    return;
  }
  if (typeof openEditProfileModal === 'function') {
    openEditProfileModal();
    return;
  }
  const body = document.getElementById('content-body');
  const p = currentUser;
  if (!p || !body) return;
  document.getElementById('page-title').textContent = 'Edit Profil';
  const conns = parseConns(p.connections);
  body.innerHTML = `
    <div class="pf-form" style="max-width:560px;">
      <div class="auth-error" id="pfedit-error"></div>
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="pf-username" value="${escapeHtml(p.username)}" maxlength="50">
      </div>
      <div class="form-group">
        <label>Bio (maks 280)</label>
        <textarea id="pf-bio" rows="3" maxlength="280" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:10px;font-family:inherit;font-size:13px;">${escapeHtml(p.bio || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="pf-status">
          ${STATUSES.map(s => `<option value="${s.id}" ${p.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Avatar Decoration (gratis — segera hadir, border skip dulu)</label>
        <div class="pickrow" id="pf-frames">
          ${FRAMES.map(f => `<button class="pick ${(!p.avatar_frame && !f.id) || p.avatar_frame === f.id ? 'sel' : ''}" data-v="${f.id}">${f.label}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Profile Effect (banner — gratis)</label>
        <div class="pickrow" id="pf-banners">
          ${BANNERS.map(b => `<button class="pick ${(!p.banner && !b.id) || p.banner === b.id ? 'sel' : ''}" data-v="${b.id}"><span class="pick-swatch profile-banner banner-${b.id || 'default'}" style="height:22px;"></span>${b.label}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Banner foto sendiri (gantikan gradien)</label>
        <input type="file" id="pf-banner-photo" accept="image/jpeg,image/png,image/gif,image/webp">
        <p class="auth-hint" id="pf-banner-current" style="text-align:left;margin-top:4px;"></p>
      </div>
      <div class="form-group">
        <label>Connections</label>
        ${CONN_KEYS.map(k => `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
            <span style="width:70px;font-size:12px;color:#888;">${k.label}</span>
            <input type="text" id="pf-conn-${k.id}" value="${escapeHtml(conns[k.id] || '')}" maxlength="50" placeholder="username ${k.label}">
          </div>`).join('')}
      </div>
      <div class="form-group">
        <label>Foto profil</label>
        <input type="file" id="pf-photo" accept="image/jpeg,image/png,image/gif,image/webp">
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="pf-save" style="width:auto;">Simpan</button>
        <button class="btn btn-secondary" onclick="renderProfilePage()" style="width:auto;">Batal</button>
      </div>
    </div>`;

  const curBannerHint = document.getElementById('pf-banner-current');
  if (curBannerHint) {
    curBannerHint.textContent = (p.banner && (/^\//.test(p.banner) || /^https?:\/\//i.test(p.banner)))
      ? 'Saat ini: foto sendiri (pilih file baru untuk ganti, atau pilih gradien di atas).'
      : 'Saat ini: ' + (BANNERS.find(b => b.id === (p.banner || '')) || {}).label || 'Default';
  }
    document.querySelectorAll('#pf-frames .pick, #pf-banners .pick').forEach(b => {
    b.addEventListener('click', () => {
      b.parentElement.querySelectorAll('.pick').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    });
  });
  document.getElementById('pf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const errBox = document.getElementById('pfedit-error');
    const showErr = (m) => {
      if (!m) { errBox.classList.remove('show'); errBox.textContent = ''; return; }
      errBox.textContent = m;
      errBox.classList.add('show');
    };
    showErr(null);
    btn.disabled = true;
    try {
      const username = document.getElementById('pf-username').value.trim();
      const bio = document.getElementById('pf-bio').value.trim();
      const status = document.getElementById('pf-status').value;
      const frame = document.querySelector('#pf-frames .pick.sel')?.dataset.v || null;
      const bannerPick = document.querySelector('#pf-banners .pick.sel')?.dataset.v || null;
      // Foto banner sendiri mengalahkan pilihan gradien
      let banner = bannerPick;
      const bannerPhoto = document.getElementById('pf-banner-photo').files[0];
      if (bannerPhoto) {
        banner = await uploadImage(bannerPhoto);
      }
      const connections = {};
      CONN_KEYS.forEach(k => {
        const v = document.getElementById('pf-conn-' + k.id).value.trim();
        if (v) connections[k.id] = v;
      });
      const payload = { username, bio, status, avatar_frame: frame, banner, connections };
      const photo = document.getElementById('pf-photo').files[0];
      if (photo) {
        payload.avatar_url = await uploadImage(photo);
      }
      const { data, error } = await db.from('profiles').update(payload).eq('id', currentUser.id);
      if (error) throw new Error(error.message);
      // Refresh sesi (hilangkan password_hash kalau ikut)
      if (data) {
        const { password_hash, ...safe } = data;
        currentUser = { ...currentUser, ...safe };
        localStorage.setItem('nobarly_user', JSON.stringify(currentUser));
      }
      if (typeof renderSidebarAvatar === 'function') renderSidebarAvatar();
      if (typeof renderChannelUser === 'function') renderChannelUser();
      if (typeof refreshMiniProfile === 'function') refreshMiniProfile();
      renderProfilePage();
    } catch (err) {
      showErr(err.message || 'Gagal menyimpan.');
    } finally {
      btn.disabled = false;
    }
  });
}
