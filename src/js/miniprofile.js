// Mini profile popup ala Discord: klik avatar di chat → kartu floating
// (banner, avatar + status, mutual friends/servers, bio, Message @user).
// Desktop: muncul dekat klik. HP: kartu tengah mengambang.

async function openMiniProfile(userId, anchor) {
  if (!userId) return;
  closeMiniProfile();
  // Posisi popup (desktop: dekat klik; HP: tengah)
  let x = null, y = null;
  try {
    const r = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : null;
    const mobile = window.NobarlyMobile && window.NobarlyMobile.isMobile();
    if (r && !mobile) {
      x = Math.min(r.right + 10, window.innerWidth - 340);
      y = Math.min(Math.max(10, r.top - 40), window.innerHeight - 420);
      if (x < 10) x = 10;
    }
  } catch (_) {}

  const overlay = document.createElement('div');
  overlay.id = 'minipf-overlay';
  overlay.className = 'minipf-overlay';
  overlay.innerHTML = `
    <div class="minipf-card" id="minipf-card" ${x !== null ? `style="left:${x}px;top:${y}px;"` : ''}>
      <div class="skeleton"></div><div class="skeleton"></div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMiniProfile();
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseMiniProfile);

  // Ambil profil lengkap + mutual
  let p = null;
  try {
    const res = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    p = res.data;
  } catch (_) {}
  const card = document.getElementById('minipf-card');
  if (!card) return;
  if (!p) {
    card.innerHTML = '<p class="no-comments" style="padding:16px;">Profil tidak ketemu.</p>';
    return;
  }

  let mutualFriends = 0, mutualServers = 0;
  try {
    if (currentUser && currentUser.id !== p.id) {
      const [mine, theirs] = await Promise.all([
        apiFetch(`/friends?user_id=${currentUser.id}`),
        apiFetch(`/friends?user_id=${p.id}`)
      ]);
      const mySet = new Set(((mine.data) || []).filter(r => r.status === 'accepted').map(r =>
        r.requester_id === currentUser.id ? r.addressee_id : r.requester_id));
      mutualFriends = ((theirs.data) || []).filter(r => {
        if (r.status !== 'accepted') return false;
        const fid = r.requester_id === p.id ? r.addressee_id : r.requester_id;
        return mySet.has(fid);
      }).length;
      const [myComms, theirComms] = await Promise.all([
        apiFetch(`/communities/members/list?user_id=${currentUser.id}`),
        apiFetch(`/communities/members/list?user_id=${p.id}`)
      ]);
      const myC = new Set(((myComms.data) || []).map(m => m.community_id));
      mutualServers = ((theirComms.data) || []).filter(m => myC.has(m.community_id)).length;
    }
  } catch (_) {}

  const conns = parseConns(p.connections);
  const st = presenceOf(p.status, p.last_seen);
  const frameCls = p.avatar_frame ? ' avframe-' + p.avatar_frame : '';
  const isMe = currentUser && p.id === currentUser.id;
  card.innerHTML = `
    ${bannerHtml(p.banner)}
    <div class="minipf-top">
      <button class="dmsg-iconbtn" title="Pesan" onclick="messageMiniProfile('${p.id}')"><i class="fas fa-comment"></i></button>
      <button class="dmsg-iconbtn" title="Lainnya" onclick="openProfile('${p.id}');closeMiniProfile();"><i class="fas fa-ellipsis-h"></i></button>
    </div>
    <div class="minipf-id">
      ${avatarHtml(p.username, p.avatar_url, 'dmsg-avatar minipf-avatar' + frameCls, true, st)}
      <div class="minipf-name">${escapeHtml(p.username)}</div>
      <div class="minipf-sub">${escapeHtml(p.username)} • ${statusLabel(p)}</div>
    </div>
    <div class="minipf-body">
      ${(!isMe && (mutualFriends > 0 || mutualServers > 0)) ? `
      <div class="minipf-mutual">👥 ${mutualFriends} Mutual Friend • ${mutualServers} Mutual Server${mutualServers > 1 ? 's' : ''}</div>` : ''}
      <div class="minipf-bio">"${escapeHtml((p.bio || 'Belum ada bio.').slice(0, 120))}"</div>
      <a href="#" class="minipf-fulllink" onclick="openProfile('${p.id}');closeMiniProfile();return false;">View Full Bio</a>
      ${Object.keys(conns).length > 0 ? `<div class="conn-chips" style="margin-top:8px;">${CONN_KEYS.filter(k => conns[k.id]).map(k => `<span class="conn-chip conn-${k.id}">${k.label}</span>`).join('')}</div>` : ''}
      ${isMe ? '' : `
      <div class="minipf-msgrow">
        <input type="text" id="minipf-input" placeholder="Message @${escapeHtml(p.username)}" maxlength="2000">
        <button class="dmsg-iconbtn" onclick="sendMiniProfileMsg('${p.id}')"><i class="fas fa-paper-plane"></i></button>
      </div>`}
    </div>`;
  const inp = document.getElementById('minipf-input');
  if (inp) inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMiniProfileMsg(p.id);
  });
}

function escCloseMiniProfile(e) {
  if (e.key === 'Escape') closeMiniProfile();
}

function closeMiniProfile() {
  try {
    document.getElementById('minipf-overlay')?.remove();
    document.removeEventListener('keydown', escCloseMiniProfile);
  } catch (_) {}
}

// Kirim cepat dari popup → lompat ke DM dengan teks terisi
async function sendMiniProfileMsg(userId) {
  const inp = document.getElementById('minipf-input');
  const text = inp ? inp.value.trim() : '';
  if (!text) return;
  closeMiniProfile();
  try {
    const res = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    const p = res.data;
    if (!p) return;
    window._dmPrefill = text;
    const go = () => {
      try {
        openDM(p.id, p.username, p.avatar_url || '', p.last_seen || '', p.status || 'online');
        const box = document.getElementById('dm-input');
        if (box) {
          box.value = window._dmPrefill || '';
          window._dmPrefill = null;
          box.focus();
        }
      } catch (_) {}
    };
    if (typeof currentPage !== 'undefined' && currentPage === 'dm' && document.getElementById('dm-main')) {
      go();
    } else {
      const sideDm = document.querySelector('.sidebar-item[data-page="dm"]');
      if (sideDm) sideDm.click();
      else if (typeof renderPage === 'function') renderPage('dm');
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (document.getElementById('dm-main') || tries > 20) {
          clearInterval(timer);
          if (document.getElementById('dm-main')) go();
        }
      }, 250);
    }
  } catch (_) {}
}

function messageMiniProfile(userId) {
  closeMiniProfile();
  openProfile(userId);
  // Langsung tawarkan kirim pesan dari halaman profil penuh
  setTimeout(() => {
    try {
      const btn = document.querySelector('.pf-body .btn-primary');
      if (btn) btn.focus();
    } catch (_) {}
  }, 300);
}
