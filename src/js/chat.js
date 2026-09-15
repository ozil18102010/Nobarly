// Obrolan real-time channel (ala Discord) + reaksi emoji.
var channelChatPoll = null;
var chatReplyTo = null;
var activeChatChannel = null;
var chatCache = {};
// Animasi pesan baru saja (anti-flicker): ingat id terakhir per channel
var lastChatSeenId = null;
var lastChatSeenCh = null;

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '🎮'];

function renderChannelView(channelId, communityId) {
  stopChannelChat();
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');

  title.textContent = 'Text Channel';
  actions.innerHTML = '';

  body.innerHTML = '<div id="channel-chat-mount"></div>';
  loadChannelChat(channelId);
}

function stopChannelChat() {
  if (channelChatPoll) {
    clearInterval(channelChatPoll);
    channelChatPoll = null;
  }
  chatReplyTo = null;
  activeChatChannel = null;
}

async function loadChannelChat(channelId) {
  activeChatChannel = channelId;
  const mount = document.getElementById('channel-chat-mount');
  if (!mount) return;

  mount.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-messages" id="chat-messages">
        <div class="loading-post"><div class="spinner" style="display:inline-block"></div> Memuat obrolan...</div>
      </div>
      <div class="typing-row" id="chat-typing"></div>
      <div class="chat-reply-preview" id="chat-reply-preview" style="display:none;"></div>
      <div class="chat-composer">
        <label class="chat-image-btn" id="chat-image-label" title="Kirim gambar">
          <i class="fas fa-image"></i>
          <input type="file" id="chat-image-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
        </label>
        <button class="chat-extra-btn" id="chat-poll-btn" title="Buat polling">📊</button>
        <button class="chat-extra-btn" id="chat-nudge-btn" title="Colek teman">👉</button>
        <input type="text" id="chat-input" placeholder="Tulis pesan... (/poll untuk voting)" maxlength="2000">
        <button class="btn btn-primary" id="chat-send-btn"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>`;

  document.getElementById('chat-send-btn').addEventListener('click', () => sendChannelMessage(channelId));
  const pollBtn = document.getElementById('chat-poll-btn');
  if (pollBtn) pollBtn.addEventListener('click', () => { if (typeof openPollModal === 'function') openPollModal(channelId); });
  const nudgeBtn = document.getElementById('chat-nudge-btn');
  if (nudgeBtn) nudgeBtn.addEventListener('click', () => { if (typeof sendNudgeChannel === 'function') sendNudgeChannel(channelId); });
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChannelMessage(channelId);
  });
  document.getElementById('chat-input').addEventListener('input', () => {
    if (typeof sendTyping === 'function') sendTyping('channel', channelId);
  });
  document.getElementById('chat-image-input').addEventListener('change', (e) => {
    const label = document.getElementById('chat-image-label');
    if (label) label.classList.toggle('has-file', !!(e.target.files[0]));
  });

  await refreshChannelMessages(channelId, true);

  if (channelChatPoll) clearInterval(channelChatPoll);
  channelChatPoll = setInterval(() => {
    if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return;
    if (activeChatChannel === channelId) refreshChannelMessages(channelId, false);
  }, 3000);
}

async function refreshChannelMessages(channelId, scrollBottom) {
  const container = document.getElementById('chat-messages');
  if (!container || activeChatChannel !== channelId) return;

  const { data: messages } = await db.from('channel_messages').select('*').eq('channel_id', channelId).limit(50);

  if (!messages || messages.length === 0) {
    container.innerHTML = '<p class="no-comments" style="padding:20px;">Belum ada pesan. Mulai obrolan! 🎮</p>';
    return;
  }

  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;

  let html = '';
  let lastDay = '';
  for (const m of messages) {
    chatCache[m.id] = m;
    const dkey = new Date(m.created_at).toDateString();
    if (dkey !== lastDay) {
      lastDay = dkey;
      html += `<div class="day-divider"><span>${dayLabel(m.created_at)}</span></div>`;
    }
    html += renderChatMessage(m);
  }
  container.innerHTML = html;

  // Animasikan HANYA pesan paling baru (kalau benar-benar baru)
  try {
    const last = messages[messages.length - 1];
    if (lastChatSeenCh !== channelId) {
      lastChatSeenCh = channelId;
      lastChatSeenId = last ? last.id : null;
    } else if (last && last.id !== lastChatSeenId) {
      lastChatSeenId = last.id;
      const el = container.lastElementChild;
      if (el) el.classList.add('msg-new');
    }
  } catch (_) {}

  // Colek masuk → efek getar+goyang sekali (social.js)
  try { if (typeof watchNudge === 'function') watchNudge(messages, '_nudgeSeenCh_' + channelId); } catch (_) {}

  // v2.0: 1 request untuk SEMUA reaksi (dulu 1 request per pesan tiap 3 detik)
  // + indikator mengetik (best-effort, gagal = kosong)
  try {
    const [{ data: allReactions }, tp] = await Promise.all([
      apiFetch(`/chat/reactions?channel_id=${encodeURIComponent(channelId)}`),
      apiFetch(`/typing?scope=channel&scope_id=${encodeURIComponent(channelId)}&user_id=${currentUser ? currentUser.id : ''}`)
    ]);
    for (const m of messages) {
      renderMessageReactions(m.id, (allReactions && allReactions[m.id]) || []);
    }
    const tbox = document.getElementById('chat-typing');
    if (tbox) tbox.innerHTML = typingHtml(tp.data);
  } catch (_) {
    for (const m of messages) {
      updateMessageReactions(m.id);
    }
  }

  if (scrollBottom || wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function renderMessageReactions(messageId, reactions) {
  const bar = document.getElementById(`reactions-${messageId}`);
  if (!bar) return;
  if (!reactions || reactions.length === 0) {
    bar.innerHTML = '';
    return;
  }
  const grouped = {};
  for (const r of reactions) {
    grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.username || 'User');
    if (currentUser && r.user_id === currentUser.id) grouped[r.emoji].mine = true;
  }
  bar.innerHTML = Object.entries(grouped).map(([emoji, g]) =>
    `<button class="reaction-chip ${g.mine ? 'reaction-mine' : ''}" title="${escapeHtml(g.users.join(', '))}" onclick="toggleChatReaction('${messageId}', '${jsq(emoji)}')">${escapeHtml(emoji)} ${g.count}</button>`
  ).join('');
  // Poll: gambar batang vote dari reaksi yang sama (tanpa request tambahan)
  try { if (typeof paintPollBars === 'function') paintPollBars(messageId, grouped); } catch (_) {}
}

function renderChatMessage(m) {
  const name = m.username || 'User';
  const time = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const isMe = currentUser && m.user_id === currentUser.id;
  const replyHtml = m.reply_to
    ? `<div class="chat-reply-quote"><b>${escapeHtml(m.reply_username || 'User')}</b>: ${escapeHtml((m.reply_content || '').slice(0, 120))}</div>`
    : '';
  const imgHtml = m.image_url
    ? `<img class="watch-chat-img" src="${escapeHtml(imageSrc(m.image_url))}" alt="Gambar" loading="lazy" onclick="openImageViewer('${jsq(m.image_url)}')">`
    : '';
  // Fitur sosial (social.js): colek → kartu goyang, /poll → kartu voting
  let textHtml = m.content ? `<p class="watch-chat-text">${escapeHtml(m.content)}</p>` : '';
  try {
    if (typeof isNudgeContent === 'function' && isNudgeContent(m.content)) {
      textHtml = nudgeCardHtml(name, isMe);
    } else if (typeof parsePoll === 'function') {
      const poll = parsePoll(m.content);
      if (poll) textHtml = pollCardHtml(m.id, poll);
    }
  } catch (_) {}
  const editedTag = m.edited_at ? ' <span class="edited-tag">(diedit)</span>' : '';

  return `
    <div class="chat-msg" id="chat-msg-${m.id}">
      <div onclick="openMiniProfile('${m.user_id || ''}', this)" style="cursor:pointer;flex-shrink:0;" title="Lihat profil">${avatarHtml(name, m.avatar_url, 'voice-user-avatar', false)}</div>
      <div class="chat-msg-body">
        <span class="comment-author">${escapeHtml(name)}</span>
        <span class="comment-time">${time}${editedTag}</span>
        ${replyHtml}
        ${textHtml}
        ${imgHtml}
        <div class="chat-msg-reactions" id="reactions-${m.id}"></div>
        <div class="chat-msg-actions">
          <button class="post-action-btn" title="Balas" onclick="startChatReply('${m.id}')"><i class="fas fa-reply"></i></button>
          ${m.content ? `<button class="post-action-btn" title="Salin" onclick="copyChatText('${m.id}')"><i class="fas fa-copy"></i></button>` : ''}
          ${QUICK_EMOJIS.slice(0, 3).map(e => `<button class="post-action-btn" onclick="toggleChatReaction('${m.id}', '${e}')">${e}</button>`).join('')}
          ${isMe && m.content ? `<button class="post-action-btn" title="Edit" onclick="editChannelMessage('${m.id}')"><i class="fas fa-pen"></i></button>` : ''}
          ${isMe ? `<button class="post-action-btn" onclick="deleteChannelMessage('${m.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

// Label hari ala Discord: Hari ini / Kemarin / 12 Sep 2026
function dayLabel(ts) {
  try {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, today)) return 'Hari ini';
    if (sameDay(d, yesterday)) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

// Salin teks pesan (clipboard + fallback HP tua)
function copyChatText(messageId) {
  const m = chatCache[messageId];
  if (!m || !m.content) return;
  const done = () => {
    try {
      const btn = document.querySelector(`#chat-msg-${messageId} [title="Salin"]`);
      if (btn) {
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = old; }, 1200);
      }
    } catch (_) {}
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(m.content).then(done).catch(() => fallbackCopy(m.content, done));
    } else {
      fallbackCopy(m.content, done);
    }
  } catch (_) {
    fallbackCopy(m.content, done);
  }
}

function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    if (done) done();
  } catch (_) {}
}

// Edit pesan sendiri via modal (prompt() mati di WebView HP)
function editChannelMessage(messageId) {
  const m = chatCache[messageId];
  if (!m || !m.content) return;
  let overlay = document.getElementById('editmsg-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'editmsg-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>✏️ Edit Pesan</h3>
          <button class="modal-close" id="editmsg-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-error" id="editmsg-error"></div>
          <div class="form-group">
            <textarea id="editmsg-input" rows="3" maxlength="2000" style="width:100%;background:#1a1a1a;border:1px solid #333;color:#fff;padding:10px;font-family:inherit;font-size:13px;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="editmsg-cancel">Batal</button>
          <button class="btn btn-primary" id="editmsg-save" style="width:auto;">Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  const errBox = document.getElementById('editmsg-error');
  errBox.classList.remove('show');
  errBox.textContent = '';
  const input = document.getElementById('editmsg-input');
  input.value = m.content || '';
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 100);
  document.getElementById('editmsg-close').onclick = () => overlay.classList.remove('active');
  document.getElementById('editmsg-cancel').onclick = () => overlay.classList.remove('active');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
  document.getElementById('editmsg-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const content = input.value.trim();
    if (!content) {
      errBox.textContent = 'Pesan tidak boleh kosong!';
      errBox.classList.add('show');
      return;
    }
    btn.disabled = true;
    try {
      const { error } = await db.from('channel_messages').update({ content }).eq('id', messageId).eq('user_id', currentUser.id);
      if (error) throw new Error(error.message);
      overlay.classList.remove('active');
      if (activeChatChannel) refreshChannelMessages(activeChatChannel, false);
    } catch (err) {
      errBox.textContent = 'Gagal menyimpan: ' + (err.message || err);
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
    }
  };
}

async function updateMessageReactions(messageId) {
  const bar = document.getElementById(`reactions-${messageId}`);
  if (!bar) return;
  const { data: reactions } = await db.from('message_reactions').select('*').eq('message_id', messageId);
  if (!reactions || reactions.length === 0) {
    bar.innerHTML = '';
    return;
  }
  const grouped = {};
  for (const r of reactions) {
    grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.username || 'User');
    if (currentUser && r.user_id === currentUser.id) grouped[r.emoji].mine = true;
  }
  bar.innerHTML = Object.entries(grouped).map(([emoji, g]) =>
    `<button class="reaction-chip ${g.mine ? 'reaction-mine' : ''}" title="${escapeHtml(g.users.join(', '))}" onclick="toggleChatReaction('${messageId}', '${jsq(emoji)}')">${escapeHtml(emoji)} ${g.count}</button>`
  ).join('');
  try { if (typeof paintPollBars === 'function') paintPollBars(messageId, grouped); } catch (_) {}
}

async function toggleChatReaction(messageId, emoji) {
  await db.from('message_reactions').insert([{ message_id: messageId, user_id: currentUser.id, emoji }]);
  updateMessageReactions(messageId);
}

function startChatReply(messageId) {
  const m = chatCache[messageId];
  if (!m) return;
  chatReplyTo = messageId;
  const preview = document.getElementById('chat-reply-preview');
  if (!preview) return;
  let snippet = escapeHtml((m.content || '').slice(0, 80)) || '(gambar)';
  try { if (typeof isNudgeContent === 'function' && isNudgeContent(m.content)) snippet = '👉 Colekan'; } catch (_) {}
  try { if (typeof parsePoll === 'function' && parsePoll(m.content)) snippet = '📊 ' + (parsePoll(m.content).question || 'Polling'); } catch (_) {}
  preview.style.display = 'flex';
  preview.innerHTML = `
    <span><i class="fas fa-reply"></i> Membalas <b>${escapeHtml(m.username || 'User')}</b>: ${snippet}</span>
    <button class="post-action-btn" onclick="cancelChatReply()"><i class="fas fa-times"></i></button>`;
  document.getElementById('chat-input')?.focus();
}

function cancelChatReply() {
  chatReplyTo = null;
  const preview = document.getElementById('chat-reply-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

async function sendChannelMessage(channelId) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const fileInput = document.getElementById('chat-image-input');
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

  const { error } = await db.from('channel_messages').insert([{
    channel_id: channelId,
    user_id: currentUser.id,
    content: content || null,
    image_url: imageUrl,
    reply_to: chatReplyTo
  }]);

  if (error) { alert('Gagal mengirim pesan: ' + error.message); return; }

  input.value = '';
  if (fileInput) {
    fileInput.value = '';
    document.getElementById('chat-image-label')?.classList.remove('has-file');
  }
  cancelChatReply();
  refreshChannelMessages(channelId, true);
}

async function deleteChannelMessage(messageId) {
  if (!confirm('Hapus pesan ini?')) return;
  const { error } = await db.from('channel_messages').delete().eq('id', messageId).eq('user_id', currentUser.id);
  if (error) { alert('Gagal menghapus: ' + error.message); return; }
  if (activeChatChannel) refreshChannelMessages(activeChatChannel, false);
}
