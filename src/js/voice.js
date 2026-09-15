// Voice channel ala Discord: gabung, ngobrol, nobar, soundboard satu tempat.
// Tombol Keluar selalu terlihat di tampilan voice (dulu cuma di sidebar kecil).
let peer = null;
let localStream = null;
let currentVoiceChannel = null;
let currentVoiceCommunity = null;
let isMuted = false;
let isDeafened = false;
var deafenedStreams = {};
let connectedPeers = {};
let myPeerId = null;
// --- Video call (v2.0): mesh terpisah dari audio, metadata kind video/screen
let localVideoStream = null;
let localScreenStream = null;
let isCameraOn = false;
let isSharing = false;
let videoCalls = {};
let lastVoiceSessions = [];
var voicePoll = null;
var voiceRoomChannel = null;
var voiceRoomPartyId = null;
var peerOpenTimer = null;

async function joinVoiceChannel(channelId, communityId) {
  if (currentVoiceChannel === channelId) return true;

  if (typeof Peer === 'undefined') {
    alert('Voice chat belum tersedia (PeerJS gagal dimuat). Cek koneksi internet lalu refresh.');
    return false;
  }

  if (currentVoiceChannel) {
    await leaveVoiceChannel();
  }

  currentVoiceChannel = channelId;
  currentVoiceCommunity = communityId || null;
  try {
    window._resumeVoice = { channel: channelId, community: communityId || null, name: null };
    const { data: chs } = await db.from('channels').select('*').eq('community_id', communityId);
    const ch = (chs || []).find(c => c.id === channelId);
    if (ch) window._resumeVoice.name = ch.name;
  } catch (_) {}

  // Guard: WebView tua / HTTP non-secure / izin belum ada → mediaDevices undefined.
  // Tanpa ini: TypeError "Cannot read properties of undefined" dengan alert "undefined".
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    alert('Microphone tidak tersedia di perangkat/browser ini. Di HP: pastikan membuka via https/APK terbaru dan izin Microphone diberikan di Pengaturan → Aplikasi → Nobarly.');
    currentVoiceChannel = null;
    currentVoiceCommunity = null;
    return false;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
  } catch (err) {
    const name = (err && err.name) || '';
    let hint = (err && err.message) || 'Microphone tidak bisa diakses.';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      hint = 'Izin microphone ditolak. Di HP: izinkan Microphone untuk Nobarly di Pengaturan → Aplikasi, lalu coba lagi.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      hint = 'Microphone tidak ketemu di perangkat ini.';
    } else if (name === 'NotReadableError') {
      hint = 'Microphone sedang dipakai aplikasi lain. Tutup aplikasi lain lalu coba lagi.';
    }
    alert('Tidak bisa akses microphone: ' + hint);
    currentVoiceChannel = null;
    currentVoiceCommunity = null;
    return false;
  }

  // ICE: STUN saja gagal menembus NAT ketat (data seluler vs WiFi rumah).
  // TURN gratis openrelay dipakai sebagai relay cadangan supaya suara
  // tetap nyambung jarak jauh. Ganti ke TURN sendiri kalau sudah punya.
  peer = new Peer({
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  });

  // Pengaman: kalau 'open' tidak pernah datang (server PeerJS mati total),
  // jangan gantung — batalkan dan kasih tahu user.
  if (peerOpenTimer) clearTimeout(peerOpenTimer);
  peerOpenTimer = setTimeout(() => {
    if (currentVoiceChannel === channelId && !myPeerId) {
      alert('Server voice tidak merespons. Cek koneksi internet lalu coba lagi.');
      leaveVoiceChannel().then(() => {
        if (voiceRoomChannel === channelId) renderVoiceRoom(channelId, communityId);
      });
    }
  }, 12000);

  peer.on('open', async (peerId) => {
    if (peerOpenTimer) {
      clearTimeout(peerOpenTimer);
      peerOpenTimer = null;
    };
    myPeerId = peerId;
    const { error } = await db.from('voice_sessions').insert([{
      community_id: communityId,
      channel_id: channelId,
      user_id: currentUser.id,
      peer_id: peerId,
      is_active: true,
      is_muted: false
    }]);
    if (error) {
      alert('Gagal masuk voice: ' + error.message);
      await leaveVoiceChannel();
      if (voiceRoomChannel === channelId) renderVoiceRoom(channelId, communityId);
      return;
    }

    showVoiceControls(true);
    await refreshVoiceUsers(channelId);
    startVoicePoll(channelId);
    if (voiceRoomChannel === channelId) renderVoiceRoom(channelId, communityId);
  });

  peer.on('call', (call) => {
    const kind = (call.metadata && call.metadata.kind) || 'audio';
    if (kind === 'audio') {
      call.answer(localStream);
      call.on('stream', (remoteStream) => {
        addRemoteAudio(call.peer, remoteStream);
      });
      call.on('close', () => removeRemoteAudio(call.peer));
      call.on('error', () => removeRemoteAudio(call.peer));
      return;
    }
    // Panggilan video/screen masuk: jawab (ikut kirim kamera sendiri kalau nyala)
    try { call.answer(isCameraOn && localVideoStream ? localVideoStream : undefined); } catch (_) {
      try { call.answer(); } catch (_) {}
    }
    call.on('stream', (remoteStream) => {
      addRemoteVideo(call.peer, remoteStream, kind);
    });
    const drop = () => removeRemoteVideo(call.peer);
    call.on('close', drop);
    call.on('error', drop);
    videoCalls[call.peer + ':' + kind] = call;
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    const msg = (err && err.type) || '';
    if (msg === 'peer-unavailable') return; // teman keburu keluar, abaikan
    // Error jaringan sesaat (pindah WiFi/data, NAT timeout): coba sambung
    // ulang diam-diam, jangan tendang user keluar + jangan spam alert.
    if (msg === 'network' || msg === 'server-error' || msg === 'socket-error' || msg === 'socket-closed') {
      try { peer.reconnect(); } catch (_) {}
      return;
    }
    alert('Voice error (' + (msg || 'koneksi') + '). Coba keluar lalu gabung lagi.');
    leaveVoiceChannel().then(() => {
      if (voiceRoomChannel === channelId) renderVoiceRoom(channelId, communityId);
    });
  });

  peer.on('disconnected', () => {
    console.log('Peer disconnected, mencoba sambung ulang...');
    try { peer.reconnect(); } catch (_) {}
  });

  return true;
}

async function connectToPeer(remotePeerId) {
  if (connectedPeers[remotePeerId]) return;
  if (!localStream || !peer) return;

  try {
    const call = peer.call(remotePeerId, localStream);
    if (call) {
      call.on('stream', (remoteStream) => {
        addRemoteAudio(remotePeerId, remoteStream);
      });
      call.on('close', () => removeRemoteAudio(remotePeerId));
      call.on('error', () => removeRemoteAudio(remotePeerId));
      connectedPeers[remotePeerId] = call;
    }
    // Teman yang baru gabung selagi kameraku nyala: kirim video juga
    if (isCameraOn && localVideoStream) placeVideoCall(remotePeerId, localVideoStream, 'video');
  } catch (_) {}
}

// Panggilan video ke 1 peer (dipakai kamera nyala + teman baru masuk)
function placeVideoCall(remotePeerId, stream, kind) {
  if (!peer || !peer.open) return;
  const key = remotePeerId + ':' + kind;
  if (videoCalls[key]) return;
  try {
    const call = peer.call(remotePeerId, stream, { metadata: { kind } });
    if (!call) return;
    call.on('stream', (rs) => addRemoteVideo(remotePeerId, rs, kind));
    const drop = () => removeRemoteVideo(remotePeerId);
    call.on('close', drop);
    call.on('error', drop);
    videoCalls[key] = call;
  } catch (_) {}
}

function addRemoteAudio(peerId, stream) {
  let audio = document.getElementById(`audio-${peerId}`);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = `audio-${peerId}`;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  // Deafen aktif: simpan stream tapi jangan bunyikan
  if (isDeafened) {
    deafenedStreams[peerId] = stream;
    audio.srcObject = null;
  } else {
    audio.srcObject = stream;
  }
  speakerWatch(peerId, stream);
}

function removeRemoteAudio(peerId) {
  const audio = document.getElementById(`audio-${peerId}`);
  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }
  delete connectedPeers[peerId];
  speakerDrop(peerId);
}

// ===== ACTIVE SPEAKER: border putih saat peserta bicara =====
let speakerCtx = null;
let speakerMeters = {};
let pendingSpeakers = {};
let speakerTimer = null;
// Animasi tile baru saja (anti-flicker saat polling member)
var knownVoiceTiles = {};

function speakerEnsureCtx() {
  try {
    if (!speakerCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      speakerCtx = new AC();
    }
    if (speakerCtx.state === 'suspended') speakerCtx.resume().catch(() => {});
    return speakerCtx.state === 'suspended' ? null : speakerCtx;
  } catch (_) {
    return null;
  }
}

function speakerWatch(peerId, stream) {
  try {
    if (speakerMeters[peerId]) return;
    const ctx = speakerEnsureCtx();
    if (!ctx) {
      // AudioContext ditangguhkan browser: coba lagi tiap tick
      pendingSpeakers[peerId] = stream;
      if (!speakerTimer) speakerTimer = setInterval(speakerTick, 200);
      return;
    }
    delete pendingSpeakers[peerId];
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    speakerMeters[peerId] = { analyser, buf: new Uint8Array(analyser.frequencyBinCount) };
    if (!speakerTimer) speakerTimer = setInterval(speakerTick, 200);
  } catch (_) {}
}

function speakerTick() {
  try {
    if (!currentVoiceChannel) return;
    // Coba pasang meter yang tertunda
    Object.keys(pendingSpeakers).forEach(pid => {
      if (!speakerMeters[pid]) speakerWatch(pid, pendingSpeakers[pid]);
    });
    Object.keys(speakerMeters).forEach(pid => {
      const m = speakerMeters[pid];
      let lvl = 0;
      try {
        m.analyser.getByteTimeDomainData(m.buf);
        let sum = 0;
        for (let i = 0; i < m.buf.length; i++) {
          const v = (m.buf[i] - 128) / 128;
          sum += v * v;
        }
        lvl = Math.sqrt(sum / m.buf.length);
      } catch (_) {}
      const tile = document.querySelector(`.voice-tile[data-peer="${CSS.escape(pid)}"]`);
      if (tile) tile.classList.toggle('speaking', lvl > 0.03);
    });
  } catch (_) {}
}

function speakerDrop(peerId) {
  try { delete speakerMeters[peerId]; } catch (_) {}
  try { delete pendingSpeakers[peerId]; } catch (_) {}
  if (Object.keys(speakerMeters).length === 0 && Object.keys(pendingSpeakers).length === 0 && speakerTimer) {
    clearInterval(speakerTimer);
    speakerTimer = null;
  }
}

function speakerReset() {
  speakerMeters = {};
  pendingSpeakers = {};
  if (speakerTimer) {
    clearInterval(speakerTimer);
    speakerTimer = null;
  }
}

// Browser menangguhkan AudioContext sampai ada gestur: buka kunci tiap tap
document.addEventListener('pointerdown', () => {
  try {
    if (speakerCtx && speakerCtx.state === 'suspended') speakerCtx.resume().catch(() => {});
  } catch (_) {}
});

// ===== VIDEO CALL (v2.0) =====

function voiceVideoGrid() {
  return document.getElementById('voice-video-grid');
}

function addRemoteVideo(peerId, stream, kind) {
  const grid = voiceVideoGrid();
  if (!grid) return;
  const id = `video-${peerId}`;
  let tile = document.getElementById(id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'voice-video-tile';
    tile.id = id;
    tile.innerHTML = `<video autoplay playsinline></video><span class="voice-video-label"></span>`;
    grid.appendChild(tile);
  }
  const vid = tile.querySelector('video');
  if (vid) {
    vid.srcObject = stream;
    vid.play?.().catch(() => {});
  }
  const label = tile.querySelector('.voice-video-label');
  if (label) label.textContent = (kind === 'screen' ? '🖥️ ' : '') + shortPeerName(peerId);
  grid.style.display = 'grid';
}

function removeRemoteVideo(peerId) {
  const tile = document.getElementById(`video-${peerId}`);
  if (tile) {
    const vid = tile.querySelector('video');
    if (vid) vid.srcObject = null;
    tile.remove();
  }
  Object.keys(videoCalls).forEach(k => {
    if (k.startsWith(peerId + ':')) { try { videoCalls[k].close(); } catch (_) {} delete videoCalls[k]; }
  });
  const grid = voiceVideoGrid();
  if (grid && !grid.querySelector('.voice-video-tile')) grid.style.display = 'none';
}

function shortPeerName(peerId) {
  try {
    const s = (lastVoiceSessions || []).find(x => x.peer_id === peerId);
    if (s) return 'Teman';
  } catch (_) {}
  return String(peerId).slice(0, 6);
}

// Telepon video ke semua member voice yang ada (dipakai saat kamera/share nyala)
function callVideoPeers(stream, kind) {
  if (!peer || !peer.open) return;
  for (const s of lastVoiceSessions || []) {
    if (!s.peer_id || s.peer_id === myPeerId) continue;
    const key = s.peer_id + ':' + kind;
    if (videoCalls[key]) continue;
    try {
      const call = peer.call(s.peer_id, stream, { metadata: { kind } });
      if (!call) continue;
      call.on('stream', (rs) => addRemoteVideo(s.peer_id, rs, kind));
      const drop = () => removeRemoteVideo(s.peer_id);
      call.on('close', drop);
      call.on('error', drop);
      videoCalls[key] = call;
    } catch (_) {}
  }
}

function updateVideoButtons() {
  const camBtns = document.querySelectorAll('#voice-room-cam, #btn-cam');
  camBtns.forEach(b => {
    b.classList.toggle('cam-on', isCameraOn);
    const i = b.querySelector('i');
    if (i) i.className = isCameraOn ? 'fas fa-video' : 'fas fa-video-slash';
  });
  const shareBtns = document.querySelectorAll('#voice-room-share');
  shareBtns.forEach(b => {
    b.classList.toggle('cam-on', isSharing);
    // WebView HP tidak punya screen capture: sembunyikan biar tidak dikira rusak
    if (!canShareScreen()) b.style.display = 'none';
  });
}

// WebView Android tidak mengimplementasikan getDisplayMedia → share layar
// khusus laptop/desktop. Cek di awal supaya tombol tidak PHP.
function canShareScreen() {
  try {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  } catch (_) {
    return false;
  }
}

async function toggleCamera() {
  if (isCameraOn) {
    stopCamera();
    return;
  }
  if (!currentVoiceChannel) { alert('Gabung voice dulu!'); return; }
  // Coba SATU sesi audio+video (fix NotReadableError di HP: WebView sering
  // menolak sesi capture ke-2 selagi mic voice masih jalan).
  let combined = null;
  try {
    combined = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (_) {
    combined = null;
  }
  if (combined && combined.getVideoTracks().length > 0) {
    // Pindahkan audio ke sesi gabungan TANPA putus suara (replaceTrack),
    // lalu matikan mic lama. Suara tetap jalan, kamera ikut nyala.
    const newAudio = combined.getAudioTracks()[0] || null;
    if (newAudio && localStream) {
      try {
        Object.values(connectedPeers).forEach(call => {
          try {
            const pc = call.peerConnection;
            const sender = pc && pc.getSenders
              ? pc.getSenders().find(s => s.track && s.track.kind === 'audio')
              : null;
            if (sender && sender.replaceTrack) sender.replaceTrack(newAudio);
          } catch (_) {}
        });
        localStream.getAudioTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        newAudio.enabled = !isMuted;
        localStream = combined; // stream suara sekarang = sesi gabungan
      } catch (_) { /* fallback: biarkan dua sesi */ }
    }
    localVideoStream = combined;
  } else {
    // Fallback: sesi video terpisah (laptop umumnya bisa)
    try {
      localVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
    } catch (err) {
      const name = (err && err.name) || 'Error';
      const detail = (err && (err.message || err.constraint)) || '-';
      alert(name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Nyalakan di Pengaturan → Aplikasi → Nobarly.'
        : 'Tidak bisa akses kamera (' + name + '): ' + detail);
      try {
        if (typeof sendBugReport === 'function') {
          sendBugReport('Auto-diagnostik: kamera gagal',
            'Kamera gagal dinyalakan.\nJenis: ' + name + '\nDetail: ' + detail +
            '\nDevices: ' + (navigator.mediaDevices ? 'ada' : 'TIDAK ADA'));
        }
      } catch (_) {}
      return;
    }
  }
  isCameraOn = true;
  // Preview sendiri
  const grid = voiceVideoGrid();
  if (grid) {
    let tile = document.getElementById('video-self');
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'voice-video-tile voice-video-self';
      tile.id = 'video-self';
      tile.innerHTML = `<video autoplay playsinline muted></video><span class="voice-video-label">Kamu 📷</span>`;
      grid.prepend(tile);
    }
    const vid = tile.querySelector('video');
    if (vid) { vid.srcObject = localVideoStream; vid.play?.().catch(() => {}); }
    grid.style.display = 'grid';
  }
  callVideoPeers(localVideoStream, 'video');
  updateVideoButtons();
  paintOwnTile();
  syncVideoState(true);
}

function stopCamera() {
  isCameraOn = false;
  if (localVideoStream) {
    try {
      // Kalau video menumpang di stream suara (sesi gabungan HP):
      // matikan track VIDEO saja supaya suara tetap jalan.
      const tracks = (localVideoStream === localStream)
        ? localVideoStream.getVideoTracks()
        : localVideoStream.getTracks();
      tracks.forEach(t => { try { t.stop(); } catch (_) {} });
      // NOTE: localStream JANGAN di-null-kan — track audionya masih dipakai voice.
    } catch (_) {}
    localVideoStream = null;
  }
  const self = document.getElementById('video-self');
  if (self) self.remove();
  Object.keys(videoCalls).forEach(k => {
    if (k.endsWith(':video')) { try { videoCalls[k].close(); } catch (_) {} delete videoCalls[k]; }
  });
  updateVideoButtons();
  paintOwnTile();
  syncVideoState(false);
}

async function toggleScreen() {
  if (isSharing) {
    stopScreen();
    return;
  }
  if (!currentVoiceChannel) { alert('Gabung voice dulu!'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    alert('Share layar tidak didukung di perangkat ini (pakai aplikasi laptop).');
    return;
  }
  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    if (err && err.name === 'NotAllowedError') return; // user batalkan picker
    const detail = (err && (err.name || '') + ': ' + (err.message || '')) || '-';
    alert('Gagal share layar: ' + detail);
    try {
      if (typeof sendBugReport === 'function') {
        sendBugReport('Auto-diagnostik: share layar gagal', 'Share layar gagal.\nDetail: ' + detail);
      }
    } catch (_) {}
    return;
  }
  isSharing = true;
  try {
    localScreenStream.getVideoTracks()[0].addEventListener('ended', () => stopScreen());
  } catch (_) {}
  callVideoPeers(localScreenStream, 'screen');
  updateVideoButtons();
}

function stopScreen() {
  isSharing = false;
  if (localScreenStream) {
    try { localScreenStream.getTracks().forEach(t => t.stop()); } catch (_) {}
    localScreenStream = null;
  }
  Object.keys(videoCalls).forEach(k => {
    if (k.endsWith(':screen')) { try { videoCalls[k].close(); } catch (_) {} delete videoCalls[k]; }
  });
  updateVideoButtons();
}

function stopAllVideo() {
  stopCamera();
  stopScreen();
  Object.keys(videoCalls).forEach(k => { try { videoCalls[k].close(); } catch (_) {} });
  videoCalls = {};
  const grid = voiceVideoGrid();
  if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
}

// Cache profil member voice 60 detik (polling member 2 dtk jadi murah)
var voiceProfileCache = {};
async function voiceProfile(userId) {
  const now = Date.now();
  const hit = voiceProfileCache[userId];
  if (hit && now - hit.ts < 60000) return hit.data;
  try {
    const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    voiceProfileCache[userId] = { data, ts: now };
    return data;
  } catch (_) {
    return hit ? hit.data : null;
  }
}

// Ikon status tile: kamera (kalau nyala) + mic/mute
function voiceStateIcons(camOn, muted) {
  return `${camOn ? '<i class="fas fa-video"></i>' : ''}<i class="fas ${muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>`;
}

// Kirim status kamera ke server (best-effort, tidak blokir UI)
function syncVideoState(on) {
  try {
    if (!currentVoiceChannel || !currentUser) return;
    db.from('voice_sessions').update({ is_video: !!on }).eq('channel_id', currentVoiceChannel).eq('user_id', currentUser.id);
  } catch (_) {}
}

// Optimistik: cat tile sendiri LANGSUNG tanpa nunggu polling
function paintOwnTile() {
  try {
    document.querySelectorAll('.voice-tile').forEach(t => {
      const nm = t.querySelector('.voice-tile-namepill');
      if (!nm || !nm.textContent.includes('(kamu)')) return;
      t.classList.toggle('muted', isMuted);
      const st = t.querySelector('.voice-tile-state');
      if (st) st.innerHTML = voiceStateIcons(isCameraOn, isMuted);
    });
  } catch (_) {}
}

async function refreshVoiceUsers(channelId) {
  const { data: sessions } = await db
    .from('voice_sessions')
    .select('*')
    .eq('channel_id', channelId)
    .eq('is_active', true);

  lastVoiceSessions = sessions || [];

  // Bersihkan video member yang sudah keluar voice
  const alive = new Set((sessions || []).map(s => s.peer_id));
  document.querySelectorAll('.voice-video-tile[id^="video-"]').forEach(t => {
    if (t.id !== 'video-self' && !alive.has(t.id.replace(/^video-/, ''))) {
      removeRemoteVideo(t.id.replace(/^video-/, ''));
    }
  });

  const list = document.getElementById('voice-users-list');
  const panel = document.getElementById('voice-users-panel');

  if (panel && (!sessions || sessions.length === 0)) {
    panel.style.display = 'none';
  } else if (panel) {
    panel.style.display = 'block';
  }
  // Bar status "Voice Connected" ala Discord di kolom channel
  try {
    const titleEl = panel ? panel.querySelector('.channel-section-title') : null;
    if (titleEl) {
      const mine = (sessions || []).some(s => currentUser && s.user_id === currentUser.id);
      titleEl.innerHTML = mine
        ? `<span class="conn-dot"></span> Voice Connected — ${(sessions || []).length} di sini`
        : `<i class="fas fa-users"></i> Di Voice Channel`;
    }
  } catch (_) {}
  if (list) {
    list.innerHTML = '';
    for (const s of sessions || []) {
      const profile = await voiceProfile(s.user_id);
      const name = profile?.username || 'Guest';
      list.innerHTML += `
        <div class="voice-user">
          ${avatarHtml(name, profile?.avatar_url || null, 'voice-user-avatar', false)}
          <span>${escapeHtml(name)}${s.user_id === currentUser.id ? ' (kamu)' : ''}</span>
          ${s.is_video ? '<i class="fas fa-video"></i>' : ''}
          ${s.is_muted ? '<i class="fas fa-microphone-slash muted-icon"></i>' : ''}
        </div>`;
    }
  }

  // Telepon balik member lain yang sudah ada di channel.
  for (const s of sessions || []) {
    if (s.peer_id && s.peer_id !== myPeerId) {
      connectToPeer(s.peer_id);
    }
  }

  // Sinkron juga grid di tampilan voice room (kalau sedang dibuka)
  if (voiceRoomChannel === channelId) renderVoiceRoomGrid(sessions || []);
  // Jumlah member di top bar room
  const vc = document.getElementById('vroom-count');
  if (vc && voiceRoomChannel === channelId) {
    const n = (sessions || []).length;
    vc.textContent = n > 0 ? `${n} di sini` : '';
  }
}

function showVoiceControls(show) {
  const controls = document.getElementById('voice-controls');
  if (controls) controls.style.display = show ? 'flex' : 'none';
}

// Polling daftar member + soundboard selama di voice (berhenti saat pindah halaman,
// koneksi voice-nya sendiri tetap jalan ala Discord).
// Member 2 detik (status mute/kamera responsif), sound + sync tetap 5 detik.
var voiceMemberPoll = null;
function startVoicePoll(channelId) {
  stopVoicePoll();
  refreshVoiceUsers(channelId);
  voiceMemberPoll = setInterval(() => {
    if (currentVoiceChannel !== channelId) {
      stopVoicePoll();
      return;
    }
    if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return;
    refreshVoiceUsers(channelId);
  }, 2000);
  voicePoll = setInterval(() => {
    if (currentVoiceChannel !== channelId) {
      stopVoicePoll();
      return;
    }
    if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return;
    if (typeof pollVoiceSounds === 'function') pollVoiceSounds(channelId);
    if (voiceRoomChannel === channelId && typeof syncPlaybackTick === 'function') {
      syncPlaybackTick(voiceRoomPartyId);
    }
  }, 5000);
}

function stopVoicePoll() {
  if (voicePoll) {
    clearInterval(voicePoll);
    voicePoll = null;
  }
  if (voiceMemberPoll) {
    clearInterval(voiceMemberPoll);
    voiceMemberPoll = null;
  }
}

// Dipanggil renderPage tiap pindah halaman: hentikan polling tampilan saja.
function stopVoiceRoomPoll() {
  stopVoicePoll();
  voiceRoomChannel = null;
  voiceRoomPartyId = null;
  if (vroomIdleTimer) {
    clearTimeout(vroomIdleTimer);
    vroomIdleTimer = null;
  }
}

// Hapus sesi voice basi milik sendiri (mis. app ditutup paksa kemarin).
// Tanpa ini user hantu nongol terus di daftar voice.
async function cleanupStaleVoiceSession() {
  try {
    if (!currentUser) return;
    await apiFetch(`/voice/mine?user_id=${currentUser.id}`, { method: 'DELETE' });
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  const btnMute = document.getElementById('btn-mute');
  const btnDeafen = document.getElementById('btn-deafen');
  const btnLeave = document.getElementById('btn-leave-voice');

  if (btnMute) {
    btnMute.addEventListener('click', toggleMute);
  }
  if (btnDeafen) {
    btnDeafen.addEventListener('click', toggleDeafen);
  }
  if (btnLeave) {
    btnLeave.addEventListener('click', async () => {
      await leaveVoiceChannel();
      // Kalau sedang di tampilan voice room, gambar ulang jadi mode gabung
      if (voiceRoomChannel) renderVoiceRoom(voiceRoomChannel, currentVoiceCommunity);
    });
  }
});

async function toggleMute() {
  if (!localStream) return;

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });

  const icon = document.querySelector('#btn-mute i');
  if (icon) icon.className = isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  const roomIcon = document.querySelector('#voice-room-mute i');
  if (roomIcon) roomIcon.className = isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  document.querySelectorAll('#voice-room-mute').forEach(b => b.classList.toggle('cam-on', isMuted));
  paintOwnTile();

  if (currentVoiceChannel) {
    await db
      .from('voice_sessions')
      .update({ is_muted: isMuted })
      .eq('channel_id', currentVoiceChannel)
      .eq('user_id', currentUser.id);
  }
}

// Deafen ala Discord: tidak dengar siapa pun + mic ikut mati
async function toggleDeafen() {
  if (!localStream) return;
  isDeafened = !isDeafened;
  try {
    document.querySelectorAll('audio[id^="audio-"]').forEach(a => {
      const pid = a.id.replace('audio-', '');
      if (isDeafened) {
        if (a.srcObject) deafenedStreams[pid] = a.srcObject;
        a.srcObject = null;
      } else if (deafenedStreams[pid]) {
        a.srcObject = deafenedStreams[pid];
        delete deafenedStreams[pid];
      }
    });
  } catch (_) {}
  updateDeafenButtons();
  // Deafen = mic mati; undeafen = mic nyala lagi
  if (isDeafened && !isMuted) await toggleMute();
  else if (!isDeafened && isMuted) await toggleMute();
}

function updateDeafenButtons() {
  document.querySelectorAll('#voice-room-deafen, #btn-deafen').forEach(b => {
    b.classList.toggle('cam-on', isDeafened);
    const i = b.querySelector('i');
    if (i) i.className = isDeafened ? 'fas fa-volume-mute' : 'fas fa-headphones';
  });
}

async function leaveVoiceChannel() {
  const ch = currentVoiceChannel;
  const uid = currentUser ? currentUser.id : null;
  currentVoiceChannel = null;
  currentVoiceCommunity = null;
  try { window._resumeVoice = null; } catch (_) {}
  isDeafened = false;
  deafenedStreams = {};
  stopVoicePoll();
  stopAllVideo();
  speakerReset();
  lastVoiceSessions = [];

  if (ch && uid) {
    try {
      await db.from('voice_sessions').delete().eq('channel_id', ch).eq('user_id', uid);
    } catch (_) {}
  }

  if (localStream) {
    try {
      localStream.getTracks().forEach(track => track.stop());
    } catch (_) {}
    localStream = null;
  }

  Object.keys(connectedPeers).forEach(id => {
    removeRemoteAudio(id);
  });
  connectedPeers = {};

  if (peer) {
    try { peer.destroy(); } catch (_) {}
    peer = null;
  }

  isMuted = false;
  myPeerId = null;
  if (peerOpenTimer) {
    clearTimeout(peerOpenTimer);
    peerOpenTimer = null;
  }
  showVoiceControls(false);

  const panel = document.getElementById('voice-users-panel');
  if (panel) panel.style.display = 'none';
}

// ===== TAMPILAN VOICE ROOM ala Discord =====
// Satu layar: player nobar (kalau ada) + member + soundboard + chat + tombol keluar.
async function renderVoiceRoom(channelId, communityId) {
  stopVoiceRoomPoll();
  voiceRoomChannel = channelId;
  voiceRoomPartyId = null;
  knownVoiceTiles = {};

  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');
  if (!title || !body) return;

  // Mobile: daftar channel overlay ditutup supaya room langsung terlihat
  if (window.NobarlyMobile && window.NobarlyMobile.isMobile()) {
    const chSidebar = document.getElementById('channel-sidebar');
    if (chSidebar) chSidebar.style.display = 'none';
  }

  title.textContent = 'Voice Channel';
  if (actions) actions.innerHTML = '';

  // Nama channel + jumlah member untuk top bar ala Discord
  let chName = 'Voice Channel';
  try {
    const { data: chs } = await db.from('channels').select('*').eq('community_id', communityId);
    const ch = (chs || []).find(c => c.id === channelId);
    if (ch && ch.name) chName = ch.name;
  } catch (_) {}

  const inChannel = currentVoiceChannel === channelId;

  body.innerHTML = `
    <div class="voice-room v2">
      <div class="vroom-top">
        <button class="dmsg-iconbtn vroom-back" onclick="backToChannels()" title="Kembali"><i class="fas fa-arrow-left"></i></button>
        <div class="vroom-title"><b>${escapeHtml(chName)}</b><span id="vroom-count"></span></div>
      </div>
      <div class="vroom-body">
        <div class="vroom-stage">
          <div id="voice-party-mount"></div>
          <div class="voice-video-grid" id="voice-video-grid" style="display:none;"></div>
          <div class="voice-room-grid" id="voice-room-grid">
            <div class="skeleton"></div><div class="skeleton"></div>
          </div>
          ${inChannel ? `
          <div class="vroom-controls">
            <button class="vroom-ctrl" id="voice-room-mute" title="Mute"><i class="fas fa-microphone"></i></button>
            <button class="vroom-ctrl" id="voice-room-deafen" title="Deafen"><i class="fas fa-headphones"></i></button>
            <button class="vroom-ctrl" id="voice-room-cam" title="Kamera"><i class="fas fa-video-slash"></i></button>
            <button class="vroom-ctrl" id="voice-room-share" title="Share layar"><i class="fas fa-desktop"></i></button>
            <button class="vroom-ctrl" id="voice-room-sb" title="Soundboard"><i class="fas fa-music"></i></button>
            <div class="vroom-morewrap">
              <button class="vroom-ctrl" id="voice-room-more" title="Lainnya"><i class="fas fa-ellipsis-h"></i></button>
              <div class="vroom-menu" id="vroom-menu" style="display:none;">
                <button id="vroom-menu-server"><i class="fas fa-server"></i> Pengaturan server</button>
                <button id="vroom-menu-bug"><i class="fas fa-bug"></i> Lapor Bug</button>
              </div>
            </div>
            <button class="vroom-ctrl vroom-leave" id="voice-room-leave" title="Keluar"><i class="fas fa-phone-slash"></i></button>
          </div>` : `
          <div class="vroom-joinbar">
            <button class="dmsg-iconbtn" id="voice-room-join-mic" title="Gabung (mute)"><i class="fas fa-microphone"></i></button>
            <button class="btn btn-primary vroom-joinbtn" id="voice-room-join">Join Voice</button>
            <button class="dmsg-iconbtn" id="voice-room-join-sound" title="Gabung"><i class="fas fa-volume-up"></i></button>
          </div>`}
        </div>
        <div class="vroom-side">
          <div class="vroom-side-head"><i class="fas fa-comments"></i> Chat</div>
          <div id="channel-chat-mount"></div>
        </div>
      </div>
      <div id="voice-float-mount"></div>
    </div>`;

  if (inChannel) {
    document.getElementById('voice-room-mute').addEventListener('click', toggleMute);
    document.getElementById('voice-room-deafen').addEventListener('click', toggleDeafen);
    document.getElementById('voice-room-cam').addEventListener('click', toggleCamera);
    document.getElementById('voice-room-share').addEventListener('click', toggleScreen);
    document.getElementById('voice-room-sb').addEventListener('click', toggleSoundSheet);
    document.getElementById('voice-room-more').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRoomMenu();
    });
    document.getElementById('vroom-menu-server').addEventListener('click', () => {
      toggleRoomMenu(false);
      if (typeof openServerSettings === 'function') openServerSettings();
    });
    document.getElementById('vroom-menu-bug').addEventListener('click', () => {
      toggleRoomMenu(false);
      if (typeof openBugReportModal === 'function') openBugReportModal();
    });
    document.getElementById('voice-room-leave').addEventListener('click', async () => {
      await leaveVoiceChannel();
      renderVoiceRoom(channelId, communityId);
    });
    updateVideoButtons();
    updateDeafenButtons();
    startVoicePoll(channelId);
  } else {
    const doJoin = async (muted, btn) => {
      if (btn) {
        btn.disabled = true;
        btn.dataset.label = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Menghubungkan…';
      }
      try {
        const ok = await joinVoiceChannel(channelId, communityId);
        if (ok && muted && !isMuted) {
          try { await toggleMute(); } catch (_) {}
        }
      } finally {
        // Sukses → room render ulang; gagal → kembalikan tombol
        if (currentVoiceChannel !== channelId && btn) {
          btn.disabled = false;
          btn.innerHTML = btn.dataset.label || 'Join Voice';
        }
      }
      renderVoiceRoom(channelId, communityId);
    };
    document.getElementById('voice-room-join').addEventListener('click', (e) => doJoin(false, e.currentTarget));
    document.getElementById('voice-room-join-mic').addEventListener('click', (e) => doJoin(true, e.currentTarget));
    document.getElementById('voice-room-join-sound').addEventListener('click', (e) => doJoin(false, e.currentTarget));
  }

  if (typeof renderSoundboard === 'function') renderSoundboard('voice-float-mount', channelId);
  if (typeof loadChannelChat === 'function') loadChannelChat(channelId);

  vroomWake();
  await refreshVoiceUsers(channelId);
  await loadVoiceParty(channelId, communityId);
}

// Kembali ke daftar channel (room dibuka dari daftar channel)
function backToChannels() {
  try {
    const sb = document.getElementById('channel-sidebar');
    if (window.NobarlyMobile && window.NobarlyMobile.isMobile()) {
      if (sb) sb.style.display = 'flex';
      return;
    }
  } catch (_) {}
  if (typeof closeChannelSidebar === 'function') closeChannelSidebar();
}

// Menu ⋯ di bar kontrol voice (server, lapor bug)
function toggleRoomMenu(force) {
  try {
    const m = document.getElementById('vroom-menu');
    if (!m) return;
    const show = typeof force === 'boolean' ? force : (m.style.display === 'none');
    m.style.display = show ? 'block' : 'none';
  } catch (_) {}
}

document.addEventListener('click', (e) => {
  try {
    const m = document.getElementById('vroom-menu');
    if (m && m.style.display !== 'none' && !(e.target.closest && e.target.closest('.vroom-morewrap'))) {
      m.style.display = 'none';
    }
    // Klik backdrop panel floating → tutup
    if (e.target && e.target.id === 'voice-float-mount') toggleSoundSheet(false);
  } catch (_) {}
});

// Soundboard sebagai panel FLOATING (tengah di laptop, sheet di HP).
// Terkait channel voice aktif; tutup via ✕ / tombol soundboard / klik backdrop.
function toggleSoundSheet(force) {
  try {
    const mount = document.getElementById('voice-float-mount');
    if (!mount) return;
    const box = mount.querySelector('.soundboard-box');
    const show = typeof force === 'boolean' ? force : !(box && box.classList.contains('float-open'));
    if (box) box.classList.toggle('float-open', show);
    mount.classList.toggle('float-show', show);
  } catch (_) {}
}

// Drawer kontrol auto-hide ala Discord: hilang saat idle,
// muncul saat mouse gerak / sentuh / tekan tombol.
var vroomIdleTimer = null;
function vroomWake() {
  try {
    const room = document.querySelector('.voice-room.v2');
    if (!room) return;
    room.classList.remove('vroom-idle');
    if (vroomIdleTimer) clearTimeout(vroomIdleTimer);
    vroomIdleTimer = setTimeout(() => {
      const r = document.querySelector('.voice-room.v2');
      if (r) r.classList.add('vroom-idle');
    }, 3000);
  } catch (_) {}
}

document.addEventListener('mousemove', (e) => {
  try {
    if (e.target && e.target.closest && e.target.closest('.voice-room.v2')) vroomWake();
  } catch (_) {}
});
document.addEventListener('touchstart', (e) => {
  try {
    if (e.target && e.target.closest && e.target.closest('.voice-room.v2')) vroomWake();
  } catch (_) {}
}, { passive: true });
document.addEventListener('keydown', () => {
  try {
    if (document.querySelector('.voice-room.v2')) vroomWake();
  } catch (_) {}
});

// Grid member di voice room (dipanggil ulang tiap refresh).
async function renderVoiceRoomGrid(sessions) {
  const grid = document.getElementById('voice-room-grid');
  if (!grid || voiceRoomChannel == null) return;
  if (!sessions || sessions.length === 0) {
    grid.innerHTML = '<p class="no-comments" style="padding:16px;text-align:center;">Belum ada yang di sini!<br>Kalau siap ngobrol, langsung gabung. 🎧</p>';
    return;
  }
  let html = '';
  for (const s of sessions) {
    const profile = await voiceProfile(s.user_id);
    const name = profile?.username || 'Guest';
    const me = currentUser && s.user_id === currentUser.id;
    const isNew = !knownVoiceTiles[s.peer_id || s.user_id];
    knownVoiceTiles[s.peer_id || s.user_id] = true;
    html += `
      <div class="voice-tile ${me ? 'voice-tile-me' : ''}${s.is_muted ? ' muted' : ''}${isNew ? ' tile-new' : ''}" data-peer="${s.peer_id || ''}">
        ${avatarHtml(name, profile?.avatar_url || null, 'voice-tile-avatar', false)}
        <div class="voice-tile-namepill">${escapeHtml(name)}${me ? ' (kamu)' : ''}</div>
        <div class="voice-tile-state">${voiceStateIcons(!!s.is_video, !!s.is_muted)}</div>
      </div>`;
  }
  if (document.getElementById('voice-room-grid')) {
    document.getElementById('voice-room-grid').innerHTML = html;
  }
}

// Muat nobar yang ditempel ke voice channel ini (kalau ada).
async function loadVoiceParty(channelId, communityId) {
  const mount = document.getElementById('voice-party-mount');
  if (!mount) return;
  const { data: party } = await apiFetch(`/watch-parties/by-channel?channel_id=${channelId}`);
  if (!party) {
    mount.innerHTML = `
      <div class="voice-nobar-empty">
        <span><i class="fas fa-tv"></i> Belum ada nobar di voice ini.</span>
        <button class="btn btn-secondary" style="width:auto;padding:8px 14px;font-size:12px;" onclick="toggleVoiceNobarForm()">+ Mulai Nobar</button>
      </div>
      <div id="voice-nobar-form" style="display:none;">
        <div class="form-group">
          <label for="voice-nobar-title">Judul Nobar</label>
          <input type="text" id="voice-nobar-title" placeholder="Contoh: Nobar Final" maxlength="100">
        </div>
        <div class="form-group">
          <label for="voice-nobar-url">URL Stream</label>
          <input type="text" id="voice-nobar-url" placeholder="YouTube atau Twitch URL" inputmode="url">
        </div>
        <div class="form-group">
          <label for="voice-nobar-type">Platform</label>
          <select id="voice-nobar-type">
            <option value="youtube">YouTube</option>
            <option value="twitch">Twitch</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-voice-nobar-start"><i class="fas fa-play"></i> Mulai di Voice Ini</button>
      </div>`;
    document.getElementById('btn-voice-nobar-start').addEventListener('click', () => createVoiceNobar(channelId, communityId));
    return;
  }
  voiceRoomPartyId = party.id;
  // Catat sebagai party yang ditonton supaya sync + viewer_count seimbang
  // (dikurangi lagi otomatis saat pindah halaman via leaveWatchPartyCleanup).
  if (typeof currentWatchParty !== 'undefined' && currentWatchParty !== party.id) {
    currentWatchParty = party.id;
    try {
      await db.from('watch_parties').update({
        viewer_count: (party.viewer_count || 0) + 1
      }).eq('id', party.id);
    } catch (_) {}
  }
  const ytId = party.stream_type === 'youtube' && typeof extractYoutubeId === 'function'
    ? extractYoutubeId(party.stream_url) : null;
  // Desktop (file://): API player YouTube pasti Error 153 → paksa iframe biasa
  const noApi = (typeof isFileProtocol === 'function' && isFileProtocol());
  mount.innerHTML = `
    <div class="voice-party-live">
      <div class="voice-party-head">
        <span class="esports-status status-live">NOBAR</span>
        <b>${escapeHtml(party.title)}</b>
        <button class="post-action-btn" title="Tutup nobar (host)" onclick="endVoiceParty('${party.id}', '${channelId}', '${communityId || ''}')">✕</button>
      </div>
      <div class="watch-player-embed" id="voice-player-embed">
        ${(ytId && !noApi) ? '<div id="yt-player"></div>' : `<iframe src="${typeof getStreamEmbedUrl === 'function' ? getStreamEmbedUrl(party.stream_url, party.stream_type) : party.stream_url}" frameborder="0" allowfullscreen></iframe>`}
        <div id="reaction-float-layer"></div>
      </div>
      <div class="sync-row">
        <span id="sync-status"><i class="fas fa-link"></i> Menghubungkan sync...</span>
        <label class="sync-toggle" id="sync-toggle-wrap" style="display:none;">
          <input type="checkbox" id="follow-toggle" checked> Ikuti Host
        </label>
      </div>
    </div>`;
  const followToggle = document.getElementById('follow-toggle');
  if (followToggle) followToggle.addEventListener('change', (e) => { syncFollow = e.target.checked; });
  if (typeof initSyncPlayer === 'function') initSyncPlayer(party, ytId);
  // Kalibrasi jam sekali saat buka room
  try {
    const { data: t } = await apiFetch('/time');
    if (t && t.now && typeof clockOffsetMs !== 'undefined') clockOffsetMs = t.now - Date.now();
  } catch (_) {}
}

function toggleVoiceNobarForm() {
  const f = document.getElementById('voice-nobar-form');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function createVoiceNobar(channelId, communityId) {
  const title = document.getElementById('voice-nobar-title').value.trim();
  const url = document.getElementById('voice-nobar-url').value.trim();
  const type = document.getElementById('voice-nobar-type').value;
  if (!title || !url) { alert('Judul dan URL wajib diisi!'); return; }
  const { data, error } = await db.from('watch_parties').insert([{
    community_id: communityId || null,
    host_id: currentUser.id,
    title,
    stream_url: url,
    stream_type: type,
    is_live: true,
    viewer_count: 1,
    voice_channel_id: channelId
  }]);
  if (error || !data) { alert('Gagal membuat nobar: ' + (error?.message || 'unknown')); return; }
  await loadVoiceParty(channelId, communityId);
}

async function endVoiceParty(partyId, channelId, communityId) {
  if (!confirm('Akhiri nobar ini untuk semua?')) return;
  await apiFetch(`/watch-parties/${partyId}`, { method: 'PUT', body: JSON.stringify({ is_live: false }) });
  if (typeof destroySyncPlayer === 'function') destroySyncPlayer();
  voiceRoomPartyId = null;
  await loadVoiceParty(channelId, communityId || null);
}
