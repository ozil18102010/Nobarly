// Linimasa singkat (ala X): shout 280 char + gambar, like, repost, follow, trending.
var timelineMode = 'feed'; // 'feed' (following) | 'all'
var timelineTag = null;
var myFollowIds = new Set();

async function loadTimelinePage() {
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');

  title.textContent = 'Linimasa';
  actions.innerHTML = `
    <button class="btn btn-secondary" id="tl-tab-feed"><i class="fas fa-users"></i> Mengikuti</button>
    <button class="btn btn-secondary" id="tl-tab-all"><i class="fas fa-globe"></i> Semua</button>`;

  body.innerHTML = `
    <div class="timeline-layout">
      <div class="timeline-main">
        <div class="shout-composer">
          <textarea id="shout-input" rows="3" maxlength="280" placeholder="Lagi apa, gamer? (maks 280 karakter)"></textarea>
          <img id="shout-preview" class="post-upload-preview" style="display:none;" alt="Pratinjau">
          <div class="shout-composer-bar">
            <label class="chat-image-btn" id="shout-image-label" title="Tambah gambar">
              <i class="fas fa-image"></i>
              <input type="file" id="shout-image-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
            </label>
            <span class="shout-counter" id="shout-counter">280</span>
            <button class="btn btn-primary" id="shout-send-btn" style="width:auto;padding:8px 20px;">Shout!</button>
          </div>
        </div>
        <div id="timeline-tag-filter" style="display:none;"></div>
        <div id="timeline-feed"><div class="loading-post"><div class="spinner" style="display:inline-block"></div> Memuat...</div></div>
      </div>
      <div class="timeline-side">
        <div class="channel-section-title"><i class="fas fa-fire"></i> Trending</div>
        <div id="trending-box"><p class="no-comments">Memuat...</p></div>
      </div>
    </div>`;

  document.getElementById('tl-tab-feed').addEventListener('click', () => { timelineMode = 'feed'; timelineTag = null; refreshTimeline(); });
  document.getElementById('tl-tab-all').addEventListener('click', () => { timelineMode = 'all'; timelineTag = null; refreshTimeline(); });

  const shoutInput = document.getElementById('shout-input');
  shoutInput.addEventListener('input', () => {
    document.getElementById('shout-counter').textContent = 280 - shoutInput.value.length;
  });
  document.getElementById('shout-image-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('shout-preview');
    const label = document.getElementById('shout-image-label');
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
      label?.classList.add('has-file');
    } else {
      preview.src = '';
      preview.style.display = 'none';
      label?.classList.remove('has-file');
    }
  });
  document.getElementById('shout-send-btn').addEventListener('click', sendShout);

  // Cache follow saya untuk tombol follow/unfollow (1 request saja)
  try {
    const { data } = await apiFetch(`/follows?follower_id=${currentUser.id}`);
    myFollowIds = new Set((data || []).map(f => f.followed_id));
  } catch (_) { myFollowIds = new Set(); }

  await refreshTimeline();
}

async function refreshTimeline() {
  const feed = document.getElementById('timeline-feed');
  if (!feed) return;
  const url = timelineMode === 'feed'
    ? `/shouts?feed_for=${currentUser.id}&me=${currentUser.id}`
    : `/shouts?me=${currentUser.id}`;
  const { data: shouts, error } = await apiFetch(url);
  if (error) {
    feed.innerHTML = `<div class="empty-state"><h3>Gagal memuat</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  renderTrending(shouts || []);

  let list = shouts || [];
  const tagBox = document.getElementById('timeline-tag-filter');
  if (timelineTag) {
    list = list.filter(s => (s.content || '').toLowerCase().includes('#' + timelineTag.toLowerCase()));
    if (tagBox) {
      tagBox.style.display = 'block';
      tagBox.innerHTML = `<div class="tag-filter-bar">Tagar <b>#${escapeHtml(timelineTag)}</b> <button class="post-action-btn" onclick="clearTimelineTag()"><i class="fas fa-times"></i></button></div>`;
    }
  } else if (tagBox) {
    tagBox.style.display = 'none';
    tagBox.innerHTML = '';
  }

  if (list.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-bolt"></i>
        <h3>${timelineMode === 'feed' ? 'Linimasa masih sepi' : 'Belum ada shout'}</h3>
        <p>${timelineMode === 'feed' ? 'Follow gamer lain atau buat shout pertamamu!' : 'Jadilah yang pertama bershout!'}</p>
      </div>`;
    return;
  }

  feed.innerHTML = list.map(renderShoutCard).join('');
}

function clearTimelineTag() {
  timelineTag = null;
  refreshTimeline();
}

function filterTimelineTag(tag) {
  timelineTag = tag;
  refreshTimeline();
}

function renderTrending(shouts) {
  const box = document.getElementById('trending-box');
  if (!box) return;
  const counts = {};
  for (const s of shouts) {
    const tags = (s.content || '').match(/#(\w+)/g) || [];
    for (const t of tags) {
      const key = t.slice(1).toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  box.innerHTML = top.length === 0
    ? '<p class="no-comments">Belum ada tagar.</p>'
    : top.map(([tag, c]) => `
      <div class="trend-row" onclick="filterTimelineTag('${jsq(tag)}')">
        <b>#${escapeHtml(tag)}</b><span>${c} shout</span>
      </div>`).join('');
}

function linkifyShout(text) {
  let out = escapeHtml(text);
  out = out.replace(/#(\w+)/g, '<a href="#" class="shout-tag" onclick="event.preventDefault();filterTimelineTag(\'$1\')">#$1</a>');
  out = out.replace(/@([\w.]+)/g, '<span class="shout-mention">@$1</span>');
  return out;
}

function renderShoutCard(s) {
  const name = s.username || 'User';
  const initial = (name.charAt(0) || '?').toUpperCase();
  const timeAgo = typeof getTimeAgo === 'function' ? getTimeAgo(s.created_at) : '';
  const isMe = currentUser && s.user_id === currentUser.id;
  const imgHtml = s.image_url
    ? `<img class="post-image" src="${escapeHtml(imageSrc(s.image_url))}" loading="lazy" onclick="openImageViewer('${jsq(s.image_url)}')">`
    : '';
  const repostHtml = s.repost
    ? `<div class="repost-box">
         <span class="comment-author">${escapeHtml(s.repost.username || 'User')}</span>
         <p class="post-content">${linkifyShout(s.repost.content || '')}</p>
         ${s.repost.image_url ? `<img class="post-image" src="${escapeHtml(imageSrc(s.repost.image_url))}" loading="lazy" onclick="openImageViewer('${jsq(s.repost.image_url)}')">` : ''}
       </div>`
    : '';
  const followBtn = (!isMe)
    ? (myFollowIds.has(s.user_id)
      ? `<button class="post-action-btn" onclick="toggleFollow('${s.user_id}', this)">Mengikuti ✓</button>`
      : `<button class="post-action-btn" onclick="toggleFollow('${s.user_id}', this)"><i class="fas fa-user-plus"></i> Follow</button>`)
    : '';

  return `
    <div class="post-card shout-card" data-id="${s.id}">
      <div class="voice-user-avatar">${escapeHtml(initial)}</div>
      <div class="post-body">
        <div class="post-meta">
          <span class="post-author">${escapeHtml(name)}</span>
          <span class="post-time">${timeAgo}</span>
        </div>
        ${s.content ? `<p class="post-content">${linkifyShout(s.content)}</p>` : ''}
        ${imgHtml}
        ${repostHtml}
        <div class="post-actions">
          <button class="post-action-btn shout-like ${s.liked_by_me ? 'shout-liked' : ''}" id="like-${s.id}" onclick="toggleShoutLike('${s.id}')">
            <i class="${s.liked_by_me ? 'fas' : 'far'} fa-heart"></i> <span>${s.like_count || 0}</span>
          </button>
          <button class="post-action-btn" onclick="repostShout('${s.id}')"><i class="fas fa-retweet"></i> Repost</button>
          ${followBtn}
          ${isMe ? `<button class="post-action-btn" onclick="deleteShout('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

async function sendShout() {
  const input = document.getElementById('shout-input');
  const fileInput = document.getElementById('shout-image-input');
  const content = input.value.trim();
  const imageFile = fileInput ? fileInput.files[0] : null;
  if (!content && !imageFile) { alert('Tulis sesuatu atau pilih gambar dulu!'); return; }
  if (content.length > 280) { alert('Maksimal 280 karakter!'); return; }

  let imageUrl = null;
  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile);
    } catch (e) {
      alert('Gagal upload gambar: ' + e.message);
      return;
    }
  }

  const { error } = await apiFetch('/shouts', {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id, content: content || null, image_url: imageUrl })
  });
  if (error) { alert('Gagal mengirim shout: ' + error.message); return; }

  input.value = '';
  document.getElementById('shout-counter').textContent = '280';
  if (fileInput) fileInput.value = '';
  const preview = document.getElementById('shout-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  document.getElementById('shout-image-label')?.classList.remove('has-file');
  refreshTimeline();
}

async function toggleShoutLike(shoutId) {
  const { data, error } = await apiFetch(`/shouts/${shoutId}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id })
  });
  if (error) { alert('Gagal like: ' + error.message); return; }
  const btn = document.getElementById(`like-${shoutId}`);
  if (btn) {
    btn.classList.toggle('shout-liked', data.liked);
    btn.querySelector('i').className = data.liked ? 'fas fa-heart' : 'far fa-heart';
    btn.querySelector('span').textContent = data.like_count;
  }
}

async function repostShout(shoutId) {
  // prompt() tidak jalan di WebView HP → pakai modal biasa
  let overlay = document.getElementById('repost-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'repost-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>🔁 Repost</h3>
          <button class="modal-close" id="repost-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="auth-error" id="repost-error"></div>
          <div class="form-group">
            <label for="repost-input">Komentar (opsional, kosongkan untuk repost langsung)</label>
            <input type="text" id="repost-input" maxlength="280" placeholder="Tambahkan komentar...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="repost-cancel">Batal</button>
          <button class="btn btn-primary" id="repost-save" style="width:auto;">Repost</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  const errBox = document.getElementById('repost-error');
  errBox.classList.remove('show');
  errBox.textContent = '';
  const input = document.getElementById('repost-input');
  input.value = '';
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 100);
  document.getElementById('repost-close').onclick = () => overlay.classList.remove('active');
  document.getElementById('repost-cancel').onclick = () => overlay.classList.remove('active');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
  document.getElementById('repost-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const comment = input.value.trim();
    if (comment.length > 280) {
      errBox.textContent = 'Maksimal 280 karakter!';
      errBox.classList.add('show');
      return;
    }
    btn.disabled = true;
    try {
      const { error } = await apiFetch('/shouts', {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id, content: comment || null, repost_of: shoutId })
      });
      if (error) throw new Error(error.message);
      overlay.classList.remove('active');
      refreshTimeline();
    } catch (err) {
      errBox.textContent = 'Gagal repost: ' + (err.message || err);
      errBox.classList.add('show');
    } finally {
      btn.disabled = false;
    }
  };
}

async function deleteShout(shoutId) {
  if (!confirm('Hapus shout ini?')) return;
  const { error } = await apiFetch(`/shouts/${shoutId}?user_id=${currentUser.id}`, { method: 'DELETE' });
  if (error) { alert('Gagal menghapus: ' + error.message); return; }
  refreshTimeline();
}

async function toggleFollow(userId, btnEl) {
  const following = myFollowIds.has(userId);
  if (following) {
    const { error } = await apiFetch(`/follows?follower_id=${currentUser.id}&followed_id=${userId}`, { method: 'DELETE' });
    if (error) { alert('Gagal unfollow: ' + error.message); return; }
    myFollowIds.delete(userId);
  } else {
    const { error } = await apiFetch('/follows', {
      method: 'POST',
      body: JSON.stringify({ follower_id: currentUser.id, followed_id: userId })
    });
    if (error) { alert('Gagal follow: ' + error.message); return; }
    myFollowIds.add(userId);
  }
  // Update semua tombol follow user ini di feed
  refreshTimeline();
}
