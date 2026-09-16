let currentUser = null;
let currentCommunity = null;
let currentChannel = null;
let currentPage = 'home';

document.addEventListener('DOMContentLoaded', async () => {
  // Di HP: pastikan server terkonfigurasi dulu (overlay kalau belum)
  if (typeof ensureServerConfigured === 'function' && !ensureServerConfigured()) return;
  // Guard: wajib login. Kalau belum, requireAuth() redirect ke login.html
  const session = await requireAuth();
  if (!session) return;
  currentUser = session.user;

  const displayName = currentUser.username || currentUser.email || 'User';
  document.getElementById('user-name').textContent = displayName;
  // nameplate lokal (sebelum migrasi backend) + theme
  try {
    if (!currentUser.nameplate) {
      const localNp = localStorage.getItem('nobarly_nameplate_' + currentUser.id);
      if (localNp) currentUser.nameplate = localNp;
    }
  } catch (_) {}
  try { if (window.NobarlyTheme) window.NobarlyTheme.apply(window.NobarlyTheme.get()); } catch (_) {}
  renderSidebarAvatar();
  renderChannelUser();
  // Klik kartu profil (bukan ikon) → floating ala Discord
  const sideCard = document.getElementById('sidebar-user');
  if (sideCard) {
    sideCard.style.cursor = 'pointer';
    sideCard.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      if (typeof openSelfCard === 'function') openSelfCard(sideCard);
    });
  }
  const chCard = document.getElementById('channel-user');
  if (chCard) {
    chCard.style.cursor = 'pointer';
    chCard.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      if (typeof openSelfCard === 'function') openSelfCard(chCard);
    });
  }

  document.getElementById('btn-logout').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Keluar dari Nobarly?')) logout();
  });
  document.getElementById('btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof openSettingsPage === 'function') openSettingsPage();
    else renderPage('settings');
  });

  const btnServer = document.getElementById('btn-server');
  if (btnServer) btnServer.addEventListener('click', () => {
    if (typeof openServerSettings === 'function') openServerSettings();
  });
  const chAv = document.getElementById('chuser-avatar');
  if (chAv) {
    chAv.title = 'Lihat profilku';
  }
  const chSet = document.getElementById('chuser-settings');
  if (chSet) chSet.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof openSettingsPage === 'function') openSettingsPage();
    else renderPage('settings');
  });
  const chOut = document.getElementById('chuser-logout');
  if (chOut) chOut.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Keluar dari Nobarly?')) logout();
  });
  const btnBug = document.getElementById('btn-bug');
  if (btnBug) btnBug.addEventListener('click', () => {
    if (typeof openBugReportModal === 'function') openBugReportModal();
    else alert('Fitur lapor bug belum dimuat.');
  });
  const chBack = document.getElementById('channel-back-btn');
  if (chBack) chBack.addEventListener('click', closeChannelSidebar);

  setupNavigation();
  setupModal();
  setupWatchModal();
  // Bersihkan sesi voice basi (mis. app ditutup paksa saat masih di voice)
  if (typeof cleanupStaleVoiceSession === 'function') cleanupStaleVoiceSession();
  if (typeof refreshServerRail === 'function') refreshServerRail();
  // Heartbeat presence: titik hijau akurat (dianggap offline kalau > 3 menit)
  sendPresenceHeartbeat();
  if (!window._presenceTimer) {
    window._presenceTimer = setInterval(sendPresenceHeartbeat, 60000);
  }
  renderPage('communities');
  updateMyCommunitiesSidebar();
  // Intro pengenalan (sekali per versi) — biar user baru & lama kenal fitur nobar
  try { if (typeof maybeShowOnboarding === 'function') maybeShowOnboarding(); } catch (_) {}
});

function setupNavigation() {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      closeChannelSidebar();
      renderPage(item.dataset.page);
    });
  });
}

function renderPage(page) {
  currentPage = page;

  // Bersih-bersih halaman sebelumnya: stop polling supaya tidak bocor interval.
  if (typeof leaveWatchPartyCleanup === 'function') leaveWatchPartyCleanup();
  if (typeof clearEsportsCountdowns === 'function') clearEsportsCountdowns();
  if (typeof stopChannelChat === 'function') stopChannelChat();
  if (typeof stopDM === 'function') stopDM();
  if (typeof stopVoiceRoomPoll === 'function') stopVoiceRoomPoll();

  const title = document.getElementById('page-title');
  const body = document.getElementById('content-body');
  const actions = document.getElementById('header-actions');

  actions.innerHTML = '';

  switch (page) {
    case 'communities':
      title.textContent = 'Komunitas Saya';
      actions.innerHTML = '<button class="btn btn-primary" id="btn-create-community"><i class="fas fa-plus"></i> Buat Komunitas</button>';
      document.getElementById('btn-create-community').addEventListener('click', openCreateModal);
      loadMyCommunities();
      break;

    case 'explore':
      title.textContent = 'Jelajahi Komunitas';
      loadAllCommunities();
      break;

    case 'nobar':
      title.textContent = 'Buat Nobar';
      loadNobarPage();
      break;

    case 'dm':
      title.textContent = 'Pesan';
      if (typeof loadDMPage === 'function') loadDMPage();
      break;

    case 'customize':
      title.textContent = 'Customize';
      if (typeof loadCustomizePage === 'function') loadCustomizePage();
      break;

    case 'settings':
      title.textContent = 'Settings';
      if (typeof loadSettingsPage === 'function') loadSettingsPage();
      break;

    case 'about':
      title.textContent = 'Tentang Nobarly';
      if (typeof loadAboutPage === 'function') loadAboutPage();
      break;

    // Deprecated (menu dihapus, APK gratis): arahkan ke Customize biar cache lama tidak blank
    case 'quests':
    case 'shop':
    case 'nitro':
      title.textContent = 'Customize';
      if (typeof loadCustomizePage === 'function') loadCustomizePage();
      break;

    case 'profile':
      if (typeof renderProfilePage === 'function') renderProfilePage();
      break;
  }
}

async function loadMyCommunities() {
  const body = document.getElementById('content-body');

  try {
    const { data: memberships } = await db
      .from('community_members')
      .select('*')
      .eq('user_id', currentUser.id);

    if (!memberships || memberships.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-users"></i>
          <h3>Belum Ada Komunitas</h3>
          <p>Buat atau bergabung dengan komunitas untuk mulai ngobrol!</p>
        </div>`;
      return;
    }

    body.innerHTML = '<div class="community-grid" id="community-grid"></div>';
    const grid = document.getElementById('community-grid');

    for (const m of memberships) {
      const { data: c } = await db.from('communities').select('*').eq('id', m.community_id).maybeSingle();
      if (!c) continue;
      grid.innerHTML += `
        <div class="community-card" data-id="${c.id}" onclick="openCommunity('${c.id}')">
          <div class="community-card-icon"><i class="fas fa-gamepad"></i></div>
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.description || 'Tidak ada deskripsi')}</p>
          <div class="community-card-meta">
            <span class="community-card-tag">${escapeHtml(c.game_category || 'Umum')}</span>
            <span><i class="fas fa-user-tag"></i> ${m.role}</span>
          </div>
        </div>`;
    }
  } catch (e) {
    console.error('loadMyCommunities error:', e);
    body.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <h3>Belum Ada Komunitas</h3>
        <p>Buat atau bergabung dengan komunitas untuk mulai ngobrol!</p>
      </div>`;
  }
}

async function loadAllCommunities() {
  const body = document.getElementById('content-body');

  try {
    const { data: communities, error } = await db
      .from('communities')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

  if (!communities || communities.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h3>Belum Ada Komunitas</h3>
        <p>Jadilah yang pertama membuat komunitas!</p>
      </div>`;
    return;
  }

  body.innerHTML = '<div class="community-grid" id="community-grid"></div>';
  const grid = document.getElementById('community-grid');

  communities.forEach(c => {
    grid.innerHTML += `
      <div class="community-card" data-id="${c.id}">
        <div class="community-card-icon"><i class="fas fa-gamepad"></i></div>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(c.description || 'Tidak ada deskripsi')}</p>
        <div class="community-card-meta">
          <span class="community-card-tag">${escapeHtml(c.game_category || 'Umum')}</span>
          <button class="btn btn-join" onclick="joinCommunity('${c.id}')">
            <i class="fas fa-plus"></i> Gabung
          </button>
        </div>
      </div>`;
    });
  } catch (e) {
    console.error('loadAllCommunities error:', e);
    body.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h3>Gagal Memuat</h3>
        <p>Tidak bisa mengambil daftar komunitas. Cek koneksi ke server lalu coba lagi.</p>
      </div>`;
  }
}

async function joinCommunity(communityId) {
  const { error } = await db.from('community_members').insert([{
    community_id: communityId,
    user_id: currentUser.id,
    role: 'member'
  }]);

  if (error && error.code !== '23505') {
    alert('Gagal gabung komunitas: ' + error.message);
    return;
  }

  updateMyCommunitiesSidebar();
  // Refresh halaman yang sedang dibuka (dulu selalu loadMyCommunities,
  // bikin halaman Jelajahi ketiban grid yang salah).
  if (currentPage === 'explore') {
    loadAllCommunities();
  } else {
    loadMyCommunities();
  }
}

async function openCommunity(communityId) {
  // Buka ulang komunitas yang sama di HP = user mau lihat/pindah channel:
  // tampilkan daftar saja, jangan auto-buka (yang akan langsung menyembunyikannya lagi).
  const reopeningSame = (currentCommunity === communityId && !!currentChannel);
  const skipAutoOpen = reopeningSame && window.NobarlyMobile && window.NobarlyMobile.isMobile();
  currentCommunity = communityId;

  // Mobile: tutup drawer dulu supaya daftar channel tidak ketutup drawer
  // (drawer z-900 di atas channel-sidebar z-850).
  if (window.NobarlyMobile) window.NobarlyMobile.closeNav();

  const { data: community } = await db
    .from('communities')
    .select('*')
    .eq('id', communityId)
    .single();

  if (!community) return;

  document.getElementById('community-title').textContent = community.name;
  document.getElementById('channel-sidebar').style.display = 'flex';
  try { document.body.classList.add('in-community'); } catch (_) {}
  if (typeof markRail === 'function') markRail(communityId);

  currentChannel = null;
  await loadChannels(communityId);

  // Cegah race tap cepat antar komunitas (A lalu B): kalau user sudah pindah,
  // jangan auto-buka channel komunitas lama.
  if (currentCommunity !== communityId) return;
  // Buka ulang di HP: daftar channel sudah tampil, biarkan user memilih.
  if (skipAutoOpen) return;
  // Jangan auto-buka kalau user sudah memilih channel sendiri saat daftar dimuat.
  if (currentChannel) return;
  const firstTextChannel = document.querySelector('.channel-item[data-type="text"]');
  if (firstTextChannel) firstTextChannel.click();
}

function closeChannelSidebar() {
  document.getElementById('channel-sidebar').style.display = 'none';
  try { document.body.classList.remove('in-community'); } catch (_) {}
  currentCommunity = null;
  currentChannel = null;
  if (typeof markRail === 'function') markRail(null);
}

async function loadChannels(communityId) {
  const { data: channels } = await db
    .from('channels')
    .select('*')
    .eq('community_id', communityId)
    .order('name');

  // Cegah daftar basi menimpa komunitas yang baru dibuka (tap cepat A -> B).
  if (currentCommunity !== communityId) return;

  // Jumlah member untuk header ala Discord ("35 Members")
  let memberCount = null;
  try {
    const m = await db.from('community_members').select('*').eq('community_id', communityId);
    if (m && m.data) memberCount = m.data.length;
  } catch (_) {}

  const titleEl = document.getElementById('community-title');
  try {
    const { data: comm } = await db.from('communities').select('*').eq('id', communityId).maybeSingle();
    if (comm && currentCommunity === communityId) {
      titleEl.innerHTML = `${escapeHtml(comm.name)}${memberCount != null ? `<small class="comm-count">${memberCount} Members</small>` : ''}`;
    }
  } catch (_) {}

  const listEl = document.querySelector('#channel-sidebar .channel-list');
  if (listEl && !document.getElementById('channel-search')) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'comm-search';
    searchWrap.innerHTML = '<input type="text" id="channel-search" placeholder="🔍 Search" maxlength="50">';
    listEl.prepend(searchWrap);
    searchWrap.querySelector('input').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#channel-sidebar .channel-item').forEach(el => {
        el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  } else if (document.getElementById('channel-search')) {
    document.getElementById('channel-search').value = '';
  }

  const textContainer = document.getElementById('text-channels');
  const voiceContainer = document.getElementById('voice-channels');

  textContainer.innerHTML = '';
  voiceContainer.innerHTML = '';

  // Bungkus tiap section dengan kepala lipat ala Discord (sekali saja)
  ['text', 'voice'].forEach(kind => {
    const box = kind === 'text' ? textContainer : voiceContainer;
    const sec = box.closest('.channel-section');
    if (sec && !sec.querySelector('.chan-sec-head')) {
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'chan-sec-head';
      const label = kind === 'text' ? 'Text Channels' : 'Voice Channels';
      head.innerHTML = `<span>${label}</span><i class="fas fa-chevron-down"></i>`;
      head.addEventListener('click', () => {
        const collapsed = sec.classList.toggle('collapsed');
        head.querySelector('i').className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
      });
      sec.prepend(head);
      const oldTitle = sec.querySelector('.channel-section-title');
      if (oldTitle) oldTitle.remove();
    }
  });

  if (!channels) return;

  channels.forEach(ch => {
    const icon = ch.type === 'text' ? 'fa-hashtag' : 'fa-volume-up';
    const target = ch.type === 'text' ? textContainer : voiceContainer;

    target.innerHTML += `
      <div class="channel-item" data-id="${ch.id}" data-type="${ch.type}" onclick="selectChannel('${ch.id}', '${ch.type}')">
        <i class="fas ${icon}"></i> ${escapeHtml(ch.name)}
      </div>`;
  });
}

async function selectChannel(channelId, type) {
  currentChannel = channelId;

  document.querySelectorAll('.channel-item').forEach(ci => ci.classList.remove('active'));
  document.querySelector(`.channel-item[data-id="${channelId}"]`)?.classList.add('active');

  if (type === 'text') {
    document.getElementById('voice-users-panel').style.display = 'none';
    if (typeof renderChannelView === 'function') {
      renderChannelView(channelId, currentCommunity);
    }
    // Mobile: daftar channel adalah overlay full; sembunyikan setelah channel
    // dipilih supaya pesan + kolom kirim langsung terlihat (tanpa ini user
    // mengira pesan tidak muncul karena masih tertutup daftar channel).
    if (window.NobarlyMobile && window.NobarlyMobile.isMobile()) {
      document.getElementById('channel-sidebar').style.display = 'none';
    }
  } else if (type === 'voice') {
    if (typeof renderVoiceRoom === 'function') {
      renderVoiceRoom(channelId, currentCommunity);
    } else if (typeof joinVoiceChannel === 'function') {
      joinVoiceChannel(channelId, currentCommunity);
    }
  }
}

// ===== HALAMAN BUAT NOBAR =====
// Fokus satu hal: bikin nobar. Pilih komunitas + voice channel tujuan,
// nobar langsung hidup di voice itu (nonton + ngobrol satu tempat).
// Tanpa voice channel: nobar tetap bisa dibuat, dibuka di tampilan player.
async function loadNobarPage() {
  const body = document.getElementById('content-body');

  let memberships = [];
  try {
    const res = await db.from('community_members').select('*').eq('user_id', currentUser.id);
    memberships = res.data || [];
  } catch (_) {}

  const myCommunities = [];
  for (const m of memberships) {
    const { data: c } = await db.from('communities').select('*').eq('id', m.community_id).maybeSingle();
    if (c) myCommunities.push(c);
  }

  const commOptions = myCommunities.length > 0
    ? myCommunities.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">(Belum ada komunitas — gabung dulu)</option>';

  body.innerHTML = `
    <div class="nobar-create-wrap">
      <div class="nobar-create-card">
        <h3><i class="fas fa-tv"></i> Nobar Baru</h3>
        <p class="nobar-create-hint">Pilih voice channel biar nobar + ngobrol jalan bareng ala Discord. Kosongkan = nobar biasa (player saja).</p>
        <div class="form-group">
          <label for="nobar-title">Judul Nobar</label>
          <input type="text" id="nobar-title" placeholder="Contoh: Nobar Final Valorant" maxlength="100">
        </div>
        <div class="form-group">
          <label for="nobar-url">URL Stream</label>
          <input type="text" id="nobar-url" placeholder="YouTube atau Twitch URL" inputmode="url">
        </div>
        <div class="form-group">
          <label for="nobar-type">Platform</label>
          <select id="nobar-type">
            <option value="youtube">YouTube</option>
            <option value="twitch">Twitch</option>
          </select>
        </div>
        <div class="form-group">
          <label for="nobar-community">Komunitas</label>
          <select id="nobar-community">${commOptions}</select>
        </div>
        <div class="form-group">
          <label for="nobar-voice">Voice Channel (opsional)</label>
          <select id="nobar-voice"><option value="">— Tanpa voice —</option></select>
        </div>
        <button class="btn btn-primary" id="btn-start-nobar"><i class="fas fa-play"></i> Mulai Nobar</button>
      </div>
      <div class="nobar-side">
        <div class="channel-section-title"><i class="fas fa-clock"></i> Segera Tayang</div>
        <div id="nobar-upcoming"><p class="no-comments">Memuat jadwal...</p></div>
      </div>
    </div>`;

  const commSel = document.getElementById('nobar-community');
  const voiceSel = document.getElementById('nobar-voice');

  const loadVoiceOptions = async () => {
    const cid = commSel.value;
    voiceSel.innerHTML = '<option value="">— Tanpa voice —</option>';
    if (!cid) return;
    const { data: channels } = await db.from('channels').select('*').eq('community_id', cid);
    (channels || []).filter(c => c.type === 'voice').forEach(c => {
      voiceSel.innerHTML += `<option value="${c.id}">🔊 ${escapeHtml(c.name)}</option>`;
    });
  };
  commSel.addEventListener('change', loadVoiceOptions);
  await loadVoiceOptions();

  document.getElementById('btn-start-nobar').addEventListener('click', () => createNobarFromPage());

  renderNobarUpcoming();
}

async function createNobarFromPage() {
  const title = document.getElementById('nobar-title').value.trim();
  const url = document.getElementById('nobar-url').value.trim();
  const type = document.getElementById('nobar-type').value;
  const communityId = document.getElementById('nobar-community').value || null;
  const voiceChannelId = document.getElementById('nobar-voice').value || null;

  if (!title || !url) { alert('Judul dan URL wajib diisi!'); return; }

  const { data, error } = await db.from('watch_parties').insert([{
    community_id: communityId,
    host_id: currentUser.id,
    title,
    stream_url: url,
    stream_type: type,
    is_live: true,
    viewer_count: 1,
    voice_channel_id: voiceChannelId
  }]);

  if (error || !data) { alert('Gagal membuat nobar: ' + (error?.message || 'unknown')); return; }

  if (voiceChannelId) {
    // Langsung masuk voice-nya: nonton + ngobrol satu tempat
    currentCommunity = communityId;
    if (typeof renderVoiceRoom === 'function') {
      renderVoiceRoom(voiceChannelId, communityId);
      return;
    }
  }
  if (typeof openWatchParty === 'function') openWatchParty(data.id);
}

function renderNobarUpcoming() {
  const box = document.getElementById('nobar-upcoming');
  if (!box || typeof ESPORTS_EVENTS === 'undefined') {
    if (box) box.innerHTML = '<p class="no-comments">Jadwal tidak tersedia.</p>';
    return;
  }
  const now = new Date();
  const upcoming = ESPORTS_EVENTS
    .filter(e => e.status === 'upcoming' && new Date(e.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);
  if (upcoming.length === 0) {
    box.innerHTML = '<p class="no-comments">Belum ada jadwal terdekat.</p>';
    return;
  }
  box.innerHTML = upcoming.map(e => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="upcoming-row">
        <div class="esports-game-icon" style="width:32px;height:32px;font-size:14px;"><i class="fas ${e.icon}"></i></div>
        <div class="upcoming-info">
          <b>${escapeHtml(e.name)}</b>
          <span>${dateStr} • ${timeStr} • ${escapeHtml(e.game)}</span>
        </div>
        <button class="btn btn-secondary" style="width:auto;padding:6px 10px;font-size:11px;" onclick="prefillNobarFromEvent('${e.id}')">+ Nobar</button>
      </div>`;
  }).join('');
}

function prefillNobarFromEvent(eventId) {
  const event = (typeof ESPORTS_EVENTS !== 'undefined' ? ESPORTS_EVENTS : []).find(e => e.id === eventId);
  if (!event) return;
  document.getElementById('nobar-title').value = event.name;
  document.getElementById('nobar-url').value = event.stream_url;
  document.getElementById('nobar-type').value = event.stream_type;
  document.getElementById('nobar-title').focus();
  document.getElementById('nobar-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function extractYoutubeId(url) {
  if (url.includes('/embed?channel=')) return null;
  if (url.includes('@') || url.includes('/channel/')) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match ? match[1] : null;
}

function getStreamEmbedUrl(url, type) {
  if (type === 'twitch') {
    const channel = url.match(/twitch\.tv\/(\w+)/);
    let parent = 'localhost';
    try { parent = window.location.hostname || 'localhost'; } catch (_) {}
    if (!parent) parent = 'localhost';
    if (channel) return `https://player.twitch.tv/?channel=${channel[1]}&parent=${encodeURIComponent(parent)}&parent=localhost`;
    return url;
  }
  if (type === 'youtube') {
    if (url.includes('/embed?channel=')) return url;
    const channelHandle = url.match(/@(\w+)/);
    if (channelHandle) return `https://www.youtube.com/embed?channel=${channelHandle[1]}`;
    const videoId = extractYoutubeId(url);
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    return url;
  }
  return url;
}

function extractTwitchChannel(url) {
  const match = url.match(/twitch\.tv\/(\w+)/);
  return match ? match[1] : url;
}

function setupModal() {
  const modal = document.getElementById('create-community-modal');
  document.getElementById('close-modal').addEventListener('click', closeCreateModal);
  document.getElementById('cancel-create').addEventListener('click', closeCreateModal);
  document.getElementById('confirm-create').addEventListener('click', createCommunity);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeCreateModal(); });
}

function openCreateModal() {
  document.getElementById('create-community-modal').classList.add('active');
}

function closeCreateModal() {
  document.getElementById('create-community-modal').classList.remove('active');
  document.getElementById('community-name').value = '';
  document.getElementById('community-desc').value = '';
  document.getElementById('community-game').value = '';
}

async function createCommunity() {
  const name = document.getElementById('community-name').value.trim();
  const description = document.getElementById('community-desc').value.trim();
  const gameCategory = document.getElementById('community-game').value.trim();

  if (!name) { alert('Nama komunitas wajib diisi!'); return; }

  const communityId = generateId();

  const { error } = await db.from('communities').insert([{
    id: communityId,
    name,
    description,
    game_category: gameCategory,
    owner_id: currentUser.id
  }]);

  if (error) { alert('Gagal membuat komunitas: ' + error.message); return; }

  await db.from('community_members').insert([{
    community_id: communityId, user_id: currentUser.id, role: 'owner'
  }]);

  await db.from('channels').insert([
    { community_id: communityId, name: 'general', type: 'text' },
    { community_id: communityId, name: 'discussion', type: 'text' },
    { community_id: communityId, name: 'General Voice', type: 'voice' }
  ]);

  closeCreateModal();
  updateMyCommunitiesSidebar();
  loadMyCommunities();
}


function setupWatchModal() {
  const modal = document.getElementById('create-watch-modal');
  document.getElementById('close-watch-modal').addEventListener('click', closeWatchModal);
  document.getElementById('cancel-watch').addEventListener('click', closeWatchModal);
  document.getElementById('confirm-watch').addEventListener('click', createWatchParty);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeWatchModal(); });
}

function closeWatchModal() {
  document.getElementById('create-watch-modal').classList.remove('active');
  document.getElementById('watch-title').value = '';
  document.getElementById('watch-url').value = '';
}

async function createWatchParty() {
  const title = document.getElementById('watch-title').value.trim();
  const url = document.getElementById('watch-url').value.trim();
  const type = document.getElementById('watch-type').value;

  if (!title || !url) { alert('Judul dan URL wajib diisi!'); return; }

  if (!currentCommunity) { alert('Pilih komunitas terlebih dahulu!'); return; }

  const { error } = await db.from('watch_parties').insert([{
    community_id: currentCommunity,
    host_id: currentUser.id,
    title,
    stream_url: url,
    stream_type: type,
    is_live: true,
    viewer_count: 1
  }]);

  if (error) { alert('Gagal membuat nobar: ' + error.message); return; }

  closeWatchModal();
  loadNobarPage();
}

function updateMyCommunitiesSidebar() {
  const container = document.getElementById('my-communities');
  if (typeof refreshServerRail === 'function') refreshServerRail();
  db.from('community_members').select('*').eq('user_id', currentUser.id).then(({ data: memberships }) => {
    if (!memberships || memberships.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding: 20px 0;"><p style="font-size: 13px;">Belum ada komunitas</p></div>';
      return;
    }

    let html = '';
    const loadCommunities = async () => {
      for (const m of memberships) {
        const { data: c } = await db.from('communities').select('*').eq('id', m.community_id).maybeSingle();
        if (c) {
          html += `<div class="sidebar-item" onclick="openCommunity('${c.id}')" style="font-size: 13px;">
            <i class="fas fa-gamepad"></i> ${escapeHtml(c.name)}
          </div>`;
        }
      }
      container.innerHTML = html;
    };
    loadCommunities();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Heartbeat presence (v2.0): tandai last_seen supaya teman lihat titik hijau.
// Best-effort: gagal (offline) ya sudah, interval berikutnya coba lagi.
async function sendPresenceHeartbeat() {
  try {
    if (!currentUser || !currentUser.id) return;
    await apiFetch(`/profiles/${currentUser.id}/seen`, { method: 'PUT', body: '{}' });
  } catch (_) {}
}

// Panel user mini di bawah kolom channel (render + segarkan tiap avatar berubah)
function renderChannelUser() {
  const av = document.getElementById('chuser-avatar');
  const nm = document.getElementById('chuser-name');
  if (!av || !nm || !currentUser) return;
  const name = currentUser.username || currentUser.email || 'User';
  nm.textContent = name;
  const stEl = document.querySelector('#channel-user .user-status');
  if (stEl) stEl.textContent = statusLabel ? statusLabel(currentUser) : (currentUser.status || 'Online');
  av.classList.toggle('has-photo', !!currentUser.avatar_url);
  av.innerHTML = '';
  if (currentUser.avatar_url) {
    const init = document.createElement('span');
    init.className = 'av-initial';
    init.textContent = name.charAt(0).toUpperCase();
    const img = document.createElement('img');
    img.src = imageSrc(currentUser.avatar_url);
    img.alt = '';
    img.onerror = () => { av.classList.remove('has-photo'); av.textContent = name.charAt(0).toUpperCase(); };
    av.appendChild(init);
    av.appendChild(img);
  } else {
    av.textContent = name.charAt(0).toUpperCase();
  }
}

// ===== FOTO PROFIL (GIF ikut animasi via <img>) =====
function renderSidebarAvatar() {
  const el = document.getElementById('user-avatar');
  if (!el || !currentUser) return;
  const name = currentUser.username || currentUser.email || 'User';
  const nm = document.getElementById('user-name');
  if (nm) nm.textContent = name;
  const stEl = document.querySelector('#sidebar-user .user-status');
  if (stEl) {
    try { stEl.textContent = statusLabel(currentUser); }
    catch (_) { stEl.textContent = currentUser.status || 'Online'; }
  }
  el.classList.toggle('has-photo', !!currentUser.avatar_url);
  el.innerHTML = '';
  if (currentUser.avatar_url) {
    const img = document.createElement('img');
    img.src = imageSrc(currentUser.avatar_url);
    img.alt = '';
    img.onerror = () => { el.classList.remove('has-photo'); el.textContent = name.charAt(0).toUpperCase(); };
    const init = document.createElement('span');
    init.className = 'av-initial';
    init.textContent = name.charAt(0).toUpperCase();
    el.appendChild(init);
    el.appendChild(img);
  } else {
    el.textContent = name.charAt(0).toUpperCase();
  }
}

function openProfileModal() {
  if (!currentUser) return;
  let overlay = document.getElementById('profile-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'profile-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>👤 Profilku</h3>
          <button class="modal-close" id="profile-close">&times;</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <div class="auth-error" id="profile-error"></div>
          <img id="profile-preview" class="profile-preview" alt="Foto profil">
          <div class="form-group" style="text-align:left;margin-top:12px;">
            <label for="profile-file">Foto baru (JPG/PNG/GIF/WebP, maks 5MB)</label>
            <input type="file" id="profile-file" accept="image/jpeg,image/png,image/gif,image/webp">
          </div>
          <p style="font-size:12px;color:#888;" id="profile-name"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="profile-cancel">Batal</button>
          <button class="btn btn-primary" id="profile-save" style="width:auto;"><span class="btn-label">Simpan Foto</span></button>
        </div>
        <div class="modal-footer" style="border-top:1px solid #222;">
          <button class="btn btn-secondary" id="profile-bug" style="width:auto;">🐞 Lapor Bug</button>
          <button class="btn btn-secondary" id="profile-logout" style="width:auto;color:#ff8888;">Keluar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.classList.add('active');
  }
  const errBox = document.getElementById('profile-error');
  const showErr = (m) => {
    if (!m) { errBox.classList.remove('show'); errBox.textContent = ''; return; }
    errBox.textContent = m;
    errBox.classList.add('show');
  };
  showErr(null);
  const prev = document.getElementById('profile-preview');
  const fileInp = document.getElementById('profile-file');
  const name = currentUser.username || currentUser.email || 'User';
  document.getElementById('profile-name').textContent = name + ' • ' + (currentUser.email || '');
  prev.src = currentUser.avatar_url ? imageSrc(currentUser.avatar_url) : '';
  prev.style.display = currentUser.avatar_url ? 'block' : 'none';
  prev.onerror = () => { prev.style.display = 'none'; };
  fileInp.value = '';
  fileInp.onchange = () => {
    const f = fileInp.files[0];
    if (!f) return;
    prev.src = URL.createObjectURL(f);
    prev.style.display = 'block';
  };
  document.getElementById('profile-close').onclick = () => overlay.classList.remove('active');
  document.getElementById('profile-cancel').onclick = () => overlay.classList.remove('active');
  document.getElementById('profile-bug').onclick = () => {
    overlay.classList.remove('active');
    if (typeof openBugReportModal === 'function') openBugReportModal();
  };
  document.getElementById('profile-logout').onclick = () => {
    if (confirm('Keluar dari Nobarly?')) logout();
  };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
  document.getElementById('profile-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const f = fileInp.files[0];
    if (!f) { showErr('Pilih foto dulu.'); return; }
    btn.disabled = true;
    showErr(null);
    try {
      const url = await uploadImage(f);
      const { data, error } = await db.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
      if (error) throw new Error(error.message);
      currentUser.avatar_url = (data && data.avatar_url) || url;
      localStorage.setItem('nobarly_user', JSON.stringify(currentUser));
      // Segarkan tampilan tanpa reload
      renderSidebarAvatar();
      renderChannelUser();
  if (typeof refreshServerRail === 'function') refreshServerRail();
  if (typeof refreshMiniProfile === 'function') refreshMiniProfile();
      if (typeof currentPage !== 'undefined' && currentPage === 'dm' && typeof refreshFriendList === 'function') {
        refreshFriendList();
      }
      overlay.classList.remove('active');
    } catch (err) {
      showErr(err.message || 'Gagal menyimpan foto.');
    } finally {
      btn.disabled = false;
    }
  };
}
