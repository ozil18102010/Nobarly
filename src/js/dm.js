// Pesan langsung + pertemanan (ala Discord).
var dmPeer = null;
var dmPoll = null;
var dmReplyTo = null;
var dmCache = {};
// Animasi pesan baru saja (anti-flicker)
var lastDmSeenId = null;
var lastDmSeenPeer = null;

function stopDM() {
  if (dmPoll) {
    clearInterval(dmPoll);
    dmPoll = null;
  }
  dmPeer = null;
  dmReplyTo = null;
  dmCache = {};
}

async function loadDMPage() {
  stopDM();
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');

  title.textContent = 'Pesan';
  actions.innerHTML = '';

  const me = currentUser.username || currentUser.email || 'User';
  const meAv = (typeof avatarHtml === 'function')
    ? avatarHtml(me, currentUser.avatar_url, 'dmsg-avatar', true)
    : `<div class="dmsg-avatar">${escapeHtml(me.charAt(0).toUpperCase())}<span class="status-dot"></span></div>`;
  // Kartu stream aktif: kalau sedang di voice, tampil paling atas
  let streamCard = '';
  try {
    if (typeof currentVoiceChannel !== 'undefined' && currentVoiceChannel && window._resumeVoice) {
      streamCard = `
        <div class="stream-card" onclick="resumeVoice()">
          <div class="stream-thumb"><i class="fas fa-volume-up"></i></div>
          <div class="stream-mid"><b>${escapeHtml(window._resumeVoice.name || 'Voice Channel')}</b><span>● LIVE — KAMU DI SINI</span></div>
          <span class="stream-live">LIVE</span>
        </div>`;
    }
  } catch (_) {}
  body.innerHTML = `
    <div class="dm-layout">
      <div class="dm-sidebar dmsg">
        <div class="dmsg-head">
          <h2>Messages</h2>
          <div class="dmsg-tools">
            <button class="dmsg-iconbtn" onclick="toggleDmSearch()" title="Cari"><i class="fas fa-search"></i></button>
            <button class="dmsg-addfriend" onclick="toggleDmSearch(true)"><i class="fas fa-user-plus"></i> Add Friends</button>
            <button class="dmsg-iconbtn dmsg-plus" onclick="toggleDmSearch(true)" title="Pesan baru"><i class="fas fa-plus"></i></button>
          </div>
        </div>
        <div class="dmsg-searchwrap" id="dm-searchwrap" style="display:none;">
          <input type="text" id="friend-search" placeholder="Cari username / email..." maxlength="50">
          <div id="friend-search-results"></div>
        </div>
        <div id="friend-requests"></div>
        <div id="dm-streamcard">${streamCard}</div>
        <div id="dm-convos"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
        <div id="friend-list"></div>
        <div class="dmsg-userbar">
          <div onclick="openProfileModal()" style="cursor:pointer;" title="Ganti foto profil">${meAv}</div>
          <div class="dmsg-me"><b>${escapeHtml(me)}</b><span>Online</span></div>
          <button class="dmsg-iconbtn" title="Lapor Bug" onclick="openBugReportModal()"><i class="fas fa-bug"></i></button>
        </div>
      </div>
      <div class="dm-main" id="dm-main">
        <div class="empty-state"><i class="fas fa-envelope"></i><h3>Pilih Teman</h3><p>Klik teman di kiri untuk mulai mengobrol.</p></div>
      </div>
    </div>`;

  await refreshFriendList();
}

// Badge unread (lokal per HP): bandingkan pesan terakhir vs waktu baca
function getReadTs(peerId) {
  try { return localStorage.getItem('nobarly_read_' + peerId) || ''; } catch (_) { return ''; }
}
function markDmRead(peerId) {
  try { localStorage.setItem('nobarly_read_' + peerId, new Date().toISOString()); } catch (_) {}
}
function isConvUnread(c) {
  try {
    return !c.is_mine && c.created_at && c.created_at > getReadTs(c.peer_id);
  } catch (_) { return false; }
}
function paintDmUnread(anyUnread) {
  try {
    const railDm = document.querySelector('#server-rail [data-rail="dm"]');
    if (railDm) railDm.classList.toggle('has-unread', !!anyUnread);
    const sideDm = document.querySelector('.sidebar-item[data-page="dm"]');
    if (sideDm) sideDm.classList.toggle('has-unread', !!anyUnread);
  } catch (_) {}
}

function toggleDmSearch(forceOpen) {
  const wrap = document.getElementById('dm-searchwrap');
  if (!wrap) return;
  const show = forceOpen === true ? true : (wrap.style.display === 'none');
  wrap.style.display = show ? 'block' : 'none';
  if (show) {
    const inp = document.getElementById('friend-search');
    if (inp) {
      if (!inp.dataset.bound) {
        inp.dataset.bound = '1';
        inp.addEventListener('input', (e) => {
          const q = e.target.value.trim();
          if (q.length >= 2) searchUsers(q);
          else document.getElementById('friend-search-results').innerHTML = '';
        });
      }
      inp.focus();
    }
  }
}

function closeDM() {
  stopDM();
  loadDMPage();
}

// Gaya Discord: 4d, 15d, 1mo
function dmTimeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff) || diff < 0) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd';
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + 'mo';
  return Math.floor(mo / 12) + 'y';
}

function dmSnippet(c) {
  let text = (c.content || '').trim();
  if (!text && c.image_url) text = '📷 Gambar';
  if (!text) text = 'Mulai mengobrol 👋';
  if (text.length > 42) text = text.slice(0, 42) + '…';
  const who = c.is_mine ? 'You' : (c.peer_username || 'User');
  return who + ': ' + text;
}

async function refreshFriendList() {
  const reqBox = document.getElementById('friend-requests');
  const convBox = document.getElementById('dm-convos');
  const listBox = document.getElementById('friend-list');
  if (!reqBox || !convBox || !listBox) return;

  const { data: rels } = await db.from('friends').select('*').eq('user_id', currentUser.id);
  const all = rels || [];
  const incoming = all.filter(r => r.status === 'pending' && r.addressee_id === currentUser.id);
  const friends = all.filter(r => r.status === 'accepted');

  reqBox.innerHTML = incoming.length === 0
    ? ''
    : `<div class="dmsg-section">PERMINTAAN • ${incoming.length}</div>` + incoming.map(r => `
      <div class="dmsg-row">
        ${avatarHtml(r.friend_username, r.friend_avatar, 'dmsg-avatar', false)}
        <div class="dmsg-mid"><b>${escapeHtml(r.friend_username || 'User')}</b><span>Mau berteman denganmu</span></div>
        <button class="btn btn-join dmsg-act" onclick="respondFriend('${r.id}', 'accepted')">Terima</button>
        <button class="post-action-btn" onclick="respondFriend('${r.id}', 'pending')">Tolak</button>
      </div>`).join('');

  // Percakapan terakhir (snippet + waktu ala Discord)
  let convos = [];
  try {
    const res = await apiFetch(`/dm/recent?user_id=${currentUser.id}`);
    convos = res.data || [];
  } catch (_) { convos = []; }
  const inConvo = new Set(convos.map(c => c.peer_id));
  let anyUnread = false;
  convBox.innerHTML = convos.length === 0
    ? '<p class="no-comments">Belum ada pesan. Cari teman di atas! 💬</p>'
    : convos.map(c => {
      const unread = isConvUnread(c);
      if (unread) anyUnread = true;
      return `
      <div class="dmsg-row ${dmPeer && dmPeer.id === c.peer_id ? 'friend-active' : ''}" onclick="openDM('${c.peer_id}', '${jsq(c.peer_username || 'User')}', '${jsq(c.peer_avatar || '')}', '${jsq(c.peer_last_seen || '')}', '${jsq(c.peer_status || 'online')}', '${jsq(c.peer_tag || '')}')">
        ${avatarHtml(c.peer_username, c.peer_avatar, 'dmsg-avatar', true, presenceOf(c.peer_status, c.peer_last_seen))}
        <div class="dmsg-mid"><b>${escapeHtml(c.peer_username || 'User')} ${tagHtml(c.peer_tag)}</b><span>${escapeHtml(dmSnippet(c))}</span></div>
        ${unread ? '<span class="unread-dot" title="Baru"></span>' : ''}
        <span class="dmsg-time">${dmTimeAgo(c.created_at)}</span>
      </div>`;
    }).join('');
  paintDmUnread(anyUnread);

  // Teman yang belum ada obrolan
  const fresh = friends.filter(r => !inConvo.has(r.friend_id));
  listBox.innerHTML = fresh.length === 0
    ? ''
    : `<div class="dmsg-section">TEMAN</div>` + fresh.map(r => `
      <div class="dmsg-row ${dmPeer && dmPeer.id === r.friend_id ? 'friend-active' : ''}" onclick="openDM('${r.friend_id}', '${jsq(r.friend_username || 'User')}', '${jsq(r.friend_avatar || '')}', '${jsq(r.friend_last_seen || '')}', '${jsq(r.friend_status || 'online')}', '${jsq(r.friend_tag || '')}')">
        ${avatarHtml(r.friend_username, r.friend_avatar, 'dmsg-avatar', true, presenceOf(r.friend_status, r.friend_last_seen))}
        <div class="dmsg-mid"><b>${escapeHtml(r.friend_username || 'User')} ${tagHtml(r.friend_tag)}</b><span>Mulai mengobrol 👋</span></div>
        <button class="post-action-btn" title="Hapus teman" onclick="event.stopPropagation();removeFriend('${r.id}')"><i class="fas fa-user-times"></i></button>
      </div>`).join('');
}

async function searchUsers(q) {
  const box = document.getElementById('friend-search-results');
  if (!box) return;
  const res = await fetch(API_BASE + `/profiles/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('nobarly_token') || ''}` }
  });
  const { data } = await res.json();
  const others = (data || []).filter(u => u.id !== currentUser.id);
  box.innerHTML = others.length === 0
    ? '<p class="no-comments">Tidak ketemu.</p>'
    : others.map(u => `
      <div class="dmsg-row">
        ${avatarHtml(u.username, u.avatar_url, 'dmsg-avatar', false)}
        <div class="dmsg-mid"><b>${escapeHtml(u.username)}</b><span>${escapeHtml(u.email || '')}</span></div>
        <button class="btn btn-join dmsg-act" onclick="sendFriendRequest('${u.id}')">+ Teman</button>
      </div>`).join('');
}

async function sendFriendRequest(friendId) {
  const { error } = await db.from('friends').insert([{ user_id: currentUser.id, friend_id: friendId }]);
  if (error) {
    alert(error.code === '23505' ? 'Sudah berteman / permintaan terkirim.' : 'Gagal: ' + error.message);
    return;
  }
  document.getElementById('friend-search-results').innerHTML = '';
  document.getElementById('friend-search').value = '';
  refreshFriendList();
}

async function respondFriend(relId, status) {
  // status 'accepted' = terima, 'pending' = tolak (dihapus server)
  const { error } = await db.from('friends').update({ status }).eq('id', relId);
  if (error) { alert('Gagal: ' + error.message); return; }
  refreshFriendList();
}

async function removeFriend(relId) {
  if (!confirm('Hapus teman ini?')) return;
  const { error } = await db.from('friends').delete().eq('id', relId).eq('user_id', currentUser.id);
  if (error) { alert('Gagal: ' + error.message); return; }
  refreshFriendList();
}

function openDM(friendId, username, avatar, lastSeen, pstatus, ptag) {
  // Tandai dibaca saat dibuka
  markDmRead(friendId);
  paintDmUnread(false);
  // Bisa dipanggil dari luar halaman Pesan (mis. halaman Profil):
  // pindah dulu ke halaman Pesan, baru buka chat.
  if (!document.getElementById('dm-main')) {
    window._pendingDM = { friendId, username, avatar, lastSeen, pstatus, ptag };
    const sideDm = document.querySelector('.sidebar-item[data-page="dm"]');
    if (sideDm) sideDm.click();
    else if (typeof renderPage === 'function') renderPage('dm');
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (document.getElementById('dm-main') || tries > 20) {
        clearInterval(timer);
        const p = window._pendingDM;
        window._pendingDM = null;
        if (p && document.getElementById('dm-main')) {
          openDM(p.friendId, p.username, p.avatar, p.lastSeen, p.pstatus, p.ptag);
        }
      }
    }, 250);
    return;
  }
  dmPeer = { id: friendId, username, avatar: avatar || null, lastSeen: lastSeen || null, status: pstatus || 'online', tag: ptag || null };
  refreshFriendList();
  const main = document.getElementById('dm-main');
  main.innerHTML = `
  <div class="dm-haspeer" id="dm-haspeer">
    <div class="dm-chatwrap">
    <div class="dm-header dmsg-chathead">
      <button class="dmsg-iconbtn" onclick="closeDM()" title="Kembali"><i class="fas fa-arrow-left"></i></button>
      ${(typeof avatarHtml === 'function' ? avatarHtml(username, (dmPeer && dmPeer.avatar) || null, 'dmsg-avatar sm', true, presenceOf(dmPeer && dmPeer.status, dmPeer && dmPeer.lastSeen)) : `<div class="dmsg-avatar sm">${escapeHtml(username.charAt(0).toUpperCase())}<span class="status-dot"></span></div>`)}
      <b>${escapeHtml(username)} ${tagHtml(dmPeer && dmPeer.tag)}</b>
      <button class="dmsg-iconbtn" title="Lihat profil" onclick="openProfile('${friendId}')" style="margin-left:auto;"><i class="fas fa-user"></i></button>
    </div>
    <div class="chat-messages dm-messages" id="dm-messages">
      <div class="loading-post"><div class="spinner" style="display:inline-block"></div> Memuat...</div>
    </div>
    <div class="chat-reply-preview" id="dm-reply-preview" style="display:none;"></div>
    <div class="typing-row" id="dm-typing"></div>
    <div class="chat-composer">
      <label class="chat-image-btn" id="dm-image-label" title="Kirim gambar">
        <i class="fas fa-image"></i>
        <input type="file" id="dm-image-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
      </label>
      <button class="chat-extra-btn" id="dm-nudge-btn" title="Colek ${escapeHtml(username)}">👉</button>
      <input type="text" id="dm-input" placeholder="Tulis pesan ke ${escapeHtml(username)}..." maxlength="2000">
      <button class="btn btn-primary" id="dm-send-btn"><i class="fas fa-paper-plane"></i></button>
    </div>
    </div>
    <div class="dm-peerpanel" id="dm-peerpanel">
      <div class="skeleton"></div><div class="skeleton"></div>
    </div>
  </div>`;

  document.getElementById('dm-send-btn').addEventListener('click', sendDMMessage);
  const dmNudge = document.getElementById('dm-nudge-btn');
  if (dmNudge) dmNudge.addEventListener('click', () => { if (typeof sendNudgeDM === 'function') sendNudgeDM(); });
  document.getElementById('dm-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendDMMessage();
  });
  document.getElementById('dm-input').addEventListener('input', () => {
    if (typeof sendTyping === 'function' && dmPeer) {
      sendTyping('dm', dmScopeKey(currentUser.id, dmPeer.id));
    }
  });
  document.getElementById('dm-image-input').addEventListener('change', (e) => {
    document.getElementById('dm-image-label')?.classList.toggle('has-file', !!(e.target.files[0]));
  });

  loadDMMessages(true);
  renderDmPeerPanel(friendId);
  if (dmPoll) clearInterval(dmPoll);
  dmPoll = setInterval(() => { if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return; if (dmPeer && dmPeer.id === friendId) loadDMMessages(false); }, 3000);
}

// Panel profil ringkas di kanan chat (khusus laptop, HP disembunyikan CSS)
async function renderDmPeerPanel(friendId) {
  const panel = document.getElementById('dm-peerpanel');
  if (!panel) return;
  try {
    const res = await db.from('profiles').select('*').eq('id', friendId).maybeSingle();
    const p = res.data;
    if (!p || !document.getElementById('dm-peerpanel')) return;
    const conns = parseConns(p.connections);
    const chips = CONN_KEYS.filter(k => conns[k.id]).map(k =>
      `<span class="conn-chip conn-${k.id}">${k.label}</span>`
    ).join('') || '<p class="no-comments">—</p>';
    panel.innerHTML = `
      ${bannerHtml(p.banner)}
      <div class="pf-card">
        <div class="pf-avatarrow">
          ${avatarHtml(p.username, p.avatar_url, 'dmsg-avatar pf-avatar' + (p.avatar_frame ? ' avframe-' + p.avatar_frame : ''), true, presenceOf(p.status, p.last_seen))}
        </div>
        <div class="pf-body">
          <h2>${escapeHtml(p.username)} ${tagHtml(p.server_tag)}</h2>
          <div class="pf-status">${statusLabel(p)}</div>
          <div class="pf-section">
            <div class="pf-section-title">BIO</div>
            <div class="pf-bio">${escapeHtml(p.bio || 'Belum ada bio.')}</div>
          </div>
          <div class="pf-section">
            <div class="pf-section-title">CONNECTIONS</div>
            <div class="conn-chips">${chips}</div>
          </div>
          <div class="pf-section">
            <button class="btn btn-secondary" style="width:100%;" onclick="openProfile('${p.id}')">Lihat Profil Lengkap</button>
          </div>
        </div>
      </div>`;
  } catch (_) {}
}

async function loadDMMessages(scrollBottom) {
  if (!dmPeer) return;
  const box = document.getElementById('dm-messages');
  if (!box) return;
  const [{ data: messages }, tp] = await Promise.all([
    apiFetch(`/dm?user_id=${currentUser.id}&peer_id=${dmPeer.id}`),
    apiFetch(`/typing?scope=dm&scope_id=${encodeURIComponent(dmScopeKey(currentUser.id, dmPeer.id))}&user_id=${currentUser.id}`)
  ]);
  const tbox = document.getElementById('dm-typing');
  if (tbox) {
    try { tbox.innerHTML = typingHtml(tp.data); } catch (_) {}
  }
  const list = messages || [];
  try { if (typeof watchNudge === 'function' && dmPeer) watchNudge(list, '_nudgeSeenDm_' + dmPeer.id); } catch (_) {}
  if (list.length === 0) {
    box.innerHTML = '<p class="no-comments" style="padding:20px;">Belum ada pesan. Sapa duluan! 👋</p>';
    return;
  }
  const wasAtBottom = box.scrollHeight - box.scrollTop <= box.clientHeight + 80;
  box.innerHTML = list.map(m => {
    dmCache[m.id] = m;
    const isMe = m.sender_id === currentUser.id;
    const time = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const img = m.image_url
      ? `<img class="watch-chat-img" src="${escapeHtml(imageSrc(m.image_url))}" loading="lazy" onclick="openImageViewer('${jsq(m.image_url)}')">`
      : '';
    // Colek (social.js): kartu goyang, bukan teks mentah "[nudge]"
    let text = m.content ? `<p class="watch-chat-text">${escapeHtml(m.content)}</p>` : '';
    try {
      if (typeof isNudgeContent === 'function' && isNudgeContent(m.content)) {
        text = nudgeCardHtml(isMe ? null : (dmPeer && dmPeer.username), isMe);
      }
    } catch (_) {}
    const quote = m.reply_to
      ? `<div class="chat-reply-quote"><b>${escapeHtml(m.reply_username || 'User')}</b>: ${escapeHtml((m.reply_content || '').slice(0, 120))}</div>`
      : '';
    return `
      <div class="watch-chat-msg ${isMe ? 'watch-chat-msg-me' : ''}">
        <span class="watch-chat-time">${time}</span>
        ${quote}${text}${img}
        <div class="chat-msg-actions">
          <button class="post-action-btn" title="Balas" onclick="startDmReply('${m.id}')"><i class="fas fa-reply"></i></button>
        </div>
      </div>`;
  }).join('');
  // Animasikan HANYA pesan paling baru (kalau benar-benar baru)
  try {
    const last = list[list.length - 1];
    if (lastDmSeenPeer !== dmPeer.id) {
      lastDmSeenPeer = dmPeer.id;
      lastDmSeenId = last ? last.id : null;
    } else if (last && last.id !== lastDmSeenId) {
      lastDmSeenId = last.id;
      const el = box.lastElementChild;
      if (el) el.classList.add('msg-new');
    }
  } catch (_) {}
  if (scrollBottom || wasAtBottom) box.scrollTop = box.scrollHeight;
}

function startDmReply(messageId) {
  const m = dmCache[messageId];
  if (!m) return;
  dmReplyTo = messageId;
  const preview = document.getElementById('dm-reply-preview');
  if (!preview) return;
  let snippet = escapeHtml(((m.content || '').slice(0, 80))) || '(gambar)';
  try { if (typeof isNudgeContent === 'function' && isNudgeContent(m.content)) snippet = '👉 Colekan'; } catch (_) {}
  const who = m.sender_id === currentUser.id ? 'diri sendiri' : escapeHtml(dmPeer ? dmPeer.username : 'User');
  preview.style.display = 'flex';
  preview.innerHTML = `
    <span><i class="fas fa-reply"></i> Membalas <b>${who}</b>: ${snippet}</span>
    <button class="post-action-btn" onclick="cancelDmReply()"><i class="fas fa-times"></i></button>`;
  document.getElementById('dm-input')?.focus();
}

function cancelDmReply() {
  dmReplyTo = null;
  const preview = document.getElementById('dm-reply-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

async function sendDMMessage() {
  if (!dmPeer) return;
  const input = document.getElementById('dm-input');
  if (!input) return;
  const fileInput = document.getElementById('dm-image-input');
  const content = input.value.trim();
  const imageFile = fileInput ? fileInput.files[0] : null;
  if (!content && !imageFile) return;

  let imageUrl = null;
  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile);
    } catch (e) {
      alert('Gagal upload gambar: ' + e.message);
      return;
    }
  }

  const { error } = await apiFetch('/dm', {
    method: 'POST',
    body: JSON.stringify({ sender_id: currentUser.id, receiver_id: dmPeer.id, content: content || null, image_url: imageUrl, reply_to: dmReplyTo })
  });
  if (error) { alert('Gagal mengirim: ' + error.message); return; }

  input.value = '';
  if (fileInput) {
    fileInput.value = '';
    document.getElementById('dm-image-label')?.classList.remove('has-file');
  }
  markDmRead(dmPeer.id);
  cancelDmReply();
  loadDMMessages(true);
}
