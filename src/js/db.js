// Nobarly DB client - HTTP version talking to Express + MariaDB backend
// Keeps the same Supabase-like query builder API so frontend code stays unchanged.

// NOTE: pakai `var` (bukan const) karena auth.js juga mendeklarasikan API_BASE
// di global scope yang sama. Redeclarasi `const` antar <script> = SyntaxError
// yang mematikan seluruh file ini (dulu bikin tombol Buat Komunitas mati total).
// Nilai diambil dari js/config.js supaya dinamis (localhost / WiFi / online / APK).
// Sinkron ulang tiap load karena auth.js dimuat sebelum file ini.
var API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : 'http://localhost:5000/api';

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function apiFetch(path, options = {}) {
  // Selalu sinkron ke config terbaru (user bisa ganti server dari HP tanpa reload file)
  try {
    if (typeof window !== 'undefined' && window.NobarlyConfig) {
      API_BASE = window.NobarlyConfig.getApiBase();
    }
  } catch (_) {}
  const token = localStorage.getItem('nobarly_token');
  // Anti-crash: server mati / tunnel putus / balasan bukan JSON
  // selalu jadi { error } rapi, bukan unhandled rejection.
  try {
    const res = await fetch(API_BASE + path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options,
      // pastikan Content-Type tidak ke-override oleh spread options di atas
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    try {
      return await res.json();
    } catch (_) {
      return { data: null, error: { message: `Server merespons tak terduga (HTTP ${res.status}).` } };
    }
  } catch (_) {
    return { data: null, error: { message: 'Tidak bisa menghubungi server. Cek koneksi / URL server.', offline: true } };
  }
}

function getFilter(filters, col) {
  const f = filters.find(f => f.col === col);
  return f ? f.val : undefined;
}

// Indikator "sedang mengetik" ala Discord (throttle 2.5 dtk, best-effort)
var lastTypingSentAt = 0;
function sendTyping(scope, scopeId) {
  const now = Date.now();
  if (now - lastTypingSentAt < 2500) return;
  lastTypingSentAt = now;
  try {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) return;
    const name = currentUser.username || currentUser.email || 'User';
    apiFetch('/typing', {
      method: 'POST',
      body: JSON.stringify({ scope, scope_id: scopeId, user_id: currentUser.id, username: name })
    });
  } catch (_) {}
}

function typingHtml(list) {
  if (!list || list.length === 0) return '';
  if (list.length === 1) {
    return `<b>${escapeHtml(list[0].username || 'User')}</b> sedang mengetik<span class="tdots"><span></span><span></span><span></span></span>`;
  }
  return `<b>${list.length} orang</b> sedang mengetik<span class="tdots"><span></span><span></span><span></span></span>`;
}

// Kunci DM dua arah (A:B sama dengan B:A) untuk scope typing
function dmScopeKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB, harus sama dengan backend

// Upload 1 file gambar ke server. Balik { url } atau throw Error.
async function uploadImage(file) {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Gambar maksimal 5MB.');
  const token = localStorage.getItem('nobarly_token');
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(API_BASE + '/uploads', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    throw new Error(`Server merespons tak terduga (HTTP ${res.status}).`);
  }
  if (!json || json.error) throw new Error((json && json.error && json.error.message) || 'Upload gagal.');
  if (!json.data || !json.data.url) throw new Error('Upload gagal: respons server tidak lengkap.');
  return json.data.url; // bentuk: /uploads/<nama-file>
}

// Escape untuk string dalam atribut onclick single-quote (global, dipakai semua modul)
function jsq(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Avatar global: foto kalau ada, huruf awal kalau tidak.
// Pakai di semua daftar user supaya konsisten (DM, voice, sidebar).
// cls = class bentuk (mis. 'dmsg-avatar', 'voice-user-avatar'), dot = titik status,
// st = status presence: true/'off' = offline abu, 'idle' = kuning, 'dnd' = merah,
//      selain itu hijau (online). Plus frame warna + badge tag opsional.
// frame = 'white'|'gold'|'red'|'blue' (border avatar).
function avatarHtml(name, url, cls, dot, st, frame) {
  const initial = escapeHtml(((name || '?').charAt(0) || '?').toUpperCase());
  let dotCls = 'status-dot';
  if (st === true || st === 'off' || st === 'invisible') dotCls += ' off';
  else if (st === 'idle') dotCls += ' st-idle';
  else if (st === 'dnd') dotCls += ' st-dnd';
  const d = dot ? `<span class="${dotCls}"></span>` : '';
  const fc = frame ? ` avframe-${frame}` : '';
  if (url) {
    const src = escapeHtml(imageSrc(url));
    return `<div class="${cls}${fc} has-photo"><span class="av-initial">${initial}</span><img src="${src}" alt="" loading="lazy" onerror="this.remove()">${d}</div>`;
  }
  return `<div class="${cls}${fc}">${initial}${d}</div>`;
}

// Badge tag server DIHAPUS (permintaan user). Stub dipertahankan agar
// pemanggil lama (APK cached) tidak crash — selalu render kosong.
function tagHtml(tag) {
  return '';
}

// Banner profil: gradien bawaan / warna hex / foto upload
function bannerHtml(banner, cls) {
  const c = cls || 'profile-banner';
  if (banner && (/^\//.test(banner) || /^https?:\/\//i.test(banner))) {
    return `<div class="${c}" style="background-image:url('${escapeHtml(imageSrc(banner))}');background-size:cover;background-position:center;"></div>`;
  }
  if (banner && /^#[0-9a-fA-F]{3,8}$/.test(banner)) {
    return `<div class="${c}" style="background:${escapeHtml(banner)};"></div>`;
  }
  return `<div class="${c} ${banner ? 'banner-' + escapeHtml(banner) : 'banner-default'}"></div>`;
}

// Status presence gabungan: setting user + last_seen.
// invisible / basi > 3 mnt / belum pernah aktif = offline.
function presenceOf(statusField, lastSeen) {
  const s = statusField || 'online';
  if (s === 'invisible') return 'off';
  if (!isOnline(lastSeen)) return 'off';
  return s;
}

// Online kalau last_seen < 3 menit (heartbeat dikirim tiap 60 detik)
function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (isNaN(t)) return false;
  return (Date.now() - t) < 3 * 60 * 1000;
}

// Ubah path /uploads/... jadi URL absolut ke server (dinamis: WiFi/online/APK).
function imageSrc(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  let base = API_BASE;
  try {
    if (typeof window !== 'undefined' && window.NobarlyConfig) {
      base = window.NobarlyConfig.getApiBase();
    }
  } catch (_) {}
  const origin = base.replace(/\/api\/?$/, '');
  return origin + (url.startsWith('/') ? url : '/' + url);
}

// Penampil gambar dalam aplikasi (lightbox). Dipakai semua gambar post/chat.
// Catatan: JANGAN pakai window.open untuk gambar — di APK/WebView itu bikin
// aplikasi pindah halaman tanpa tombol kembali (fitur serasa mati).
function openImageViewer(url) {
  const src = imageSrc(url);
  if (!src) return;
  let overlay = document.getElementById('image-viewer');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'image-viewer';
    overlay.className = 'image-viewer';
    overlay.innerHTML = `
      <button class="image-viewer-close" onclick="closeImageViewer()" aria-label="Tutup">&times;</button>
      <img id="image-viewer-img" alt="Gambar">`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.id === 'image-viewer-img') closeImageViewer();
    });
  }
  document.getElementById('image-viewer-img').src = src;
  overlay.classList.add('active');
}

function closeImageViewer() {
  const overlay = document.getElementById('image-viewer');
  if (!overlay) return;
  overlay.classList.remove('active');
  const img = document.getElementById('image-viewer-img');
  if (img) img.removeAttribute('src');
}

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.filters = [];
    this._order = null;
    this._limit = null;
    this._single = false;
    this._maybeSingle = false;
    this._selectCols = null;
  }

  select(cols) {
    this._selectCols = cols;
    return this;
  }

  eq(col, val) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }

  in(col, vals) {
    this.filters.push({ type: 'in', col, vals });
    return this;
  }

  order(col, opts) {
    this._order = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._single = true;
    this._maybeSingle = true;
    return this;
  }

  async then(resolve) {
    try {
      const result = await this._execute();
      if (this._single) {
        if (!result || (Array.isArray(result) && result.length === 0)) {
          resolve({ data: null, error: this._maybeSingle ? null : { message: 'Not found' } });
        } else {
          resolve({ data: Array.isArray(result) ? result[0] : result, error: null });
        }
      } else {
        resolve({ data: result, error: null });
      }
    } catch (e) {
      resolve({ data: null, error: { message: e.message } });
    }
  }

  async _execute() {
    const t = this.tableName;

    // ---- profiles ----
    if (t === 'profiles') {
      const id = getFilter(this.filters, 'id');
      const { data, error } = await apiFetch(`/profiles/${id}`);
      if (error) return [];
      return [data];
    }

    // ---- post_votes (select) ----
    if (t === 'post_votes') {
      const postId = getFilter(this.filters, 'post_id');
      const userId = getFilter(this.filters, 'user_id');
      const { data } = await apiFetch(`/posts/votes/check?post_id=${postId}&user_id=${userId}`);
      return data ? [data] : [];
    }

    // ---- comments ----
    if (t === 'comments') {
      const postId = getFilter(this.filters, 'post_id');
      const { data } = await apiFetch(`/posts/${postId}/comments`);
      return data || [];
    }

    // ---- posts ----
    if (t === 'posts') {
      const channelId = getFilter(this.filters, 'channel_id');
      const id = getFilter(this.filters, 'id');
      const inFilter = this.filters.find(f => f.type === 'in' && f.col === 'community_id');
      if (id) {
        const { data } = await apiFetch(`/posts/${id}`);
        return data ? [data] : [];
      }
      if (channelId) {
        const { data } = await apiFetch(`/posts?channel_id=${channelId}`);
        return data || [];
      }
      if (inFilter) {
        let url = `/posts?community_id=${inFilter.vals.join(',')}`;
        if (this._limit) url += `&limit=${this._limit}`;
        const { data } = await apiFetch(url);
        return data || [];
      }
      const { data } = await apiFetch('/posts');
      return data || [];
    }

    // ---- communities ----
    if (t === 'communities') {
      const id = getFilter(this.filters, 'id');
      if (id) {
        const { data } = await apiFetch(`/communities/${id}`);
        return data ? [data] : [];
      }
      const { data } = await apiFetch('/communities');
      return data || [];
    }

    // ---- community_members ----
    if (t === 'community_members') {
      const userId = getFilter(this.filters, 'user_id');
      const communityId = getFilter(this.filters, 'community_id');
      if (userId && !communityId) {
        const { data } = await apiFetch(`/communities/members/list?user_id=${userId}`);
        return data || [];
      }
      if (communityId && !userId) {
        const { data } = await apiFetch(`/communities/${communityId}/members`);
        return data || [];
      }
      const { data } = await apiFetch(`/communities/members/list?user_id=${userId || ''}`);
      return (data || []).filter(m => !communityId || m.community_id === communityId);
    }

    // ---- channels ----
    if (t === 'channels') {
      const communityId = getFilter(this.filters, 'community_id');
      const url = communityId ? `/channels?community_id=${communityId}` : '/channels';
      const { data } = await apiFetch(url);
      return data || [];
    }

    // ---- watch_parties ----
    if (t === 'watch_parties') {
      const id = getFilter(this.filters, 'id');
      if (id) {
        const { data } = await apiFetch(`/watch-parties/${id}`);
        return data ? [data] : [];
      }
      const { data } = await apiFetch('/watch-parties');
      return data || [];
    }

    // ---- watch_chat ----
    if (t === 'watch_chat') {
      const partyId = getFilter(this.filters, 'watch_party_id');
      const { data } = await apiFetch(`/watch-parties/${partyId}/chat`);
      return data || [];
    }

    // ---- voice_sessions ----
    if (t === 'voice_sessions') {
      const channelId = getFilter(this.filters, 'channel_id');
      const { data } = await apiFetch(`/voice/users?channel_id=${channelId}`);
      return data || [];
    }

    // ---- channel_messages (obrolan channel ala Discord) ----
    if (t === 'channel_messages') {
      const channelId = getFilter(this.filters, 'channel_id');
      const url = `/chat?channel_id=${encodeURIComponent(channelId)}${this._limit ? `&limit=${this._limit}` : ''}`;
      const { data } = await apiFetch(url);
      return data || [];
    }

    // ---- message_reactions ----
    if (t === 'message_reactions') {
      const messageId = getFilter(this.filters, 'message_id');
      const { data } = await apiFetch(`/chat/${messageId}/reactions`);
      return data || [];
    }

    // ---- friends ----
    if (t === 'friends') {
      const userId = getFilter(this.filters, 'user_id');
      const { data } = await apiFetch(`/friends?user_id=${userId}`);
      return data || [];
    }

    throw new Error('Unknown table: ' + t);
  }
}

class InsertQuery {
  constructor(tableName, rows) {
    this.tableName = tableName;
    this.rows = rows;
  }

  async then(resolve) {
    try {
      const t = this.tableName;
      let result = null;

      if (t === 'profiles') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/profiles', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'post_votes') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/posts/votes', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'comments') {
        const r = this.rows[0];
        const { data, error } = await apiFetch(`/posts/${r.post_id}/comments`, { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'posts') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/posts', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'communities') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/communities', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'community_members') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/communities/members', { method: 'POST', body: JSON.stringify(r) });
        if (error) {
          // preserve duplicate-member error code used by frontend
          const err = new Error(error.message);
          err.code = error.code;
          throw err;
        }
        result = data;
      } else if (t === 'channels') {
        const { data, error } = await apiFetch('/channels', { method: 'POST', body: JSON.stringify(this.rows) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'watch_parties') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/watch-parties', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'watch_chat') {
        const r = this.rows[0];
        const { data, error } = await apiFetch(`/watch-parties/${r.watch_party_id}/chat`, { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'voice_sessions') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/voice/join', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'channel_messages') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/chat', { method: 'POST', body: JSON.stringify(r) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'message_reactions') {
        const r = this.rows[0];
        const { data, error } = await apiFetch(`/chat/${r.message_id}/reactions`, { method: 'POST', body: JSON.stringify({ user_id: r.user_id, emoji: r.emoji }) });
        if (error) throw new Error(error.message);
        result = data;
      } else if (t === 'friends') {
        const r = this.rows[0];
        const { data, error } = await apiFetch('/friends', { method: 'POST', body: JSON.stringify(r) });
        if (error) {
          const err = new Error(error.message);
          err.code = error.code;
          throw err;
        }
        result = data;
      } else {
        throw new Error('Unknown table: ' + t);
      }

      resolve({ data: this.rows.length === 1 ? result : result, error: null });
    } catch (e) {
      const err = { message: e.message };
      if (e.code) err.code = e.code;
      resolve({ data: null, error: err });
    }
  }
}

class UpdateQuery {
  constructor(tableName, updates) {
    this.tableName = tableName;
    this.updates = updates;
    this.filters = [];
  }

  eq(col, val) {
    this.filters.push({ col, val });
    return this;
  }

  async then(resolve) {
    try {
      const t = this.tableName;

      if (t === 'post_votes') {
        const id = getFilter(this.filters, 'id');
        const { error } = await apiFetch(`/posts/votes/${id}`, { method: 'PUT', body: JSON.stringify(this.updates) });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else if (t === 'friends') {
        const id = getFilter(this.filters, 'id');
        // Backend wajib menerima user_id untuk verifikasi penerima
        // (tanpa ini: 403 "Hanya penerima yang bisa merespons").
        const body = { ...this.updates };
        if (!body.user_id) {
          try {
            const me = JSON.parse(localStorage.getItem('nobarly_user') || 'null');
            if (me && me.id) body.user_id = me.id;
          } catch (_) {}
        }
        const { data, error } = await apiFetch(`/friends/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        if (error) throw new Error(error.message);
        resolve({ data: data, error: null });
      } else if (t === 'watch_parties') {
        const id = getFilter(this.filters, 'id');
        const { data, error } = await apiFetch(`/watch-parties/${id}`, { method: 'PUT', body: JSON.stringify(this.updates) });
        if (error) throw new Error(error.message);
        resolve({ data: data, error: null });
      } else if (t === 'voice_sessions') {
        const channelId = getFilter(this.filters, 'channel_id');
        const userId = getFilter(this.filters, 'user_id');
        const { error } = await apiFetch('/voice/mute', {
          method: 'PUT',
          body: JSON.stringify({ channel_id: channelId, user_id: userId, ...this.updates })
        });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else if (t === 'profiles') {
        const id = getFilter(this.filters, 'id');
        const { data, error } = await apiFetch(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(this.updates) });
        if (error) throw new Error(error.message);
        resolve({ data: data, error: null });
      } else if (t === 'channel_messages') {
        const id = getFilter(this.filters, 'id');
        const userId = getFilter(this.filters, 'user_id');
        const body = { ...this.updates };
        if (userId && !body.user_id) body.user_id = userId;
        const { data, error } = await apiFetch(`/chat/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        if (error) throw new Error(error.message);
        resolve({ data: data, error: null });
      } else {
        throw new Error('Unknown table for update: ' + t);
      }
    } catch (e) {
      resolve({ data: null, error: { message: e.message } });
    }
  }
}

class DeleteQuery {
  constructor(tableName) {
    this.tableName = tableName;
    this.filters = [];
  }

  eq(col, val) {
    this.filters.push({ col, val });
    return this;
  }

  async then(resolve) {
    try {
      const t = this.tableName;

      if (t === 'post_votes') {
        const id = getFilter(this.filters, 'id');
        const { error } = await apiFetch(`/posts/votes?vote_id=${id}`, { method: 'DELETE' });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else if (t === 'channel_messages') {
        const id = getFilter(this.filters, 'id');
        const userId = getFilter(this.filters, 'user_id');
        const { error } = await apiFetch(`/chat/${id}?user_id=${userId}`, { method: 'DELETE' });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else if (t === 'friends') {
        const id = getFilter(this.filters, 'id');
        const userId = getFilter(this.filters, 'user_id');
        const { error } = await apiFetch(`/friends/${id}?user_id=${userId}`, { method: 'DELETE' });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else if (t === 'voice_sessions') {
        const channelId = getFilter(this.filters, 'channel_id');
        const userId = getFilter(this.filters, 'user_id');
        const { error } = await apiFetch(`/voice/leave?channel_id=${channelId}&user_id=${userId}`, { method: 'DELETE' });
        if (error) throw new Error(error.message);
        resolve({ data: null, error: null });
      } else {
        throw new Error('Unknown table for delete: ' + t);
      }
    } catch (e) {
      resolve({ data: null, error: { message: e.message } });
    }
  }
}

class TableProxy {
  constructor(tableName) {
    this.tableName = tableName;
  }

  select(cols) {
    return new QueryBuilder(this.tableName).select(cols);
  }

  insert(rows) {
    return new InsertQuery(this.tableName, Array.isArray(rows) ? rows : [rows]);
  }

  update(updates) {
    return new UpdateQuery(this.tableName, updates);
  }

  delete() {
    return new DeleteQuery(this.tableName);
  }
}

const db = {
  from: (table) => new TableProxy(table),
  channel: (name) => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    subscribe: () => ({ unsubscribe: () => {} }),
    unsubscribe: () => {}
  })
};
