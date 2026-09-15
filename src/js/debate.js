// Arena Debat (khas Nobarly): PRO vs KONTRA, giliran bicara + voting penonton.
var currentDebateId = null;
var debatePoll = null;
var debateTick = 0;

function stopDebate() {
  if (debatePoll) {
    clearInterval(debatePoll);
    debatePoll = null;
  }
  currentDebateId = null;
  debateTick = 0;
}

function setupDebateModal() {
  const modal = document.getElementById('create-debate-modal');
  if (!modal) return;
  document.getElementById('close-debate-modal').addEventListener('click', closeDebateModal);
  document.getElementById('cancel-debate').addEventListener('click', closeDebateModal);
  document.getElementById('confirm-debate').addEventListener('click', createDebate);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeDebateModal(); });
}

function openDebateModal() {
  document.getElementById('create-debate-modal').classList.add('active');
}

function closeDebateModal() {
  document.getElementById('create-debate-modal').classList.remove('active');
  document.getElementById('debate-title').value = '';
  document.getElementById('debate-desc').value = '';
  document.getElementById('debate-side-a').value = '';
  document.getElementById('debate-side-b').value = '';
}

async function loadDebatePage() {
  stopDebate();
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');

  title.textContent = 'Arena Debat';
  actions.innerHTML = '<button class="btn btn-primary" id="btn-create-debate"><i class="fas fa-plus"></i> Buat Debat</button>';
  document.getElementById('btn-create-debate').addEventListener('click', openDebateModal);

  body.innerHTML = '<div class="loading-post"><div class="spinner" style="display:inline-block"></div> Memuat arena...</div>';

  const { data: debates, error } = await apiFetch('/debates');
  if (error) {
    body.innerHTML = `<div class="empty-state"><h3>Gagal memuat</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }

  if (!debates || debates.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-scale-balanced"></i>
        <h3>Belum Ada Debat</h3>
        <p>Buat arena debat pertama! PRO vs KONTRA, penonton yang menentukan.</p>
      </div>`;
    return;
  }

  const badge = { open: 'status-upcoming', live: 'status-live', closed: 'status-ended' };
  const label = { open: 'BUKA', live: 'LIVE', closed: 'SELESAI' };
  body.innerHTML = '<div class="community-grid" id="debate-grid"></div>';
  document.getElementById('debate-grid').innerHTML = debates.map(d => `
    <div class="community-card" onclick="openDebate('${d.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span class="community-card-tag">${escapeHtml(d.side_a)} vs ${escapeHtml(d.side_b)}</span>
        <span class="esports-status ${badge[d.status] || 'status-upcoming'}">${label[d.status] || d.status}</span>
      </div>
      <h3>${escapeHtml(d.title)}</h3>
      <p>${escapeHtml((d.description || 'Tanpa deskripsi').slice(0, 120))}</p>
    </div>`).join('');
}

async function createDebate() {
  const title = document.getElementById('debate-title').value.trim();
  const description = document.getElementById('debate-desc').value.trim();
  const sideA = document.getElementById('debate-side-a').value.trim() || 'PRO';
  const sideB = document.getElementById('debate-side-b').value.trim() || 'KONTRA';
  const turnSeconds = parseInt(document.getElementById('debate-turn').value, 10) || 120;

  if (!title) { alert('Topik debat wajib diisi!'); return; }

  const { error } = await apiFetch('/debates', {
    method: 'POST',
    body: JSON.stringify({
      community_id: currentCommunity,
      host_id: currentUser.id,
      title, description,
      side_a: sideA, side_b: sideB,
      turn_seconds: turnSeconds
    })
  });
  if (error) { alert('Gagal membuat debat: ' + error.message); return; }

  closeDebateModal();
  loadDebatePage();
}

async function openDebate(debateId) {
  currentDebateId = debateId;
  const { data: d, error } = await apiFetch(`/debates/${debateId}`);
  if (error || !d) {
    alert('Gagal membuka debat: ' + (error?.message || 'tidak ditemukan'));
    return;
  }
  renderDebateDetail(d);

  if (debatePoll) clearInterval(debatePoll);
  debateTick = 0;
  debatePoll = setInterval(async () => {
    if (currentDebateId !== debateId) return;
    if (typeof NobarlyPollActive === 'function' && !NobarlyPollActive()) return;
    debateTick++;
    updateDebateTimer();
    if (debateTick % 5 === 0) {
      const { data: fresh } = await apiFetch(`/debates/${debateId}`);
      if (fresh && currentDebateId === debateId) renderDebateDetail(fresh, true);
    }
  }, 1000);
}

function updateDebateTimer() {
  const elTimer = document.getElementById('debate-timer');
  const endsAt = document.getElementById('debate-timer')?.dataset.endsAt;
  if (!elTimer || !endsAt) return;
  const diff = Math.max(0, new Date(endsAt) - new Date());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  elTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function renderDebateDetail(d, soft) {
  if (currentDebateId !== d.id) return;
  const title = document.getElementById('page-title');
  const actions = document.getElementById('header-actions');
  const body = document.getElementById('content-body');
  if (!body) return;

  title.textContent = 'Debat';
  const isHost = currentUser && d.host_id === currentUser.id;
  actions.innerHTML = `
    <button class="btn btn-secondary" id="btn-back-debate"><i class="fas fa-arrow-left"></i> Kembali</button>
    ${isHost && d.status !== 'closed' ? '<button class="btn btn-primary" id="btn-close-debate" style="width:auto;"><i class="fas fa-flag-checkered"></i> Tutup & Umumkan</button>' : ''}`;
  document.getElementById('btn-back-debate').addEventListener('click', () => { stopDebate(); loadDebatePage(); });
  const btnClose = document.getElementById('btn-close-debate');
  if (btnClose) btnClose.addEventListener('click', () => debateSetStatus(d.id, 'closed'));

  const mySpeaker = (d.speakers || []).find(s => s.user_id === currentUser.id);
  const speakersA = (d.speakers || []).filter(s => s.side === 'A');
  const speakersB = (d.speakers || []).filter(s => s.side === 'B');
  const total = (d.votes_a || 0) + (d.votes_b || 0);
  const pctA = total === 0 ? 50 : Math.round((d.votes_a / total) * 100);
  const statusLabel = { open: 'PENDAFTARAN', live: 'DEBAT BERLANGSUNG', closed: 'SELESAI' };

  const sidePanel = (side, sideName, speakers, votes) => {
    const active = d.status === 'live' && d.current_side === side;
    const joined = mySpeaker && mySpeaker.side === side;
    return `
      <div class="debate-side ${active ? 'debate-side-active' : ''}">
        <h3>${escapeHtml(sideName)}</h3>
        <div class="debate-votes">${votes} vote</div>
        <div class="debate-speakers">
          ${speakers.length === 0 ? '<p class="no-comments">Belum ada pembicara.</p>' : speakers.map(s =>
            `<div class="voice-user">${avatarHtml(s.username, s.avatar_url, 'voice-user-avatar', false)}<span>${escapeHtml(s.username || 'User')}</span></div>`
          ).join('')}
        </div>
        <div class="debate-side-actions">
          ${d.status !== 'closed' ? (joined
            ? `<button class="btn btn-secondary" onclick="leaveDebateSide('${d.id}')">Turun</button>`
            : `<button class="btn btn-join" onclick="joinDebateSide('${d.id}', '${side}')">Naik (${escapeHtml(sideName)})</button>`) : ''}
          <button class="btn ${'btn-nobar'}" onclick="voteDebate('${d.id}', '${side}')">Vote ${escapeHtml(sideName)}</button>
        </div>
      </div>`;
  };

  body.innerHTML = `
    <div class="debate-detail">
      <div class="debate-head">
        <span class="esports-status ${d.status === 'live' ? 'status-live' : d.status === 'closed' ? 'status-ended' : 'status-upcoming'}">${statusLabel[d.status]}</span>
        <h2>${escapeHtml(d.title)}</h2>
        ${d.description ? `<p>${escapeHtml(d.description)}</p>` : ''}
        ${d.status === 'live' ? `
          <div class="debate-turn-bar">
            <span>Giliran: <b>${d.current_side === 'A' ? escapeHtml(d.side_a) : escapeHtml(d.side_b)}</b></span>
            <span class="esports-status status-soon" id="debate-timer" data-ends-at="${d.turn_ends_at || ''}">--:--</span>
            ${isHost ? `
              <button class="btn btn-secondary" onclick="debateNextTurn('${d.id}', '${d.current_side === 'A' ? 'B' : 'A'}')">Ganti Giliran</button>
            ` : ''}
          </div>` : ''}
        ${isHost && d.status === 'open' ? `<button class="btn btn-primary" style="width:auto;margin-top:10px;" onclick="debateSetStatus('${d.id}', 'live')"><i class="fas fa-play"></i> Mulai Debat</button>` : ''}
      </div>
      <div class="debate-result-bar">
        <div class="debate-result-a" style="width:${pctA}%">${d.votes_a || 0}</div>
        <div class="debate-result-b">${d.votes_b || 0}</div>
      </div>
      <div class="debate-sides">
        ${sidePanel('A', d.side_a, speakersA, d.votes_a || 0)}
        <div class="debate-vs">VS</div>
        ${sidePanel('B', d.side_b, speakersB, d.votes_b || 0)}
      </div>
      ${d.status === 'closed' ? `<div class="debate-winner">🏆 Pemenang versi penonton: <b>${(d.votes_a || 0) === (d.votes_b || 0) ? 'SERI!' : (d.votes_a || 0) > (d.votes_b || 0) ? escapeHtml(d.side_a) : escapeHtml(d.side_b)}</b></div>` : ''}
    </div>`;

  updateDebateTimer();
}

async function joinDebateSide(debateId, side) {
  const { error } = await apiFetch(`/debates/${debateId}/join`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id, side })
  });
  if (error) { alert('Gagal naik panggung: ' + error.message); return; }
  const { data } = await apiFetch(`/debates/${debateId}`);
  if (data) renderDebateDetail(data, true);
}

async function leaveDebateSide(debateId) {
  await apiFetch(`/debates/${debateId}/join?user_id=${currentUser.id}`, { method: 'DELETE' });
  const { data } = await apiFetch(`/debates/${debateId}`);
  if (data) renderDebateDetail(data, true);
}

async function voteDebate(debateId, side) {
  const { error } = await apiFetch(`/debates/${debateId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ user_id: currentUser.id, side })
  });
  if (error) { alert('Gagal vote: ' + error.message); return; }
  const { data } = await apiFetch(`/debates/${debateId}`);
  if (data) renderDebateDetail(data, true);
}

async function debateSetStatus(debateId, status) {
  const body = { status };
  if (status === 'live') body.current_side = 'A';
  if (status === 'closed' && !confirm('Tutup debat dan umumkan pemenang?')) return;
  const { data, error } = await apiFetch(`/debates/${debateId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (error) { alert('Gagal: ' + error.message); return; }
  if (data) renderDebateDetail(data, true);
}

async function debateNextTurn(debateId, side) {
  const { data, error } = await apiFetch(`/debates/${debateId}`, {
    method: 'PUT',
    body: JSON.stringify({ current_side: side })
  });
  if (error) { alert('Gagal ganti giliran: ' + error.message); return; }
  if (data) renderDebateDetail(data, true);
}
