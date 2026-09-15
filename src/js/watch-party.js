let currentWatchParty = null;
let watchChatInterval = null;
let lastReactionSeenAt = null;
// Animasi pesan baru saja (anti-flicker)
var lastWatchChatId = null;
var lastWatchChatParty = null;

// --- Sinkronisasi playback nobar (PR streamer) ---
var ytApiLoading = null;   // single-flight load YouTube IFrame API
var ytPlayer = null;       // YT.Player aktif (hanya party YouTube VOD)
var ytVideoId = null;      // video id yang sedang dimuat player
var syncFollow = true;     // toggle penonton: ikuti host atau nonton bebas
var clockOffsetMs = 0;     // serverNow - clientNow (koreksi beda jam antar device)
var lastPbSentAt = 0;      // throttle heartbeat host
var lastPbSentKey = '';    // aksi@detik terakhir yang dikirim
var iControlPlayback = false; // apakah saya pengendali (host/co-host)
var ytSyncDisabled = false; // true di aplikasi desktop (Electron file://)

const PARTY_EMOJIS = ['😂', '❤️', '🔥', '😮', '👏', '😭', '🎉'];
const SYNC_THRESHOLD = 3; // toleransi selisih detik sebelum dikoreksi

// Aplikasi desktop (Electron) jalan via file:// — YouTube IFrame API menolak
// origin null dengan "Error 153", padahal video yang sama jalan di HP
// (http://localhost). Solusi: di file:// pakai iframe embed biasa
// (tanpa API), sync playback nonaktif tapi video tetap muter.
function isFileProtocol() {
  try { return window.location.protocol === 'file:'; } catch (_) { return false; }
}

function openWatchModal() {
  if (!currentCommunity) {
    alert('Pilih komunitas terlebih dahulu!');
    return;
  }
  document.getElementById('create-watch-modal').classList.add('active');
}

async function openWatchParty(partyId) {
  const { data: party } = await db.from('watch_parties').select('*').eq('id', partyId).single();
  if (!party) return;

  // Bereskan party lama dulu (stop polling, viewer -1, hancurkan player),
  // baru adopsi party baru. Mencegah interval ganda & viewer bocor.
  await leaveWatchPartyCleanup();
  currentWatchParty = partyId;

  await db.from('watch_parties').update({
    viewer_count: (party.viewer_count || 0) + 1
  }).eq('id', partyId);

  const body = document.getElementById('content-body');
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');

  title.textContent = party.title;
  actions.innerHTML = `
    <button class="btn btn-primary" id="btn-party-voice" style="width:auto;"><i class="fas fa-headset"></i> Gabung + Suara</button>
    <button class="btn btn-secondary" onclick="closeWatchParty()"><i class="fas fa-arrow-left"></i> Kembali</button>`;
  document.getElementById('btn-party-voice').addEventListener('click', () => joinPartyVoice(party));

  const embedUrl = getStreamEmbedUrl(party.stream_url, party.stream_type);
  const ytId = party.stream_type === 'youtube' ? extractYoutubeId(party.stream_url) : null;
  const syncMode = ytId ? 'vod' : 'live';
  // Desktop (file://): paksa iframe biasa, API player pasti ditolak YouTube (Error 153)
  const apiPlayer = ytId && !isFileProtocol();

  body.innerHTML = `
    <div class="watch-player-layout">
      <div class="watch-player-main">
        <div class="watch-player-embed" id="watch-player-embed">
          ${apiPlayer ? '<div id="yt-player"></div>' : `<iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe>`}
          <div id="reaction-float-layer"></div>
        </div>
        <div class="watch-player-info">
          <h2>${escapeHtml(party.title)}</h2>
          <p><i class="fas fa-users"></i> <span id="viewer-count-${partyId}">${party.viewer_count || 0}</span> menonton</p>
          <div class="sync-row" id="sync-row">
            <span id="sync-status"><i class="fas fa-link"></i> Menghubungkan sync...</span>
            <label class="sync-toggle" id="sync-toggle-wrap" style="display:none;">
              <input type="checkbox" id="follow-toggle" checked> Ikuti Host
            </label>
          </div>
          <div class="cohost-box">
            <div class="channel-section-title"><i class="fas fa-headset"></i> Pengendali Putar</div>
            <div id="cohost-list"><p class="no-comments">Memuat...</p></div>
            <div class="cohost-add" id="cohost-add" style="display:none;">
              <input type="text" id="cohost-input" placeholder="Username co-host..." maxlength="50">
              <button class="btn btn-secondary" id="btn-add-cohost" style="width:auto;padding:6px 12px;font-size:12px;">+ Co-host</button>
            </div>
          </div>
          <div class="party-reaction-bar" id="party-reaction-bar">
            ${PARTY_EMOJIS.map(e => `<button class="reaction-chip" onclick="sendWatchReaction('${partyId}', '${e}')">${e}</button>`).join('')}
            <span id="reaction-counts" class="reaction-counts"></span>
          </div>
        </div>
        <div class="party-moments">
          <div class="party-moments-head">
            <h3><i class="fas fa-bookmark"></i> Momen</h3>
            <button class="btn btn-secondary" id="btn-add-moment" style="width:auto;padding:6px 12px;font-size:12px;"><i class="fas fa-plus"></i> Tandai Momen</button>
          </div>
          <div id="moments-list"><p class="no-comments">Belum ada momen. Tandai highlight biar gampang diulang!</p></div>
        </div>
        <div class="party-moments">
          <div class="party-moments-head">
            <h3><i class="fas fa-list"></i> Antrean Putar</h3>
          </div>
          <div id="queue-list"><p class="no-comments">Memuat antrean...</p></div>
          <div class="cohost-add" style="margin-top:8px;">
            <input type="text" id="queue-title" placeholder="Judul video..." maxlength="200">
            <input type="text" id="queue-url" placeholder="YouTube / Twitch URL..." inputmode="url">
            <select id="queue-type">
              <option value="youtube">YouTube</option>
              <option value="twitch">Twitch</option>
            </select>
            <button class="btn btn-secondary" id="btn-add-queue" style="width:auto;padding:6px 12px;font-size:12px;">+ Tambah</button>
          </div>
        </div>
      </div>
      <div class="watch-chat-panel">
        <div class="watch-chat-header">
          <h3><i class="fas fa-comments"></i> Live Chat</h3>
          <span class="watch-chat-count" id="chat-count-${partyId}">0 pesan</span>
        </div>
        <div class="watch-chat-messages" id="watch-chat-messages"></div>
        <div class="watch-chat-input-area">
          <label class="chat-image-btn" id="watch-chat-image-label" title="Kirim gambar">
            <i class="fas fa-image"></i>
            <input type="file" id="watch-chat-image" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;" onchange="onWatchChatImagePicked()">
          </label>
          <input type="text" id="watch-chat-input" placeholder="Ketik pesan..." onkeydown="if(event.key==='Enter')sendWatchChat('${partyId}')">
          <button class="btn btn-primary" onclick="sendWatchChat('${partyId}')"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`;

  loadWatchChat(partyId);
  loadWatchReactions(partyId, true);
  loadWatchMoments(partyId);
  loadWatchQueue(partyId);
  loadPartyHosts(partyId);
  document.getElementById('btn-add-moment').addEventListener('click', () => addWatchMoment(partyId));
  document.getElementById('btn-add-queue').addEventListener('click', () => addQueueItem(partyId));
  document.getElementById('btn-add-cohost').addEventListener('click', () => addCohost(partyId));
  const followToggle = document.getElementById('follow-toggle');
  if (followToggle) followToggle.addEventListener('change', (e) => { syncFollow = e.target.checked; });

  // Kalibrasi beda jam device vs server (sekali saat masuk, lalu dihaluskan tiap tick)
  try {
    const { data: t } = await apiFetch('/time');
    if (t && t.now) clockOffsetMs = t.now - Date.now();
  } catch (_) { clockOffsetMs = 0; }

  // Siapkan player YouTube API (VOD bisa di-sync; live/Twitch = otomatis)
  initSyncPlayer(party, ytId);

  if (watchChatInterval) clearInterval(watchChatInterval);
  watchChatInterval = setInterval(() => {
    if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return;
    loadWatchChat(partyId);
    loadWatchReactions(partyId, false);
    syncPlaybackTick(partyId);
  }, 3000);
}

// ---------- Sinkronisasi playback ----------

function loadYouTubeApi() {
  if (typeof YT !== 'undefined' && YT.Player) return Promise.resolve();
  if (ytApiLoading) return ytApiLoading;
  ytApiLoading = new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = finish;
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') { try { prev(); } catch (_) {} } finish(); };
    setTimeout(finish, 8000); // fallback: jangan gantung selamanya kalau offline
  });
  return ytApiLoading;
}

async function initSyncPlayer(party, videoId) {
  destroySyncPlayer();
  if (!videoId) return; // live / twitch: sync otomatis, tidak perlu API
  if (isFileProtocol()) {
    // Desktop: video jalan via iframe biasa, sync ikut-host tidak tersedia
    ytSyncDisabled = true;
    setSyncStatus('<i class="fas fa-desktop"></i> Mode desktop — video manual, chat + voice tetap jalan');
    return;
  }
  ytVideoId = videoId;
  try {
    await loadYouTubeApi();
  } catch (_) { /* offline: player placeholder, sync nonaktif */ }
  if (!document.getElementById('yt-player') || typeof YT === 'undefined' || !YT.Player) return;
  // origin wajib dikirim saat halaman http(s) — tanpa ini YouTube sering
  // menolak player API dengan "Error 153". Di file:// (Electron) tidak diisi.
  const playerVars = { rel: 0, modestbranding: 1, enablejsapi: 1, playsinline: 1 };
  try {
    if (/^https?:$/.test(window.location.protocol)) playerVars.origin = window.location.origin;
  } catch (_) {}
  try {
    ytPlayer = new YT.Player('yt-player', {
      videoId,
      playerVars,
      events: {
        onReady: () => {
          // Langsung kejar posisi host saat masuk (late join)
          syncPlaybackTick(party.id);
        },
        onStateChange: (e) => {
          if (!iControlPlayback || !currentWatchParty) return;
          const PLAYING = YT.PlayerState.PLAYING;
          const PAUSED = YT.PlayerState.PAUSED;
          const ENDED = YT.PlayerState.ENDED;
          if (e.data === PLAYING) sendPlaybackState('play');
          else if (e.data === PAUSED) sendPlaybackState('pause');
          else if (e.data === ENDED) autoAdvanceQueue(party.id);
        },
        // Error 101/150/153 = video melarang embed / konfigurasi ditolak.
        // Jangan layar hitam: tampilkan pesan + tombol tonton langsung.
        onError: (e) => handleYtError(e && e.data, party),
      }
    });
  } catch (_) { ytPlayer = null; }
}

// Pesan ramah saat YouTube menolak embed (bukan crash / layar hitam).
function handleYtError(code, party) {
  const mount = document.getElementById('watch-player-embed') || document.getElementById('voice-player-embed');
  if (!mount || mount.querySelector('.yt-blocked')) return;
  const watchUrl = party && party.stream_url ? party.stream_url : 'https://www.youtube.com';
  const box = document.createElement('div');
  box.className = 'yt-blocked';
  box.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:#111;color:#fff;padding:20px;text-align:center;z-index:5;';
  box.innerHTML = `
    <div style="font-size:15px;font-weight:800;">⚠️ Video ini tidak mengizinkan diputar di dalam Nobarly (Error ${code || '153'})</div>
    <div style="font-size:13px;color:#b0b0b0;max-width:420px;">Pemilik video mematikan fitur embed, atau YouTube menolak konfigurasi player. Chat + voice tetap jalan — tonton videonya langsung, lalu balik ke sini buat ngobrol.</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" id="yt-open-ext" style="width:auto;">▶ Tonton di YouTube</button>
      <button class="btn btn-secondary" id="yt-dismiss" style="width:auto;">Tutup</button>
    </div>`;
  mount.style.position = 'relative';
  mount.appendChild(box);
  document.getElementById('yt-open-ext').onclick = () => {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        window.open(watchUrl, '_system');
      } else {
        window.open(watchUrl, '_blank', 'noopener');
      }
    } catch (_) { window.location.href = watchUrl; }
  };
  document.getElementById('yt-dismiss').onclick = () => box.remove();
  try { setSyncStatus('<i class="fas fa-exclamation-triangle"></i> Video diblokir embed oleh pemiliknya'); } catch (_) {}
}

function destroySyncPlayer() {
  if (ytPlayer && typeof ytPlayer.destroy === 'function') {
    try { ytPlayer.destroy(); } catch (_) {}
  }
  ytPlayer = null;
  ytVideoId = null;
  ytSyncDisabled = false;
  iControlPlayback = false;
  syncFollow = true;
  lastPbSentAt = 0;
  lastPbSentKey = '';
}

// Kirim state saya (host/co-host) ke server. Throttle: pause dikirim sekali,
// play di-heartbeat tiap 5 detik supaya penonton yang baru masuk langsung sinkron.
async function sendPlaybackState(action) {
  if (!ytPlayer || !currentWatchParty || !iControlPlayback) return;
  const now = Date.now();
  let t = 0;
  try { t = ytPlayer.getCurrentTime() || 0; } catch (_) {}
  const key = action + '@' + Math.round(t);
  if (key === lastPbSentKey && (action === 'pause' || now - lastPbSentAt < 5000)) return;
  lastPbSentKey = key;
  lastPbSentAt = now;
  try {
    await apiFetch(`/watch-parties/${currentWatchParty}/playback`, {
      method: 'PUT',
      body: JSON.stringify({ user_id: currentUser.id, action, time: t, video: ytVideoId })
    });
  } catch (_) { /* sync best-effort, chat tidak boleh terganggu */ }
}

// Pure: hitung aksi follow dari state remote. Bisa di-unit-test.
function computeFollowAction(local, remote, nowMs, threshold) {
  const t = threshold == null ? SYNC_THRESHOLD : threshold;
  if (!remote || remote.updated_at == null) return {};
  let expected = Number(remote.time) || 0;
  if (remote.action === 'play') {
    expected += Math.max(0, (nowMs - remote.updated_at) / 1000);
  }
  const out = { expected };
  if (Math.abs((Number(local.time) || 0) - expected) > t) out.seekTo = Math.max(0, expected);
  if (remote.action === 'pause' && local.playing) out.pause = true;
  if (remote.action === 'play' && !local.playing) out.play = true;
  return out;
}

function setSyncStatus(html) {
  const elStatus = document.getElementById('sync-status');
  if (elStatus) elStatus.innerHTML = html;
}

// Tick tiap 3 detik (bareng polling chat): host kirim heartbeat, penonton ngikutin.
async function syncPlaybackTick(partyId) {
  if (currentWatchParty !== partyId) return;
  if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') {
    if (typeof ytSyncDisabled !== 'undefined' && ytSyncDisabled) {
      setSyncStatus('<i class="fas fa-desktop"></i> Mode desktop — video manual, chat + voice tetap jalan');
    } else {
      setSyncStatus('<i class="fas fa-satellite-dish"></i> Mode live — sinkron otomatis');
    }
    return;
  }
  let remote;
  try {
    const res = await apiFetch(`/watch-parties/${partyId}/playback`);
    remote = res.data;
  } catch (_) { return; }
  if (!remote) return;

  // Haluskan offset jam dari timestamp server
  if (remote.server_now) {
    const sample = remote.server_now - Date.now();
    clockOffsetMs = clockOffsetMs * 0.7 + sample * 0.3;
  }

  iControlPlayback = !!(currentUser && (remote.host_id === currentUser.id || (remote.cohosts || []).includes(currentUser.id)));
  updateSyncUi(iControlPlayback);

  let localTime = 0;
  let localPlaying = false;
  try {
    localTime = ytPlayer.getCurrentTime() || 0;
    const PLAYING = (typeof YT !== 'undefined' && YT.PlayerState) ? YT.PlayerState.PLAYING : 1;
    localPlaying = ytPlayer.getPlayerState() === PLAYING;
  } catch (_) { return; }

  if (iControlPlayback) {
    // Controller: cukup heartbeat (aksi real-time dikirim via onStateChange)
    if (localPlaying) sendPlaybackState('play');
    return;
  }

  if (!syncFollow) {
    setSyncStatus('<i class="fas fa-link-slash"></i> Ikuti mati — nonton bebas');
    return;
  }

  // Ganti video kalau host memutar video lain
  if (remote.video && remote.video !== ytVideoId) {
    try {
      ytVideoId = remote.video;
      ytPlayer.loadVideoById(remote.video, Number(remote.time) || 0);
      setSyncStatus('<i class="fas fa-sync"></i> Memuat video host...');
      return;
    } catch (_) {}
  }

  const act = computeFollowAction(
    { time: localTime, playing: localPlaying },
    remote,
    Date.now() + clockOffsetMs,
    SYNC_THRESHOLD
  );
  try {
    if (act.seekTo != null) ytPlayer.seekTo(act.seekTo, true);
    if (act.pause) ytPlayer.pauseVideo();
    else if (act.play) ytPlayer.playVideo();
  } catch (_) {}
  if (act.seekTo != null || act.pause || act.play) {
    setSyncStatus('<i class="fas fa-sync"></i> Menyesuaikan ke host...');
  } else {
    setSyncStatus('<i class="fas fa-link"></i> Sinkron dengan host ✓');
  }
}

function updateSyncUi(isController) {
  const wrap = document.getElementById('sync-toggle-wrap');
  if (isController) {
    if (wrap) wrap.style.display = 'none';
    setSyncStatus('<i class="fas fa-sliders"></i> Kamu pengendali — play/pause/seek, penonton ngikutin');
  } else {
    if (wrap) wrap.style.display = 'inline-flex';
  }
}

// Nobar + suara dalam 1 klik: masuk party sekaligus join voice channel komunitas.
// Ini inti Nobarly — streamer tidak perlu buka Discord terpisah buat ngobrol.
// Menerima objek party ATAU id string.
async function joinPartyVoice(party) {
  if (typeof party === 'string') {
    const { data } = await db.from('watch_parties').select('*').eq('id', party).maybeSingle();
    party = data;
  }
  if (!party) {
    alert('Party tidak ditemukan.');
    return;
  }
  if (!party.community_id) {
    alert('Party ini tidak terikat komunitas, tidak ada voice channel.');
    return;
  }
  const { data: channels } = await db.from('channels').select('*').eq('community_id', party.community_id);
  const voiceCh = (channels || []).find(c => c.type === 'voice');
  if (!voiceCh) {
    alert('Komunitas ini belum punya voice channel.');
    return;
  }
  // Selaraskan konteks ke komunitas party supaya panel & channel tampil
  currentCommunity = party.community_id;
  const { data: community } = await db.from('communities').select('*').eq('id', party.community_id).maybeSingle();
  if (community) {
    document.getElementById('community-title').textContent = community.name;
    document.getElementById('channel-sidebar').style.display = 'flex';
    if (typeof loadChannels === 'function') loadChannels(party.community_id);
  }
  if (typeof joinVoiceChannel === 'function') {
    joinVoiceChannel(voiceCh.id, party.community_id);
  }
  document.getElementById('voice-users-panel').style.display = 'block';
}

async function sendWatchReaction(partyId, emoji) {
  await apiFetch(`/watch-parties/${partyId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id, emoji })
  });
  loadWatchReactions(partyId, false);
}

async function loadWatchReactions(partyId, baseline) {
  const countsEl = document.getElementById('reaction-counts');
  const layer = document.getElementById('reaction-float-layer');
  const { data: reactions } = await apiFetch(`/watch-parties/${partyId}/reactions?limit=200`);
  if (!reactions) return;

  const counts = {};
  for (const r of reactions) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  if (countsEl) {
    countsEl.innerHTML = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([e, c]) => `<span class="reaction-total">${escapeHtml(e)} ${c}</span>`)
      .join('');
  }

  // Layangkan emoji yang baru masuk sejak baseline terakhir
  const sorted = [...reactions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (baseline || !lastReactionSeenAt) {
    lastReactionSeenAt = sorted.length > 0 ? sorted[sorted.length - 1].created_at : new Date().toISOString();
    return;
  }
  const fresh = sorted.filter(r => new Date(r.created_at) > new Date(lastReactionSeenAt)).slice(-8);
  if (fresh.length > 0) {
    lastReactionSeenAt = sorted[sorted.length - 1].created_at;
    for (const r of fresh) floatReaction(r.emoji);
  }
}

function floatReaction(emoji) {
  const layer = document.getElementById('reaction-float-layer');
  if (!layer) return;
  const span = document.createElement('span');
  span.className = 'reaction-float';
  span.textContent = emoji;
  span.style.left = (10 + Math.random() * 80) + '%';
  layer.appendChild(span);
  setTimeout(() => span.remove(), 2600);
  // Batasi tumpukan animasi
  while (layer.children.length > 24) layer.firstChild.remove();
}

async function loadWatchMoments(partyId) {
  const box = document.getElementById('moments-list');
  if (!box) return;
  const { data: moments } = await apiFetch(`/watch-parties/${partyId}/moments`);
  if (!moments || moments.length === 0) {
    box.innerHTML = '<p class="no-comments">Belum ada momen. Tandai highlight biar gampang diulang!</p>';
    return;
  }
  box.innerHTML = moments.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <div class="moment-row">
        <span class="moment-time">${time}</span>
        <span class="moment-label">${escapeHtml(m.label)}</span>
        <span class="comment-author">${escapeHtml(m.username || 'User')}</span>
      </div>`;
  }).join('');
}

async function addWatchMoment(partyId) {
  // prompt() tidak jalan di WebView HP → pakai modal biasa
  let overlay = document.getElementById('moment-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'moment-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>🔖 Tandai Momen</h3>
          <button class="modal-close" id="moment-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-error" id="moment-error"></div>
          <div class="form-group">
            <label for="moment-input">Label momen (mis. "Gol menit 89!", "Plot twist!")</label>
            <input type="text" id="moment-input" maxlength="200" placeholder="Momen apa ini?">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="moment-cancel">Batal</button>
          <button class="btn btn-primary" id="moment-save" style="width:auto;">Tandai</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  const errBox = document.getElementById('moment-error');
  errBox.classList.remove('show');
  errBox.textContent = '';
  const input = document.getElementById('moment-input');
  input.value = '';
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 100);
  document.getElementById('moment-close').onclick = () => overlay.classList.remove('active');
  document.getElementById('moment-cancel').onclick = () => overlay.classList.remove('active');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
  document.getElementById('moment-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const label = input.value.trim();
    if (!label) {
      errBox.textContent = 'Label momen wajib diisi!';
      errBox.classList.add('show');
      return;
    }
    btn.disabled = true;
    try {
      const { error } = await apiFetch(`/watch-parties/${partyId}/moments`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: currentUser.id,
          username: currentUser.username || currentUser.email || 'Guest',
          label
        })
      });
      if (error) throw new Error(error.message);
      overlay.classList.remove('active');
      loadWatchMoments(partyId);
    } catch (err) {
      errBox.textContent = 'Gagal menandai momen: ' + (err.message || err);
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------- Antrean putar (v2.0) ----------

async function loadWatchQueue(partyId) {
  const box = document.getElementById('queue-list');
  if (!box) return;
  const { data: items } = await apiFetch(`/queue?watch_party_id=${partyId}`);
  if (!items || items.length === 0) {
    box.innerHTML = '<p class="no-comments">Antrean kosong. Tambahkan video berikutnya! 🎬</p>';
    return;
  }
  box.innerHTML = items.map((q, i) => `
    <div class="moment-row">
      <span class="moment-time">#${i + 1}</span>
      <span class="moment-label">${escapeHtml(q.title)}</span>
      <span class="comment-author">${escapeHtml(q.added_by_name || '')}</span>
      <button class="post-action-btn" title="Putar sekarang (pengendali)" onclick="playQueueItem('${partyId}', '${q.id}')"><i class="fas fa-play"></i></button>
      <button class="post-action-btn" title="Hapus dari antrean" onclick="removeQueueItem('${partyId}', '${q.id}')"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

async function addQueueItem(partyId) {
  const title = (document.getElementById('queue-title').value || '').trim();
  const url = (document.getElementById('queue-url').value || '').trim();
  const type = document.getElementById('queue-type').value;
  if (!title || !url) { alert('Judul dan URL wajib diisi!'); return; }
  const { error } = await apiFetch('/queue', {
    method: 'POST',
    body: JSON.stringify({
      watch_party_id: partyId, title, stream_url: url, stream_type: type,
      added_by: currentUser.id, added_by_name: currentUser.username || currentUser.email || 'User'
    })
  });
  if (error) { alert('Gagal menambah antrean: ' + error.message); return; }
  document.getElementById('queue-title').value = '';
  document.getElementById('queue-url').value = '';
  loadWatchQueue(partyId);
}

async function removeQueueItem(partyId, itemId) {
  await apiFetch(`/queue/${itemId}`, { method: 'DELETE' });
  loadWatchQueue(partyId);
}

// Pengendali (host/co-host) memutar item antrean → party pindah video + item hilang
async function playQueueItem(partyId, itemId) {
  if (!iControlPlayback) { alert('Hanya pengendali (host/co-host) yang bisa memutar antrean.'); return; }
  const { data: items } = await apiFetch(`/queue?watch_party_id=${partyId}`);
  const item = (items || []).find(q => q.id === itemId);
  if (!item) return;
  const { error } = await db.from('watch_parties').update({
    title: item.title, stream_url: item.stream_url, stream_type: item.stream_type
  }).eq('id', partyId);
  if (error) { alert('Gagal memutar: ' + error.message); return; }
  await apiFetch(`/queue/${itemId}`, { method: 'DELETE' });
  openWatchParty(partyId);
}

// Video selesai + saya pengendali → lanjut otomatis ke antrean pertama
async function autoAdvanceQueue(partyId) {
  if (!iControlPlayback) return;
  try {
    const { data: items } = await apiFetch(`/queue?watch_party_id=${partyId}`);
    if (items && items.length > 0) playQueueItem(partyId, items[0].id);
  } catch (_) {}
}

// ---------- Kelola co-host ----------

async function loadPartyHosts(partyId) {
  const box = document.getElementById('cohost-list');
  if (!box) return;
  const { data: party } = await db.from('watch_parties').select('*').eq('id', partyId).maybeSingle();
  const { data: hosts } = await apiFetch(`/watch-parties/${partyId}/hosts`);
  if (!party) return;

  const { data: hostProfile } = await db.from('profiles').select('*').eq('id', party.host_id).maybeSingle();
  const iAmHost = currentUser && party.host_id === currentUser.id;
  const list = hosts || [];

  box.innerHTML = `
    <div class="voice-user">
      ${avatarHtml((hostProfile && hostProfile.username) || 'Host', (hostProfile && hostProfile.avatar_url) || null, 'voice-user-avatar', false)}
      <span>${escapeHtml((hostProfile && hostProfile.username) || 'Host')}</span>
      <span class="community-card-tag">HOST</span>
    </div>
    ${list.map(h => `
      <div class="voice-user">
        ${avatarHtml(h.username, h.avatar_url, 'voice-user-avatar', false)}
        <span>${escapeHtml(h.username || 'User')}</span>
        <span class="community-card-tag">CO-HOST</span>
        ${(iAmHost || (currentUser && h.user_id === currentUser.id)) ? `<button class="post-action-btn" title="Hapus co-host" onclick="removeCohost('${partyId}', '${h.user_id}')"><i class="fas fa-times"></i></button>` : ''}
      </div>`).join('')}`;

  const addBox = document.getElementById('cohost-add');
  if (addBox) addBox.style.display = iAmHost ? 'flex' : 'none';
}

async function addCohost(partyId) {
  const input = document.getElementById('cohost-input');
  const username = (input.value || '').trim();
  if (!username) { alert('Isi username dulu!'); return; }
  const res = await fetch(API_BASE + `/profiles/search?q=${encodeURIComponent(username)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('nobarly_token') || ''}` }
  });
  const { data: users } = await res.json();
  const match = (users || []).find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!match) { alert('User tidak ketemu. Minta dia daftar / login dulu.'); return; }
  const { error } = await apiFetch(`/watch-parties/${partyId}/hosts`, {
    method: 'POST',
    body: JSON.stringify({ requester_id: currentUser.id, user_id: match.id })
  });
  if (error) { alert(error.code === '23505' ? 'Dia sudah jadi co-host.' : 'Gagal: ' + error.message); return; }
  input.value = '';
  loadPartyHosts(partyId);
}

async function removeCohost(partyId, userId) {
  if (!confirm('Hapus co-host ini?')) return;
  const { error } = await apiFetch(`/watch-parties/${partyId}/hosts?user_id=${userId}&requester_id=${currentUser.id}`, { method: 'DELETE' });
  if (error) { alert('Gagal: ' + error.message); return; }
  loadPartyHosts(partyId);
}

function closeWatchParty() {
  leaveWatchPartyCleanup();
  renderPage('nobar');
}

// Dipanggil setiap pindah halaman (lihat renderPage di dashboard.js):
// stop polling chat + kurangi viewer_count supaya tidak menggelembung.
// Fire-and-forget, aman dipanggil meski tidak sedang nobar.
async function leaveWatchPartyCleanup() {
  if (watchChatInterval) {
    clearInterval(watchChatInterval);
    watchChatInterval = null;
  }
  destroySyncPlayer();
  lastReactionSeenAt = null;
  if (currentWatchParty) {
    const pid = currentWatchParty;
    currentWatchParty = null;
    try {
      const { data: p } = await db.from('watch_parties').select('*').eq('id', pid).single();
      if (p) {
        await db.from('watch_parties').update({
          viewer_count: Math.max(0, (p.viewer_count || 1) - 1)
        }).eq('id', pid);
      }
    } catch (_) { /* abaikan, misal server mati saat navigasi */ }
  }
}

async function loadWatchChat(partyId) {
  const container = document.getElementById('watch-chat-messages');
  if (!container) return;

  const { data: chats } = await db
    .from('watch_chat')
    .select('*')
    .eq('watch_party_id', partyId)
    .order('created_at', { ascending: true });

  if (!chats) return;

  const countEl = document.getElementById(`chat-count-${partyId}`);
  if (countEl) countEl.textContent = `${chats.length} pesan`;

  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

  container.innerHTML = '';
  for (const chat of chats) {
    const time = new Date(chat.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const isMe = chat.user_id === currentUser.id;
    const textHtml = chat.message
      ? `<p class="watch-chat-text">${escapeHtml(chat.message)}</p>`
      : '';
    const chatImgHtml = chat.image_url
      ? `<img class="watch-chat-img" src="${escapeHtml(imageSrc(chat.image_url))}" alt="Gambar chat" loading="lazy" onclick="openImageViewer('${jsq(chat.image_url)}')">`
      : '';
    container.innerHTML += `
      <div class="watch-chat-msg ${isMe ? 'watch-chat-msg-me' : ''}">
        <div onclick="openMiniProfile('${chat.user_id || ''}', this)" style="cursor:pointer;flex-shrink:0;" title="Lihat profil">${avatarHtml(chat.username, chat.avatar_url, 'voice-user-avatar', false)}</div>
        <div class="chat-msg-body">
          <span class="watch-chat-author">${escapeHtml(chat.username)}</span>
          <span class="watch-chat-time">${time}</span>
          ${textHtml}
          ${chatImgHtml}
        </div>
      </div>`;
  }

  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
  // Animasikan HANYA pesan paling baru (kalau benar-benar baru)
  try {
    const last = chats[chats.length - 1];
    if (lastWatchChatParty !== partyId) {
      lastWatchChatParty = partyId;
      lastWatchChatId = last ? last.id : null;
    } else if (last && last.id !== lastWatchChatId) {
      lastWatchChatId = last.id;
      const el = container.lastElementChild;
      if (el) el.classList.add('msg-new');
    }
  } catch (_) {}
}

function onWatchChatImagePicked() {
  const fileInput = document.getElementById('watch-chat-image');
  const label = document.getElementById('watch-chat-image-label');
  const hasFile = !!(fileInput && fileInput.files[0]);
  if (label) label.classList.toggle('has-file', hasFile);
}

async function sendWatchChat(partyId) {
  const input = document.getElementById('watch-chat-input');
  if (!input) return;
  const fileInput = document.getElementById('watch-chat-image');
  const message = input.value.trim();
  const imageFile = fileInput ? fileInput.files[0] : null;
  if (!message && !imageFile) return;

  let imageUrl = null;
  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile);
    } catch (e) {
      alert('Gagal upload gambar: ' + e.message);
      return;
    }
  }

  const { error } = await db.from('watch_chat').insert([{
    watch_party_id: partyId,
    user_id: currentUser.id,
    username: currentUser.username || currentUser.email || 'Guest',
    message,
    image_url: imageUrl
  }]);

  if (error) { alert('Gagal mengirim chat: ' + error.message); return; }

  input.value = '';
  if (fileInput) {
    fileInput.value = '';
    onWatchChatImagePicked();
  }
  loadWatchChat(partyId);
}

function extractYoutubeId(url) {
  if (url.includes('/embed?channel=')) return null;
  if (url.includes('@') || url.includes('/channel/')) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match ? match[1] : null;
}

function extractTwitchChannel(url) {
  const match = url.match(/twitch\.tv\/(\w+)/);
  return match ? match[1] : url;
}

function getStreamEmbedUrl(url, type) {
  if (type === 'twitch') {
    const channel = url.match(/twitch\.tv\/(\w+)/);
    // Twitch wajib tahu domain yang meng-embed (parent). localhost saja
    // bikin embed gagal saat diakses via tunnel/APK, jadi pakai hostname aktif.
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
