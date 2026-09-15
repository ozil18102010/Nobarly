// Fitur sosial Nobarly: Colek (nudge) + Poll cepat.
// 100% frontend, reuse API yang sudah ada (channel_messages / dm / reactions)
// jadi tanpa migrasi database & aman untuk APK lama.
// - Colek: pesan spesial "[nudge]" → goyang + getar + bunyi. Ada di channel & DM.
// - Poll: ketik "/poll Mau nobar apa? | Horror | Anime | Bola" (atau tombol 📊)
//   → kartu voting, suara = reaksi 1️⃣2️⃣3️⃣4️⃣ (endpoint reactions yang sudah ada).
(function () {
  var NUDGE_MSG = '[nudge]';
  var NUDGE_COOLDOWN_MS = 10000;
  var POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  window.NUDGE_MSG = NUDGE_MSG;
  window.POLL_EMOJIS = POLL_EMOJIS;

  function isNudgeContent(c) {
    return String(c || '').trim() === NUDGE_MSG;
  }
  window.isNudgeContent = isNudgeContent;

  // ---- Colek: cooldown anti-spam per scope ----
  function nudgeAllowed(scopeKey) {
    try {
      var k = 'nobarly_nudge_' + scopeKey;
      var last = parseInt(localStorage.getItem(k) || '0', 10);
      if (Date.now() - last < NUDGE_COOLDOWN_MS) return false;
      localStorage.setItem(k, String(Date.now()));
      return true;
    } catch (_) { return true; }
  }

  // Efek saat colekanditerima: getar (HP) + layar goyang + bunyi "tuk".
  // Dijaga try/catch total — efek gagal = pesan tetap tampil biasa.
  function playNudgeEffect() {
    try {
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (_) {}
    try {
      document.body.classList.remove('nudge-shake');
      void document.body.offsetWidth;
      document.body.classList.add('nudge-shake');
      setTimeout(function () { document.body.classList.remove('nudge-shake'); }, 600);
    } catch (_) {}
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      window._nudgeAC = window._nudgeAC || new AC();
      var ac = window._nudgeAC;
      if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ac.currentTime);
      o.frequency.setValueAtTime(660, ac.currentTime + 0.12);
      g.gain.setValueAtTime(0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.32);
    } catch (_) {}
  }
  window.playNudgeEffect = playNudgeEffect;

  // Cek pesan terakhir: kalau colek baru dari orang lain → mainkan efek sekali.
  function watchNudge(list, seenKey) {
    try {
      if (!list || !list.length) return;
      var last = list[list.length - 1];
      if (!last || !isNudgeContent(last.content)) return;
      var me = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
      if (me && (last.user_id === me || last.sender_id === me)) return;
      if (window[seenKey] === last.id) return;
      window[seenKey] = last.id;
      playNudgeEffect();
    } catch (_) {}
  }
  window.watchNudge = watchNudge;

  function nudgeCardHtml(name, isMe) {
    var who = isMe ? 'Kamu mencolek!' : ('<b>' + escapeHtml(name || 'User') + '</b> mencolekmu!');
    return '<div class="nudge-card"><span class="nudge-hand">👉</span><span>' + who + '</span></div>';
  }
  window.nudgeCardHtml = nudgeCardHtml;

  async function sendNudgeChannel(channelId) {
    if (!nudgeAllowed('ch_' + channelId)) { alert('Sabar! Colek lagi dalam beberapa detik 😄'); return; }
    try {
      var r = await db.from('channel_messages').insert([{
        channel_id: channelId,
        user_id: currentUser.id,
        content: NUDGE_MSG
      }]);
      if (r && r.error) { alert('Gagal mencolek: ' + r.error.message); return; }
      if (typeof refreshChannelMessages === 'function') refreshChannelMessages(channelId, true);
    } catch (e) { alert('Gagal mencolek.'); }
  }
  window.sendNudgeChannel = sendNudgeChannel;

  async function sendNudgeDM() {
    if (typeof dmPeer === 'undefined' || !dmPeer) return;
    if (!nudgeAllowed('dm_' + dmPeer.id)) { alert('Sabar! Colek lagi dalam beberapa detik 😄'); return; }
    try {
      var r = await apiFetch('/dm', {
        method: 'POST',
        body: JSON.stringify({ sender_id: currentUser.id, receiver_id: dmPeer.id, content: NUDGE_MSG })
      });
      if (r && r.error) { alert('Gagal mencolek: ' + r.error.message); return; }
      if (typeof loadDMMessages === 'function') loadDMMessages(true);
    } catch (e) { alert('Gagal mencolek.'); }
  }
  window.sendNudgeDM = sendNudgeDM;

  // ---- Poll cepat ----
  // Format: /poll Pertanyaan? | Opsi A | Opsi B | Opsi C
  function parsePoll(content) {
    try {
      var s = String(content || '').trim();
      if (!/^\/poll(\s|$)/i.test(s)) return null;
      var rest = s.replace(/^\/poll\s*/i, '');
      var parts = rest.split('|').map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length < 3) return { invalid: true }; // butuh pertanyaan + min 2 opsi
      return { question: parts[0].slice(0, 140), options: parts.slice(1, 5).map(function (o) { return o.slice(0, 60); }) };
    } catch (_) { return null; }
  }
  window.parsePoll = parsePoll;

  function pollBuildText(question, options) {
    return '/poll ' + question + ' | ' + options.join(' | ');
  }

  // Modal buat poll (tanpa prompt() yang mati di WebView HP)
  function openPollModal(channelId) {
    var old = document.getElementById('poll-overlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'poll-overlay';
    overlay.className = 'modal-overlay active';
    overlay.innerHTML =
      '<div class="modal">' +
        '<div class="modal-header"><h3>📊 Buat Polling</h3><button class="modal-close" id="poll-close">&times;</button></div>' +
        '<div class="modal-body">' +
          '<div class="form-group"><label>Pertanyaan</label>' +
          '<input type="text" id="poll-q" placeholder="Mis. Nobar apa malam ini?" maxlength="140"></div>' +
          '<div class="form-group"><label>Opsi 1</label><input type="text" id="poll-o1" placeholder="Horror" maxlength="60"></div>' +
          '<div class="form-group"><label>Opsi 2</label><input type="text" id="poll-o2" placeholder="Anime" maxlength="60"></div>' +
          '<div class="form-group"><label>Opsi 3 (opsional)</label><input type="text" id="poll-o3" placeholder="" maxlength="60"></div>' +
          '<div class="form-group"><label>Opsi 4 (opsional)</label><input type="text" id="poll-o4" placeholder="" maxlength="60"></div>' +
          '<p style="font-size:12px;color:#888;">Teman vote dengan tap 1️⃣2️⃣3️⃣4️⃣ di bawah kartu.</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-secondary" id="poll-cancel">Batal</button>' +
          '<button class="btn btn-primary" id="poll-send" style="width:auto;">Kirim Poll</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var close = function () { overlay.remove(); };
    document.getElementById('poll-close').onclick = close;
    document.getElementById('poll-cancel').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.getElementById('poll-send').onclick = async function () {
      var q = document.getElementById('poll-q').value.trim();
      var opts = ['poll-o1', 'poll-o2', 'poll-o3', 'poll-o4']
        .map(function (id) { return document.getElementById(id).value.trim(); })
        .filter(Boolean);
      if (!q || opts.length < 2) { alert('Isi pertanyaan + minimal 2 opsi.'); return; }
      close();
      var input = document.getElementById('chat-input');
      if (input) input.value = pollBuildText(q, opts);
      if (typeof sendChannelMessage === 'function') sendChannelMessage(channelId);
    };
    setTimeout(function () { document.getElementById('poll-q').focus(); }, 100);
  }
  window.openPollModal = openPollModal;

  function pollCardHtml(msgId, poll) {
    if (poll.invalid) {
      return '<p class="watch-chat-text poll-hint">📊 Format poll: <b>/poll Pertanyaan? | Opsi 1 | Opsi 2</b></p>';
    }
    var opts = poll.options.map(function (op, i) {
      var em = POLL_EMOJIS[i];
      return '<button class="poll-opt" onclick="toggleChatReaction(\'' + msgId + '\', \'' + em + '\')">' +
        '<span class="poll-emoji">' + em + '</span><span class="poll-label">' + escapeHtml(op) + '</span></button>' +
        '<div class="poll-bar"><div class="poll-fill" id="poll-fill-' + msgId + '-' + i + '"></div></div>';
    }).join('');
    return '<div class="poll-card" id="poll-' + msgId + '">' +
      '<div class="poll-q">📊 ' + escapeHtml(poll.question) + '</div>' + opts +
      '<div class="poll-total" id="poll-total-' + msgId + '"></div></div>';
  }
  window.pollCardHtml = pollCardHtml;

  // Dipanggil dari renderMessageReactions tiap refresh: gambar batang vote.
  function paintPollBars(messageId, grouped) {
    try {
      var cache = (typeof chatCache !== 'undefined' && chatCache[messageId]) || null;
      if (!cache) return;
      var poll = parsePoll(cache.content);
      if (!poll || poll.invalid) return;
      var total = 0;
      var counts = poll.options.map(function (_, i) {
        var g = grouped && grouped[POLL_EMOJIS[i]];
        var c = g ? g.count : 0;
        total += c;
        return c;
      });
      poll.options.forEach(function (_, i) {
        var fill = document.getElementById('poll-fill-' + messageId + '-' + i);
        if (fill) fill.style.width = total ? Math.round((counts[i] / total) * 100) + '%' : '0%';
      });
      var t = document.getElementById('poll-total-' + messageId);
      if (t) t.textContent = total ? ('🗳️ ' + total + ' suara') : 'Belum ada suara — jadilah yang pertama!';
    } catch (_) {}
  }
  window.paintPollBars = paintPollBars;
})();
