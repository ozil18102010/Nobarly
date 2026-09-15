let currentPostChannel = null;
let postSortMode = 'new'; // 'new' | 'top'
let replyToComment = null; // { postId, commentId, username }

function sortPostsList(posts) {
  const arr = [...(posts || [])];
  if (postSortMode === 'top') {
    arr.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  } else {
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return arr;
}

function postSortToolbar() {
  return `
    <div class="sort-toolbar">
      <button class="sort-btn ${postSortMode === 'new' ? 'sort-active' : ''}" onclick="setPostSort('new')"><i class="fas fa-clock"></i> Terbaru</button>
      <button class="sort-btn ${postSortMode === 'top' ? 'sort-active' : ''}" onclick="setPostSort('top')"><i class="fas fa-fire"></i> Terpopuler</button>
    </div>`;
}

function setPostSort(mode) {
  postSortMode = mode;
  // Render ulang tampilan post yang sedang aktif
  if (document.getElementById('channel-posts-mount') && currentPostChannel) {
    refreshChannelPostTab();
  } else if (currentPage === 'home') {
    loadHomeFeed();
  }
}

function openPostModal() {
  document.getElementById('create-post-modal').classList.add('active');
}

async function loadChannelPosts(channelId, communityId, mountEl) {
  currentPostChannel = channelId;
  const inTab = !!mountEl;
  const body = mountEl || document.getElementById('content-body');
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');

  if (!inTab) {
    title.textContent = 'Text Channel';
    actions.innerHTML = '<button class="btn btn-primary" onclick="openPostModal()"><i class="fas fa-plus"></i> Buat Post</button>';
  }

  body.innerHTML = '<div class="loading-post"><div class="spinner" style="display:inline-block"></div> Memuat post...</div>';

  const { data: posts } = await db
    .from('posts')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });

  if (!posts || posts.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-pen"></i>
        <h3>Belum Ada Post</h3>
        <p>Jadilah yang pertama membuat post di channel ini!</p>
      </div>`;
    return;
  }

  body.innerHTML = postSortToolbar() + '<div class="post-feed" id="post-feed"></div>';
  const feed = document.getElementById('post-feed');

  for (const post of sortPostsList(posts)) {
    const { data: profile } = await db.from('profiles').select('*').eq('id', post.user_id).maybeSingle();
    post.profiles = profile;
    feed.innerHTML += renderPostCard(post);
  }

  setupPostInteractions();
}

function renderPostCard(post) {
  const timeAgo = getTimeAgo(post.created_at);
  const username = post.profiles?.username || 'Guest';
  const imgHtml = post.image_url
    ? `<img class="post-image" src="${escapeHtml(imageSrc(post.image_url))}" alt="Gambar post" loading="lazy" onclick="openImageViewer('${jsq(post.image_url)}')">`
    : '';

  return `
    <div class="post-card" data-id="${post.id}">
      <div class="post-vote">
        <button class="vote-btn upvote" data-post="${post.id}" onclick="votePost('${post.id}', 1)">
          <i class="fas fa-arrow-up"></i>
        </button>
        <span class="vote-count" id="votes-${post.id}">${post.upvotes || 0}</span>
        <button class="vote-btn downvote" data-post="${post.id}" onclick="votePost('${post.id}', -1)">
          <i class="fas fa-arrow-down"></i>
        </button>
      </div>
      <div class="post-body">
        <div class="post-meta">
          <span class="post-author">${escapeHtml(username)}</span>
          <span class="post-time">${timeAgo}</span>
        </div>
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
        <p class="post-content">${escapeHtml(post.content)}</p>
        ${imgHtml}
        <div class="post-actions">
          <button class="post-action-btn" onclick="toggleComments('${post.id}')">
            <i class="fas fa-comment"></i> Komentar
          </button>
        </div>
        <div class="comments-section" id="comments-${post.id}" style="display:none;">
          <div class="comments-list" id="comments-list-${post.id}"></div>
          <div class="comment-form">
            <input type="text" placeholder="Tulis komentar..." id="comment-input-${post.id}"
              onkeydown="if(event.key==='Enter')submitComment('${post.id}')">
            <button class="btn btn-sm" onclick="submitComment('${post.id}')">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

async function votePost(postId, voteType) {
  const { data: existing } = await db
    .from('post_votes')
    .select('*')
    .eq('post_id', postId)
    .eq('user_id', currentUser.id)
    .single();

  if (existing) {
    if (existing.vote_type === voteType) {
      await db.from('post_votes').delete().eq('id', existing.id);
    } else {
      await db.from('post_votes').update({ vote_type: voteType }).eq('id', existing.id);
    }
  } else {
    await db.from('post_votes').insert([{
      post_id: postId, user_id: currentUser.id, vote_type: voteType
    }]);
  }

  const { data: post } = await db.from('posts').select('*').eq('id', postId).single();
  if (post) {
    document.getElementById(`votes-${postId}`).textContent = post.upvotes || 0;
  }
}

async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (section.style.display === 'none') {
    section.style.display = 'block';
    loadComments(postId);
  } else {
    section.style.display = 'none';
  }
}

async function loadComments(postId) {
  const list = document.getElementById(`comments-list-${postId}`);

  const { data: comments } = await db
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (!comments || comments.length === 0) {
    list.innerHTML = '<p class="no-comments">Belum ada komentar</p>';
    return;
  }

  // Bangun pohon reply (parent_id), orphan jadi top-level
  const byId = {};
  const roots = [];
  for (const c of comments) byId[c.id] = { ...c, children: [] };
  for (const c of comments) {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children.push(byId[c.id]);
    else roots.push(byId[c.id]);
  }

  list.innerHTML = '';
  for (const c of roots) {
    list.innerHTML += await renderCommentNode(c, postId, 0);
  }
}

async function renderCommentNode(c, postId, depth) {
  const { data: profile } = await db.from('profiles').select('*').eq('id', c.user_id).maybeSingle();
  const timeAgo = getTimeAgo(c.created_at);
  const indent = Math.min(depth, 3) * 18;
  let html = `
    <div class="comment-item" style="margin-left:${indent}px">
      <span class="comment-author">${escapeHtml(profile?.username || 'Guest')}</span>
      <span class="comment-time">${timeAgo}</span>
      <p class="comment-text">${escapeHtml(c.content)}</p>
      <button class="post-action-btn" onclick="setCommentReply('${postId}', '${c.id}', '${jsq(profile?.username || 'Guest')}')">
        <i class="fas fa-reply"></i> Balas
      </button>
    </div>`;
  for (const child of c.children) {
    html += await renderCommentNode(child, postId, depth + 1);
  }
  return html;
}

function setCommentReply(postId, commentId, username) {
  replyToComment = { postId, commentId };
  const input = document.getElementById(`comment-input-${postId}`);
  if (input) {
    input.placeholder = `Balas @${username}... (Enter untuk kirim, Esc batal)`;
    input.focus();
  }
}

async function submitComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  const parentId = (replyToComment && replyToComment.postId === postId) ? replyToComment.commentId : null;

  const { error } = await db.from('comments').insert([{
    post_id: postId, user_id: currentUser.id, content, parent_id: parentId
  }]);

  if (error) { alert('Gagal mengirim komentar: ' + error.message); return; }

  input.value = '';
  input.placeholder = 'Tulis komentar...';
  replyToComment = null;
  loadComments(postId);
}

// Esc pada input komentar membatalkan reply
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && replyToComment) {
    const input = document.getElementById(`comment-input-${replyToComment.postId}`);
    if (input) input.placeholder = 'Tulis komentar...';
    replyToComment = null;
  }
});

async function createPost() {
  const titleVal = document.getElementById('post-title-input').value.trim();
  const contentVal = document.getElementById('post-content-input').value.trim();
  const imageFile = document.getElementById('post-image-input').files[0];

  if (!titleVal || !contentVal) { alert('Judul dan isi wajib diisi!'); return; }
  if (!currentPostChannel) { alert('Pilih channel terlebih dahulu!'); return; }

  let imageUrl = null;
  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile);
    } catch (e) {
      alert('Gagal upload gambar: ' + e.message);
      return;
    }
  }

  const { error } = await db.from('posts').insert([{
    community_id: currentCommunity,
    channel_id: currentPostChannel,
    user_id: currentUser.id,
    title: titleVal,
    content: contentVal,
    upvotes: 0,
    image_url: imageUrl
  }]);

  if (error) { alert('Gagal membuat post: ' + error.message); return; }

  closePostModal();
  // Kalau dibuka dari tab Postingan channel, refresh di dalam tab saja
  if (document.getElementById('channel-posts-mount') && typeof refreshChannelPostTab === 'function') {
    refreshChannelPostTab();
  } else {
    loadChannelPosts(currentPostChannel, currentCommunity);
  }
}

function setupPostInteractions() {
  document.querySelectorAll('.post-card').forEach(card => {
    card.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', e => e.stopPropagation());
    });
  });
}

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
  return date.toLocaleDateString('id-ID');
}
