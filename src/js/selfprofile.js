// Self profile card ala Discord (laptop) + Edit Profile + Nameplate + Avatar.
// Semua gratis, tanpa Nitro/Shop. GIF avatar tetap animasi via <img>.
(function () {
  var NAMEPLATE_PRESETS = [
    { id: 'sunset', label: "Nature's Glitter", css: 'linear-gradient(135deg,#3a1c00,#ff6a00,#ffd29b)' },
    { id: 'sunflower', label: 'Sunflower', css: 'linear-gradient(135deg,#4a3a00,#b89b00,#ffe97b)' },
    { id: 'smoke', label: 'Smoke', css: 'linear-gradient(135deg,#222,#666,#ccc)' },
    { id: 'ember', label: 'Ember', css: 'linear-gradient(135deg,#2a0000,#a31212,#ff6a00)' },
    { id: 'sakura', label: 'Sakura', css: 'linear-gradient(135deg,#3d0a2e,#a3125b,#ff9ecf)' }
  ];
  var BANNER_PRESETS = [
    { id: '', label: 'Default', css: 'linear-gradient(135deg,#232526,#414345)' },
    { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg,#ff6a00,#ee0979)' },
    { id: 'ocean', label: 'Ocean', css: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
    { id: 'forest', label: 'Forest', css: 'linear-gradient(135deg,#134e5e,#71b280)' },
    { id: 'neon', label: 'Neon', css: 'linear-gradient(135deg,#8e2de2,#00f5a0)' }
  ];
  var STATUS_OPTS = [
    { id: 'online', label: 'Online', dot: '#23a55a' },
    { id: 'idle', label: 'Idle', dot: '#f0b232' },
    { id: 'dnd', label: 'Do Not Disturb', dot: '#f23f43' },
    { id: 'invisible', label: 'Invisible', dot: '#555' }
  ];

  function me() { return (typeof currentUser !== 'undefined') ? currentUser : null; }
  function esc(s) { try { return escapeHtml(String(s == null ? '' : s)); } catch (_) { return ''; } }
  function imgSrc(u) { try { return imageSrc(u); } catch (_) { return u || ''; } }

  function nameplateStyle(np) {
    if (!np) return '';
    if (/^\/uploads\//.test(np) || /^https?:\/\//i.test(np)) {
      return "background-image:url('" + esc(imgSrc(np)) + "');background-size:cover;background-position:center;";
    }
    var p = NAMEPLATE_PRESETS.find(function (x) { return x.id === np; });
    if (p) return 'background:' + p.css + ';';
    return '';
  }

  function statusMeta() {
    var u = me();
    var st = (u && u.status) || 'online';
    // hormati last_seen: basi > 3 mnt = offline (kecuali invisible memang off)
    try {
      var eff = presenceOf(st, u && u.last_seen);
      if (eff === 'off') return { id: 'offline', label: 'Offline', dot: '#555' };
    } catch (_) {}
    return STATUS_OPTS.find(function (x) { return x.id === st; }) || STATUS_OPTS[0];
  }

  // ===== FLOATING SELF CARD (klik profile card, bukan ikon) =====
  window.openSelfCard = function (anchor) {
    closeSelfCard();
    var u = me();
    if (!u) return;
    var name = u.username || u.email || 'User';
    var st = statusMeta();
    var x = null, y = null;
    try {
      var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
      var mobile = window.NobarlyMobile && window.NobarlyMobile.isMobile();
      if (r && !mobile) {
        x = Math.min(r.left, window.innerWidth - 360);
        y = Math.max(10, Math.min(r.top - 180, window.innerHeight - 560));
        if (x < 90) x = 90;
      }
    } catch (_) {}

    var overlay = document.createElement('div');
    overlay.id = 'selfcard-overlay';
    overlay.className = 'selfcard-overlay';
    var banner = '';
    try { banner = bannerHtml(u.banner); } catch (_) { banner = '<div class="profile-banner banner-default"></div>'; }
    var av = '';
    try { av = avatarHtml(name, u.avatar_url, 'selfcard-avatar', false, u.status); }
    catch (_) { av = '<div class="selfcard-avatar">' + esc(name.charAt(0).toUpperCase()) + '</div>'; }

    overlay.innerHTML =
      '<div class="selfcard" id="selfcard" ' + (x !== null ? 'style="left:' + x + 'px;top:' + y + 'px;"' : '') + '>' +
        '<div class="selfcard-banner">' + banner +
          '<div class="selfcard-nameplate" style="' + nameplateStyle(u.nameplate) + '">' +
            '<span class="selfcard-np-avatar">' + (u.avatar_url ? '<img src="' + esc(imgSrc(u.avatar_url)) + '" alt="">' : esc(name.charAt(0).toUpperCase())) + '</span>' +
            '<span class="selfcard-np-name">' + esc(name) + '</span>' +
            (u.server_tag ? '<span class="usertag">' + esc(u.server_tag) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="selfcard-id">' + av +
          '<span class="selfcard-stbadge" style="background:' + st.dot + ';" title="' + esc(st.label) + '"></span>' +
          '<span class="selfcard-idlehint">' + (u.status === 'idle' ? 'Kalo idle = on' : st.label) + '</span>' +
        '</div>' +
        '<div class="selfcard-main">' +
          '<div class="selfcard-name">' + esc(name) + '</div>' +
          '<div class="selfcard-sub">' + esc(name) + (u.server_tag ? ' • ' + esc(u.server_tag) : '') + '</div>' +
          '<div class="selfcard-bio">' + esc((u.bio || 'Belum ada bio.').slice(0, 120)) + '</div>' +
          '<a href="#" class="minipf-fulllink" id="selfcard-fullbio">View Full Bio</a>' +
          '<div class="selfcard-games"><b>Game Collection</b><div class="conn-chips" id="selfcard-conns"></div></div>' +
          '<button class="selfcard-rowbtn" id="selfcard-edit"><i class="fas fa-pen"></i> Edit Profile</button>' +
          '<button class="selfcard-rowbtn" id="selfcard-status"><span class="selfcard-dot" style="background:' + st.dot + ';"></span> ' + esc(st.label) + ' <span style="margin-left:auto;">›</span></button>' +
          '<button class="selfcard-rowbtn" id="selfcard-switch"><i class="fas fa-user-circle"></i> Switch Accounts <span style="margin-left:auto;">›</span></button>' +
          '<div class="selfcard-foot">' +
            '<div class="dmsg-avatar sm" id="selfcard-footav">' + esc(name.charAt(0).toUpperCase()) + '</div>' +
            '<div class="dmsg-me"><b>' + esc(name) + '</b><span>' + esc(st.label) + '</span></div>' +
            '<button class="dmsg-iconbtn" id="selfcard-gear" title="Settings"><i class="fas fa-cog"></i></button>' +
            '<button class="dmsg-iconbtn" id="selfcard-logout" title="Keluar"><i class="fas fa-sign-out-alt"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSelfCard(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escClose);

    // isi koneksi + avatar foot (dukung GIF animasi)
    try {
      var conns = (typeof parseConns === 'function') ? parseConns(u.connections) : {};
      var box = document.getElementById('selfcard-conns');
      if (box) {
        var keys = Object.keys(conns || {}).filter(function (k) { return conns[k]; });
        box.innerHTML = keys.length ? keys.map(function (k) {
          return '<span class="conn-chip conn-' + esc(k) + '">' + esc(k) + ': ' + esc(conns[k]) + '</span>';
        }).join('') : '<span style="font-size:12px;color:#888;">Belum ada game.</span>';
      }
      if (u.avatar_url) {
        var fa = document.getElementById('selfcard-footav');
        if (fa) fa.innerHTML = '<span class="av-initial">' + esc(name.charAt(0).toUpperCase()) + '</span><img src="' + esc(imgSrc(u.avatar_url)) + '" alt="" onerror="this.remove()">';
        if (fa) fa.classList.add('has-photo');
      }
    } catch (_) {}

    document.getElementById('selfcard-fullbio').onclick = function (e) {
      e.preventDefault(); closeSelfCard();
      if (typeof openProfile === 'function') openProfile(u.id);
    };
    document.getElementById('selfcard-edit').onclick = function () { closeSelfCard(); openEditProfileModal(); };
    document.getElementById('selfcard-status').onclick = function () { cycleStatus(); };
    document.getElementById('selfcard-switch').onclick = function () {
      if (confirm('Ganti akun? Sesi ini akan keluar.')) { try { logout(); } catch (_) { window.location.href = 'login.html'; } }
    };
    document.getElementById('selfcard-gear').onclick = function (e) {
      e.stopPropagation(); closeSelfCard(); openSettingsPage();
    };
    document.getElementById('selfcard-logout').onclick = function (e) {
      e.stopPropagation();
      if (confirm('Keluar dari Nobarly?')) { try { logout(); } catch (_) {} }
    };
  };

  function escClose(e) { if (e.key === 'Escape') closeSelfCard(); }
  window.closeSelfCard = function () {
    try {
      document.getElementById('selfcard-overlay')?.remove();
      document.removeEventListener('keydown', escClose);
    } catch (_) {}
  };
  function closeSelfCard() { try { window.closeSelfCard(); } catch (_) {} }

  async function cycleStatus() {
    var u = me();
    if (!u) return;
    var order = ['online', 'idle', 'dnd', 'invisible'];
    var next = order[(order.indexOf(u.status || 'online') + 1) % order.length];
    try {
      var res = await db.from('profiles').update({ status: next }).eq('id', u.id);
      if (res.error) throw new Error(res.error.message);
      currentUser.status = next;
      try { localStorage.setItem('nobarly_user', JSON.stringify(currentUser)); } catch (_) {}
      closeSelfCard();
      window.openSelfCard(document.getElementById('sidebar-user'));
    } catch (e) { alert('Gagal ganti status: ' + (e.message || e)); }
  }

  window.openSettingsPage = function () {
    try {
      document.querySelectorAll('.sidebar-item').forEach(function (i) { i.classList.remove('active'); });
      if (typeof closeChannelSidebar === 'function') closeChannelSidebar();
      if (typeof renderPage === 'function') renderPage('settings');
    } catch (_) {}
  };

  // ===== EDIT PROFILE MODAL (3 kolom ala Discord, tanpa Nitro) =====
  window.openEditProfileModal = function () {
    closeEditProfile();
    var u = me();
    if (!u) return;
    var name = u.username || '';
    var overlay = document.createElement('div');
    overlay.id = 'editpf-overlay';
    overlay.className = 'modal-overlay active editpf-overlay';
    overlay.innerHTML =
      '<div class="modal editpf-modal">' +
        '<div class="modal-header"><h3>Edit Profile</h3><button class="modal-close" id="editpf-close">&times;</button></div>' +
        '<div class="editpf-grid">' +
          // KIRI: kontrol
          '<div class="editpf-left">' +
            '<div class="editpf-sect"><label>Main Profile</label>' +
              '<div class="form-group"><input type="text" id="ep-display" maxlength="50" value="' + esc(name) + '" placeholder="Display name"></div>' +
              '<div class="form-group"><input type="text" id="ep-tag" maxlength="24" value="' + esc(u.server_tag || '') + '" placeholder="Server tag (badge)"></div>' +
            '</div>' +
            '<div class="editpf-sect"><label>Nameplate</label>' +
              '<div class="editpf-np" id="ep-np-preview" style="' + nameplateStyle(u.nameplate) + '"><span>' + esc(name || 'Nama') + '</span></div>' +
              '<button class="btn btn-secondary" id="ep-np-change" style="width:100%;margin-top:8px;">Change Nameplate</button>' +
              '<p class="auth-hint" style="text-align:left;">Bisa pakai foto sendiri. Disarankan 600×120px, JPG/PNG/GIF/WebP maks 5MB. Teks di tengah, jangan taruh elemen penting di 24px tepi.</p>' +
            '</div>' +
            '<div class="editpf-sect"><label>Avatar</label>' +
              '<div class="editpf-avatars">' +
                '<div class="editpf-avcur" id="ep-avcur">' + (u.avatar_url ? '<img src="' + esc(imgSrc(u.avatar_url)) + '" alt="">' : esc((name || '?').charAt(0).toUpperCase())) + '</div>' +
                '<button class="btn btn-secondary" id="ep-av-change">Change Avatar</button>' +
              '</div>' +
              '<p class="auth-hint" style="text-align:left;">GIF didukung gratis — avatar animasi tampil bergerak di chat, DM, voice & profil.</p>' +
            '</div>' +
            '<div class="editpf-sect"><label>Banner Color</label>' +
              '<div class="pickrow" id="ep-banners">' +
                BANNER_PRESETS.map(function (b) {
                  var sel = ((u.banner || '') === b.id) ? ' sel' : '';
                  return '<button class="pick' + sel + '" data-v="' + b.id + '" style="background:' + b.css + ';min-width:64px;height:34px;" title="' + esc(b.label) + '"></button>';
                }).join('') +
              '</div>' +
              '<div class="form-group" style="margin-top:8px;"><label>Atau warna bebas</label><input type="color" id="ep-banner-color" value="#2b2d31" style="width:100%;height:40px;padding:2px;"></div>' +
              '<div class="form-group"><label>Atau foto banner sendiri</label><input type="file" id="ep-banner-photo" accept="image/jpeg,image/png,image/gif,image/webp"></div>' +
            '</div>' +
            '<div class="editpf-sect"><label>Avatar Frame (gratis)</label>' +
              '<div class="framerow" id="ep-frames">' +
                [['', 'Tanpa frame', 'transparent'], ['white', 'Putih', '#FFFFFF'], ['gold', 'Emas', '#FFD700'], ['red', 'Merah', '#f23f43'], ['blue', 'Biru', '#3b9dff']].map(function (f) {
                  return '<button type="button" class="framepick' + ((u.avatar_frame || '') === f[0] ? ' sel' : '') + '" data-v="' + f[0] + '" title="' + f[1] + '" style="border-color:' + f[2] + ';"><span>' + f[1] + '</span></button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="editpf-sect"><label>Bio (maks 280)</label>' +
              '<textarea id="ep-bio" rows="3" maxlength="280" placeholder="Ceritakan tentangmu">' + esc(u.bio || '') + '</textarea>' +
            '</div>' +
            '<div class="editpf-sect"><label>Status</label><select id="ep-status">' +
              STATUS_OPTS.map(function (s) { return '<option value="' + s.id + '"' + ((u.status || 'online') === s.id ? ' selected' : '') + '>' + s.label + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="editpf-sect"><label>Connections (Game Collection)</label><div id="ep-conns"></div></div>' +
          '</div>' +
          // TENGAH: preview
          '<div class="editpf-center">' +
            '<div class="editpf-previewcard">' +
              '<div id="ep-prev-banner"></div>' +
              '<div class="editpf-prevrow"><div id="ep-prev-avatar"></div></div>' +
              '<div class="editpf-prevname" id="ep-prev-name"></div>' +
              '<div class="editpf-prevsub" id="ep-prev-sub"></div>' +
              '<div class="editpf-prevbio" id="ep-prev-bio"></div>' +
            '</div>' +
            '<p class="auth-hint">Preview langsung — berkreasilah sesukamu, semua gratis.</p>' +
          '</div>' +
          // KANAN: widgets
          '<div class="editpf-right">' +
            '<div class="editpf-tabs"><b class="sel">Board</b><span>Activity</span><span>Wishlist</span></div>' +
            '<div class="editpf-widgets"><div class="editpf-whead"><b>Your Widgets</b><button class="btn btn-secondary" id="ep-add-widget" style="width:auto;padding:6px 10px;font-size:12px;">+ Add Widget</button></div>' +
            '<div class="editpf-games" id="ep-games"></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer"><div class="auth-error" id="ep-error" style="flex:1;text-align:left;margin:0;"></div>' +
        '<button class="btn btn-secondary" id="ep-cancel">Batal</button>' +
        '<button class="btn btn-primary" id="ep-save" style="width:auto;">Simpan</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeEditProfile(); });
    document.getElementById('editpf-close').onclick = closeEditProfile;
    // ID tombol Batal adalah ep-cancel (dulu salah tulis editpf-cancel → throw
    // di sini mematikan SELURUH sisa init: preview, connections, Save ikut mati).
    var epCancelBtn = document.getElementById('ep-cancel');
    if (epCancelBtn) epCancelBtn.onclick = closeEditProfile;

    // connections editor
    var conns = {};
    try { conns = (typeof parseConns === 'function') ? parseConns(u.connections) : {}; } catch (_) {}
    var connKeys = ['roblox', 'spotify', 'tiktok', 'xbox', 'valorant', 'mlbb'];
    var connBox = document.getElementById('ep-conns');
    connBox.innerHTML = connKeys.map(function (k) {
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><span style="width:70px;font-size:12px;color:#888;">' + esc(k) + '</span><input type="text" id="ep-conn-' + k + '" value="' + esc((conns && conns[k]) || '') + '" maxlength="50" placeholder="username ' + esc(k) + '"></div>';
    }).join('');

    var selBanner = u.banner || '';
    var selBannerPhoto = null;
    var selNameplate = u.nameplate || '';
    var selAvatarFile = null;
    var selAvatarUrl = u.avatar_url || '';
    var selFrame = u.avatar_frame || '';

    document.querySelectorAll('#ep-banners .pick').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#ep-banners .pick').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        selBanner = b.dataset.v;
        selBannerPhoto = null;
        var fi = document.getElementById('ep-banner-photo');
        if (fi) fi.value = '';
        refreshPreview();
      });
    });
    document.getElementById('ep-banner-photo').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      selBannerPhoto = f;
      selBanner = '__photo__';
      refreshPreview();
    });
    document.getElementById('ep-banner-color').addEventListener('input', function (e) {
      selBanner = e.target.value;
      selBannerPhoto = null;
      document.querySelectorAll('#ep-banners .pick').forEach(function (x) { x.classList.remove('sel'); });
      refreshPreview();
    });

    function refreshPreview() {
      var dname = document.getElementById('ep-display').value.trim() || 'Nama';
      var tag = document.getElementById('ep-tag').value.trim();
      var bio = document.getElementById('ep-bio').value.trim() || 'Belum ada bio.';
      // banner
      var bb = document.getElementById('ep-prev-banner');
      if (selBanner === '__photo__' && selBannerPhoto) {
        bb.innerHTML = '<div class="profile-banner" style="background-image:url(\'' + URL.createObjectURL(selBannerPhoto) + '\');background-size:cover;background-position:center;height:110px;"></div>';
      } else if (selBanner && (/^#/.test(selBanner))) {
        bb.innerHTML = '<div class="profile-banner" style="background:' + esc(selBanner) + ';height:110px;"></div>';
      } else if (selBanner && (/^\//.test(selBanner) || /^https?:\/\//i.test(selBanner))) {
        bb.innerHTML = '<div class="profile-banner" style="background-image:url(\'' + esc(imgSrc(selBanner)) + '\');background-size:cover;background-position:center;height:110px;"></div>';
      } else {
        var pr = BANNER_PRESETS.find(function (x) { return x.id === selBanner; }) || BANNER_PRESETS[0];
        bb.innerHTML = '<div class="profile-banner" style="background:' + pr.css + ';height:110px;"></div>';
      }
      // avatar (GIF preview animasi otomatis via <img>) + frame pilihan
      var frameCls = selFrame ? ' avframe-' + selFrame : '';
      var cur = document.getElementById('ep-avcur');
      if (cur) cur.className = 'editpf-avcur' + frameCls;
      var pa = document.getElementById('ep-prev-avatar');
      if (selAvatarFile) {
        pa.innerHTML = '<div class="editpf-avcur' + frameCls + '"><img src="' + URL.createObjectURL(selAvatarFile) + '" alt=""></div>';
      } else if (selAvatarUrl) {
        pa.innerHTML = '<div class="editpf-avcur' + frameCls + '"><img src="' + esc(imgSrc(selAvatarUrl)) + '" alt=""></div>';
      } else {
        pa.innerHTML = '<div class="editpf-avcur' + frameCls + '">' + esc(dname.charAt(0).toUpperCase()) + '</div>';
      }
      document.getElementById('ep-prev-name').textContent = dname;
      document.getElementById('ep-prev-sub').textContent = dname + (tag ? ' • ' + tag : '');
      document.getElementById('ep-prev-bio').textContent = bio;
      // nameplate preview kiri
      var np = document.getElementById('ep-np-preview');
      np.setAttribute('style', nameplateStyle(selNameplate));
      np.innerHTML = '<span>' + esc(dname) + '</span>' + (tag ? ' <span class="usertag">' + esc(tag) + '</span>' : '');
      // games kanan
      var games = connKeys.map(function (k) {
        var v = (document.getElementById('ep-conn-' + k) || {}).value || '';
        return v.trim() ? { k: k, v: v.trim() } : null;
      }).filter(Boolean);
      document.getElementById('ep-games').innerHTML = games.length
        ? games.map(function (g) { return '<div class="editpf-game"><b>' + esc(g.k) + '</b><span>' + esc(g.v) + '</span></div>'; }).join('')
        : '<p class="no-comments">Tambah game favoritmu (maks 20).</p>';
    }
    ['ep-display', 'ep-tag', 'ep-bio'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', refreshPreview);
    });
    connKeys.forEach(function (k) {
      var el = document.getElementById('ep-conn-' + k);
      if (el) el.addEventListener('input', refreshPreview);
    });
    // Frame picker: ganti border avatar + live preview (dulu "Segera hadir" mati)
    document.querySelectorAll('#ep-frames .framepick').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#ep-frames .framepick').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        selFrame = b.dataset.v;
        refreshPreview();
      });
    });
    // + Add Widget: antar ke editor Connections (dulu cuma alert mati)
    document.getElementById('ep-add-widget').onclick = function () {
      var box = document.getElementById('ep-conns');
      if (!box) return;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.classList.remove('flash-focus');
      void box.offsetWidth;
      box.classList.add('flash-focus');
      var first = box.querySelector('input');
      if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); } }, 450);
    };

    document.getElementById('ep-np-change').onclick = function () {
      openNameplateDialog(selNameplate, function (v) {
        selNameplate = v || '';
        refreshPreview();
      });
    };
    document.getElementById('ep-av-change').onclick = function () {
      openAvatarDialog(selAvatarUrl, function (res) {
        if (res && res.file) {
          selAvatarFile = res.file;
          var cur = document.getElementById('ep-avcur');
          cur.innerHTML = '<img src="' + URL.createObjectURL(res.file) + '" alt="">';
        } else if (res && res.url !== undefined) {
          selAvatarFile = null;
          selAvatarUrl = res.url;
          var cur2 = document.getElementById('ep-avcur');
          cur2.innerHTML = selAvatarUrl ? '<img src="' + esc(imgSrc(selAvatarUrl)) + '" alt="">' : '?';
        }
        refreshPreview();
      });
    };

    refreshPreview();

    document.getElementById('ep-save').onclick = async function (e) {
      var btn = e.currentTarget;
      var errBox = document.getElementById('ep-error');
      function showErr(m) {
        if (!m) { errBox.classList.remove('show'); errBox.textContent = ''; return; }
        errBox.textContent = m; errBox.classList.add('show');
      }
      showErr(null);
      btn.disabled = true;
      try {
        var username = document.getElementById('ep-display').value.trim();
        var bio = document.getElementById('ep-bio').value.trim();
        var status = document.getElementById('ep-status').value;
        var tag = document.getElementById('ep-tag').value.trim();
        if (username.length < 3) throw new Error('Display name minimal 3 karakter.');
        var connections = {};
        connKeys.forEach(function (k) {
          var v = (document.getElementById('ep-conn-' + k).value || '').trim();
          if (v) connections[k] = v;
        });
        var payload = { username: username, bio: bio, status: status, server_tag: tag, connections: connections, avatar_frame: selFrame || null };
        // avatar
        if (selAvatarFile) {
          payload.avatar_url = await uploadImage(selAvatarFile);
          pushRecentAvatar(payload.avatar_url);
        } else if (selAvatarUrl !== (u.avatar_url || '')) {
          payload.avatar_url = selAvatarUrl || null;
        }
        // banner
        if (selBannerPhoto) {
          payload.banner = await uploadImage(selBannerPhoto);
        } else if (selBanner === '__photo__') {
          // foto dihapus pilihannya? biarkan lama
        } else if (/^#/.test(selBanner || '')) {
          // warna bebas: simpan sebagai URL? backend banner hanya gradien id / URL.
          // Simpan warna hex ke nameplate? Tidak — simpan ke localStorage + pakai CSS var?
          // Praktis: simpan hex sebagai banner (kolom varchar 500, backend terima 24 char max untuk non-URL).
          // Hex 7 char lolos. render bannerHtml perlu dukung hex → kita tangani di CSS runtime.
          payload.banner = selBanner;
        } else {
          payload.banner = selBanner || null;
        }
        // nameplate (kolom baru; kalau backend belum migrasi, fallback localStorage)
        var nameplateSaved = false;
        try {
          var test = await db.from('profiles').update({ nameplate: selNameplate || null }).eq('id', u.id);
          if (!test.error) nameplateSaved = true;
        } catch (_) {}
        if (!nameplateSaved) {
          try { localStorage.setItem('nobarly_nameplate_' + u.id, selNameplate || ''); } catch (_) {}
        }
        var res = await db.from('profiles').update(payload).eq('id', u.id);
        if (res.error) throw new Error(res.error.message);
        var fresh = res.data || payload;
        try {
          var safe = Object.assign({}, currentUser, fresh);
          delete safe.password_hash;
          currentUser = safe;
          localStorage.setItem('nobarly_user', JSON.stringify(currentUser));
        } catch (_) {}
        if (typeof renderSidebarAvatar === 'function') renderSidebarAvatar();
        if (typeof renderChannelUser === 'function') renderChannelUser();
        if (typeof refreshMiniProfile === 'function') refreshMiniProfile();
        // simpan nameplate lokal juga untuk render instan
        try {
          currentUser.nameplate = selNameplate || null;
          localStorage.setItem('nobarly_user', JSON.stringify(currentUser));
        } catch (_) {}
        closeEditProfile();
        alert('Profil tersimpan. Semua gratis — tanpa Nitro.');
      } catch (err) {
        showErr(err.message || 'Gagal menyimpan.');
      } finally {
        btn.disabled = false;
      }
    };
  };

  window.closeEditProfile = function () {
    try { document.getElementById('editpf-overlay')?.remove(); } catch (_) {}
  };
  function closeEditProfile() { try { window.closeEditProfile(); } catch (_) {} }

  // ===== CHANGE NAMEPLATE (ganti Shop → Customize) =====
  window.openNameplateDialog = function (current, onApply) {
    var old = document.getElementById('nameplate-overlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'nameplate-overlay';
    overlay.className = 'modal-overlay active';
    var sel = current || '';
    overlay.innerHTML =
      '<div class="modal np-modal">' +
        '<div class="modal-header"><h3>Change Nameplate</h3><button class="modal-close" id="np-close">&times;</button></div>' +
        '<div class="np-grid">' +
          '<div class="np-left"><label>Your Nameplates</label><div class="np-list" id="np-list"></div>' +
            '<div class="np-uploadbox"><b>Pakai foto sendiri (gratis)</b>' +
            '<p>Disarankan <b>600×120px</b>, JPG/PNG/GIF/WebP maks 5MB. Teks nama di tengah — sisakan 24px aman di tiap tepi. GIF ikut bergerak.</p>' +
            '<input type="file" id="np-file" accept="image/jpeg,image/png,image/gif,image/webp">' +
            '<button class="btn btn-secondary" id="np-upload" style="width:100%;margin-top:8px;">Upload & Pakai</button></div>' +
          '</div>' +
          '<div class="np-right"><div class="np-previewlist" id="np-chatpreview"></div>' +
            '<div class="np-desc" id="np-desc"></div></div>' +
        '</div>' +
        '<div class="modal-footer"><button class="btn btn-secondary" id="np-cancel">Cancel</button>' +
        '<button class="btn btn-primary" id="np-apply" style="width:auto;">Apply</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    function renderList() {
      var list = document.getElementById('np-list');
      var items = [{ id: '', label: 'None' }, { id: '__custom__', label: 'Customize' }].concat(NAMEPLATE_PRESETS);
      // custom upload yang sudah ada (URL) tampil sebagai opsi
      if (sel && (/^\//.test(sel) || /^https?:\/\//i.test(sel))) {
        items.push({ id: sel, label: 'Foto sendiri', css: null, url: sel });
      }
      list.innerHTML = items.map(function (it) {
        var style = it.url ? "background-image:url('" + esc(imgSrc(it.url)) + "');background-size:cover;background-position:center;"
          : (it.css ? 'background:' + it.css + ';' : 'background:#111;');
        var cls = (sel === it.id || (it.id === '__custom__' && sel && (/^\//.test(sel) || /^https?:/.test(sel)))) ? ' sel' : '';
        var icon = it.id === '' ? '🚫' : (it.id === '__custom__' ? '🎨' : '◍');
        return '<button class="np-item' + cls + '" data-v="' + esc(it.id) + '">' +
          '<span class="np-thumb" style="' + style + '"></span><span>' + icon + ' ' + esc(it.label) + '</span></button>';
      }).join('');
      list.querySelectorAll('.np-item').forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.v === '__custom__') {
            document.getElementById('np-file').focus();
            return;
          }
          sel = b.dataset.v;
          renderList(); renderPreview();
        };
      });
    }
    function renderPreview() {
      // Baris konteks di atas/bawah (dulu rows.slice(0,60) memotong STRING html
      // di tengah tag → markup rusak).
      var rowAbove = '<div class="np-chatrow"><span class="dmsg-avatar sm">Z</span><span class="np-chatbar"></span></div>';
      var rowBelow = '<div class="np-chatrow"><span class="dmsg-avatar sm">Z</span><span class="np-chatbar"></span></div>';
      var meName = (me() && (me().username || 'Its Zazil')) || 'Its Zazil';
      var hasAv = !!(me() && me().avatar_url);
      var hl = '<div class="np-chatrow hl"><span class="dmsg-avatar sm' + (hasAv ? ' has-photo' : '') + '">' + (hasAv ? '<img src="' + esc(imgSrc(me().avatar_url)) + '" alt="">' : 'Z') + '</span>' +
        '<span class="np-hl" style="' + nameplateStyle(sel) + '">' + esc(meName) + '</span></div>';
      document.getElementById('np-chatpreview').innerHTML = rowAbove + hl + rowBelow;
      var meta = NAMEPLATE_PRESETS.find(function (x) { return x.id === sel; });
      document.getElementById('np-desc').innerHTML = sel === ''
        ? '<b>Tanpa nameplate</b><p>Tampilan nama polos.</p>'
        : (meta ? '<b>' + esc(meta.label) + '</b><p>Gratis untuk semua pengguna Nobarly.</p>'
        : '<b>Foto sendiri</b><p>Pratinjau di atas. Pastikan teks terbaca di tengah.</p>');
    }
    renderList(); renderPreview();

    document.getElementById('np-upload').onclick = async function (e) {
      var btn = e.currentTarget;
      var f = document.getElementById('np-file').files[0];
      if (!f) { alert('Pilih foto dulu (600×120 disarankan).'); return; }
      btn.disabled = true;
      try {
        var url = await uploadImage(f);
        sel = url;
        renderList(); renderPreview();
      } catch (err) { alert(err.message || 'Upload gagal.'); }
      finally { btn.disabled = false; }
    };
    function done(apply) {
      var v = apply ? sel : null;
      overlay.remove();
      if (apply && typeof onApply === 'function') onApply(v);
    }
    document.getElementById('np-close').onclick = function () { done(false); };
    document.getElementById('np-cancel').onclick = function () { done(false); };
    document.getElementById('np-apply').onclick = function () { done(true); };
    overlay.addEventListener('click', function (e) { if (e.target === overlay) done(false); });
  };

  // ===== SELECT AVATAR (tanpa Nitro) =====
  window.openAvatarDialog = function (currentUrl, onPick) {
    var old = document.getElementById('avatar-overlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'avatar-overlay';
    overlay.className = 'modal-overlay active';
    var recents = getRecentAvatars();
    overlay.innerHTML =
      '<div class="modal av-modal">' +
        '<div class="modal-header"><h3>Select an Image</h3><button class="modal-close" id="av-close">&times;</button></div>' +
        '<div class="modal-body">' +
          '<div class="av-choices">' +
            '<button class="av-choice" id="av-upload-btn"><i class="fas fa-image"></i><b>Upload Image</b><span>JPG/PNG/GIF/WebP • 5MB</span></button>' +
            '<button class="av-choice" id="av-gif-btn"><i class="fas fa-film"></i><b>Choose GIF</b><span>Animasi ikut bergerak di chat</span></button>' +
            '<input type="file" id="av-file" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">' +
          '</div>' +
          '<label style="font-size:13px;font-weight:700;">Recent Avatars</label>' +
          '<p class="auth-hint" style="text-align:left;">6 upload terakhirmu.</p>' +
          '<div class="av-recents" id="av-recents">' +
            (recents.length ? recents.map(function (u) {
              return '<button class="av-recent' + (u === currentUrl ? ' sel' : '') + '" data-u="' + esc(u) + '"><img src="' + esc(imgSrc(u)) + '" alt="" loading="lazy"></button>';
            }).join('') : '<p class="no-comments">Belum ada.</p>') +
          '</div>' +
          '<div class="av-free">Avatar animasi <b>gratis</b> — GIF tampil bergerak di chat, DM, voice & profil. Tanpa Nitro.</div>' +
        '</div>' +
        '<div class="modal-footer"><button class="btn btn-secondary" id="av-cancel">Batal</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    var fileInp = document.getElementById('av-file');
    var gifMode = false;
    document.getElementById('av-upload-btn').onclick = function () { gifMode = false; fileInp.click(); };
    document.getElementById('av-gif-btn').onclick = function () { gifMode = true; fileInp.click(); };
    fileInp.onchange = function () {
      var f = fileInp.files[0];
      if (!f) return;
      if (gifMode && !/gif/i.test(f.type) && !/\.gif$/i.test(f.name || '')) {
        if (!confirm('Ini bukan GIF. Tetap pakai gambar ini?')) return;
      }
      overlay.remove();
      if (typeof onPick === 'function') onPick({ file: f });
    };
    overlay.querySelectorAll('.av-recent').forEach(function (b) {
      b.onclick = function () {
        overlay.remove();
        if (typeof onPick === 'function') onPick({ url: b.dataset.u });
      };
    });
    function close() { try { overlay.remove(); } catch (_) {} }
    document.getElementById('av-close').onclick = close;
    document.getElementById('av-cancel').onclick = close;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  };

  function getRecentAvatars() {
    try {
      var raw = localStorage.getItem('nobarly_recent_avatars');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 6) : [];
    } catch (_) { return []; }
  }
  function pushRecentAvatar(url) {
    try {
      var arr = getRecentAvatars().filter(function (x) { return x !== url; });
      arr.unshift(url);
      localStorage.setItem('nobarly_recent_avatars', JSON.stringify(arr.slice(0, 6)));
    } catch (_) {}
  }
  window.pushRecentAvatar = pushRecentAvatar;

  // nameplate helper global (dipakai chat/DM bila mau)
  window.nameplateStyle = nameplateStyle;
  window.NAMEPLATE_PRESETS = NAMEPLATE_PRESETS;
})();
