const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');
const { requireLogin, requireSelf } = require('../middleware/auth');

const router = express.Router();

// Kolom publik profil (tanpa password_hash — dulu SELECT * membocorkannya ke semua user)
// server_tag DIHAPUS permanen.
const PUBLIC_COLS = 'id, username, email, avatar_url, bio, orbs, avatar_frame, banner, nameplate, status, connections, last_seen, created_at';

// GET /api/profiles/search?q=X — cari user by username/email (untuk tambah teman)
router.get('/search', async (req, res) => {
  let conn;
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ data: [], error: null });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, username, email, avatar_url, bio, orbs, avatar_frame, banner, nameplate, status, connections, last_seen, created_at FROM profiles WHERE username LIKE ? OR email LIKE ? ORDER BY username ASC LIMIT 10',
      [`%${q}%`, `%${q}%`]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/profiles/:id
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(`SELECT ${PUBLIC_COLS} FROM profiles WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Not found' } });
    }
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/profiles/:id/seen — heartbeat online (tanpa body, pemilik sendiri)
router.put('/:id/seen', requireLogin, requireSelf('id'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('UPDATE profiles SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ data: { id: req.params.id }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/profiles/:id — update profil (avatar, bio, status, frame, banner, connections, username, nameplate)
const PROFILE_FIELDS = ['avatar_url', 'bio', 'status', 'avatar_frame', 'banner', 'connections', 'username', 'nameplate'];
// Kunci IDOR: dulu tanpa auth, siapa pun bisa PUT /profiles/:id orang lain.
router.put('/:id', requireLogin, requireSelf('id'), async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const updates = {};
    for (const f of PROFILE_FIELDS) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ data: null, error: { message: 'Tidak ada field yang diupdate' } });
    }
    if (updates.avatar_url !== undefined) {
      if (typeof updates.avatar_url !== 'string' || updates.avatar_url.length > 500 ||
          (!/^\/uploads\//.test(updates.avatar_url) && !/^https?:\/\//i.test(updates.avatar_url))) {
        return res.status(400).json({ data: null, error: { message: 'avatar_url tidak valid' } });
      }
    }
    if (updates.status !== undefined && !['online', 'idle', 'dnd', 'invisible'].includes(updates.status)) {
      return res.status(400).json({ data: null, error: { message: 'status tidak valid' } });
    }
    if (updates.bio !== undefined) updates.bio = String(updates.bio).slice(0, 280);
    if (updates.avatar_frame !== undefined) updates.avatar_frame = String(updates.avatar_frame).slice(0, 24) || null;
    if (updates.banner !== undefined) {
      const b = String(updates.banner);
      if (/^\/uploads\//.test(b) || /^https?:\/\//i.test(b)) {
        // Foto banner dari upload
        if (b.length > 500) {
          return res.status(400).json({ data: null, error: { message: 'URL banner terlalu panjang' } });
        }
        updates.banner = b;
      } else if (/^#[0-9a-fA-F]{3,8}$/.test(b)) {
        // Warna bebas dari color picker (mis. #2b2d31)
        updates.banner = b;
      } else {
        updates.banner = b.slice(0, 24) || null;
      }
    }
    if (updates.nameplate !== undefined) {
      if (updates.nameplate === null || updates.nameplate === '') {
        updates.nameplate = null;
      } else {
        const n = String(updates.nameplate);
        if (/^\/uploads\//.test(n) || /^https?:\/\//i.test(n)) {
          if (n.length > 500) {
            return res.status(400).json({ data: null, error: { message: 'URL nameplate terlalu panjang' } });
          }
          updates.nameplate = n;
        } else {
          updates.nameplate = n.slice(0, 64) || null;
        }
      }
    }
    if (updates.connections !== undefined) {
      try {
        const c = typeof updates.connections === 'string' ? JSON.parse(updates.connections) : updates.connections;
        const clean = {};
        for (const k of ['roblox', 'spotify', 'tiktok', 'xbox']) {
          if (c && c[k]) clean[k] = String(c[k]).slice(0, 50);
        }
        updates.connections = JSON.stringify(clean);
      } catch (_) {
        return res.status(400).json({ data: null, error: { message: 'connections tidak valid' } });
      }
    }
    if (updates.username !== undefined) {
      updates.username = String(updates.username).trim().slice(0, 50);
      if (updates.username.length < 3) {
        return res.status(400).json({ data: null, error: { message: 'username minimal 3 karakter' } });
      }
    }
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT id FROM profiles WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'User tidak ditemukan' } });
    }
    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const vals = Object.values(updates);
    try {
      await conn.query(`UPDATE profiles SET ${sets} WHERE id = ?`, [...vals, req.params.id]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ data: null, error: { message: 'username sudah dipakai', code: '23505' } });
      }
      throw e;
    }
    const updated = await conn.query(`SELECT ${PUBLIC_COLS} FROM profiles WHERE id = ?`, [req.params.id]);
    res.json({ data: updated[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/profiles
router.post('/', async (req, res) => {
  let conn;
  try {
    const { id, username } = req.body || {};
    if (!username || String(username).trim().length < 3) {
      return res.status(400).json({ data: null, error: { message: 'username minimal 3 karakter' } });
    }
    const profileId = id || uuidv4();
    conn = await pool.getConnection();
    await conn.query('INSERT INTO profiles (id, username) VALUES (?, ?)', [profileId, String(username).trim().slice(0, 50)]);
    const rows = await conn.query(`SELECT ${PUBLIC_COLS} FROM profiles WHERE id = ?`, [profileId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ data: null, error: { message: 'Profile already exists', code: '23505' } });
    }
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
