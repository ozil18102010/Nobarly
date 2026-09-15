// Soundboard Nobarly: efek suara hasil synth WebAudio (tanpa file audio,
// jadi jalan offline di PC maupun HP). Bunyi dimainkan lokal + disiarkan
// sebagai event ke semua member voice channel (mereka ikut dengar).
var lastSoundSeenAt = null;
var soundboardChannel = null;
var _audioCtx = null;

const SOUNDS = [
  { id: 'airhorn', icon: '📯', label: 'Air Horn' },
  { id: 'clap', icon: '👏', label: 'Clap' },
  { id: 'boo', icon: '👎', label: 'Boo' },
  { id: 'drum', icon: '🥁', label: 'Drum' },
  { id: 'laugh', icon: '😂', label: 'Laugh' },
  { id: 'wow', icon: '✨', label: 'Wow' }
];

function audioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Mainkan satu efek secara lokal. Pure WebAudio, tanpa aset.
function playSoundLocal(soundId) {
  const ctx = audioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  if (soundId === 'airhorn') {
    // Klakson: dua saw detune + vibrato, ~1 detik
    [0, 1].forEach((_, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = idx === 0 ? 392 : 415;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 28;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.05);
      g.gain.setValueAtTime(0.5, t0 + 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2800;
      osc.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + 1.05);
      lfo.stop(t0 + 1.05);
    });
  } else if (soundId === 'clap') {
    // Tepuk: 4 burst noise bandpass beruntun
    for (let i = 0; i < 4; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.09);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1600;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      const at = t0 + i * 0.11;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.6, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      src.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      src.start(at);
    }
  } else if (soundId === 'boo') {
    // Boo: noise lowpass + nada turun
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 1.0);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.1);
    g.gain.setValueAtTime(0.5, t0 + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, t0);
    osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.9);
    const og = ctx.createGain();
    og.gain.value = 0.25;
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.0);
  } else if (soundId === 'drum') {
    // Drum: sine drop 150 -> 45 Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.5);
  } else if (soundId === 'laugh') {
    // Tawa: 6 blip kotak menurun
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 620 - i * 55;
      const g = ctx.createGain();
      const at = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.09);
    }
  } else if (soundId === 'wow') {
    // Wow: sine naik + shimmer
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(820, t0 + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.08);
    g.gain.setValueAtTime(0.4, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.65);
  }
}

function renderSoundboard(mountId, channelId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  if (soundboardChannel !== channelId) {
    soundboardChannel = channelId;
    lastSoundSeenAt = new Date().toISOString();
  }
  mount.innerHTML = `
    <div class="soundboard-box">
      <div class="soundboard-head">
        <div class="channel-section-title" style="margin:0;"><i class="fas fa-music"></i> Soundboard</div>
        <button class="dmsg-iconbtn" title="Tutup" onclick="toggleSoundSheet(false)"><i class="fas fa-times"></i></button>
      </div>
      <div class="comm-search">
        <input type="text" id="sound-search" placeholder="🔍 Cari suara..." maxlength="30">
      </div>
      <div class="soundboard-grid">
        ${SOUNDS.map(s => `
          <button class="sound-btn" data-label="${s.label.toLowerCase()}" onclick="playSoundboard('${channelId}', '${s.id}')" title="${s.label}">
            <span class="sound-emoji">${s.icon}</span>
            <span class="sound-label">${s.label}</span>
          </button>`).join('')}
      </div>
    </div>`;
  const si = document.getElementById('sound-search');
  if (si) si.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    mount.querySelectorAll('.sound-btn').forEach(b => {
      b.style.display = !q || (b.dataset.label || '').includes(q) ? '' : 'none';
    });
  });
}

// Tekan tombol: bunyi lokal langsung + siarkan event biar member lain ikut dengar.
async function playSoundboard(channelId, soundId) {
  playSoundLocal(soundId);
  try {
    await apiFetch('/voice/sounds', {
      method: 'POST',
      body: JSON.stringify({
        channel_id: channelId,
        user_id: currentUser ? currentUser.id : null,
        username: currentUser ? (currentUser.username || currentUser.email) : 'User',
        sound: soundId
      })
    });
  } catch (_) {}
}

// Dipolling bareng daftar voice: mainkan event baru dari member lain.
async function pollVoiceSounds(channelId) {
  if (soundboardChannel !== channelId) {
    soundboardChannel = channelId;
    lastSoundSeenAt = new Date().toISOString();
    return;
  }
  try {
    const { data: events } = await apiFetch(`/voice/sounds?channel_id=${channelId}&limit=20`);
    if (!events) return;
    const fresh = events.filter(e =>
      new Date(e.created_at) > new Date(lastSoundSeenAt) &&
      (!currentUser || e.user_id !== currentUser.id)
    );
    if (fresh.length > 0) {
      const sorted = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      lastSoundSeenAt = sorted[sorted.length - 1].created_at;
      fresh.slice(-4).forEach(e => playSoundLocal(e.sound));
    }
  } catch (_) {}
}
