const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// Cek apakah user boleh mengendalikan playback (host utama / co-host)
async function isController(conn, partyId, userId) {
  if (!userId) return false;
  const party = await conn.query('SELECT host_id FROM watch_parties WHERE id = ? LIMIT 1', [partyId]);
  if (party.length === 0) return false;
  if (party[0].host_id === userId) return true;
  const co = await conn.query('SELECT id FROM watch_party_hosts WHERE watch_party_id = ? AND user_id = ? LIMIT 1', [partyId, userId]);
  return co.length > 0;
}

// GET /api/watch-parties/by-channel?channel_id=X — party LIVE di voice channel.
// PENTING: didefinisikan SEBELUM /:id supaya tidak ditangkap sebagai id.
router.get('/by-channel', async (req, res) => {
  let conn;
  try {
    const { channel_id } = req.query;
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT * FROM watch_parties WHERE voice_channel_id = ? AND is_live = true
       ORDER BY created_at DESC LIMIT 1`,
      [channel_id]
    );
    res.json({ data: rows[0] || null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id/playback — state sync + daftar pengendali + jam server
router.get('/:id/playback', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT pb_action, pb_time, pb_video, pb_updated_at, host_id FROM watch_parties WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Party tidak ditemukan' } });
    }
    const hosts = await conn.query('SELECT user_id FROM watch_party_hosts WHERE watch_party_id = ?', [req.params.id]);
    const now = await conn.query('SELECT UNIX_TIMESTAMP(NOW(3)) * 1000 AS now_ms');
    res.json({
      data: {
        action: rows[0].pb_action || 'play',
        time: Number(rows[0].pb_time || 0),
        video: rows[0].pb_video || null,
        updated_at: rows[0].pb_updated_at ? new Date(rows[0].pb_updated_at).getTime() : null,
        host_id: rows[0].host_id,
        cohosts: hosts.map(h => h.user_id),
        server_now: Number(now[0]?.now_ms || Date.now())
      },
      error: null
    });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/watch-parties/:id/playback { user_id, action, time, video } — host/co-host only
router.put('/:id/playback', async (req, res) => {
  let conn;
  try {
    const { user_id, action, time, video } = req.body || {};
    if (!['play', 'pause'].includes(action)) {
      return res.status(400).json({ data: null, error: { message: 'action harus play/pause' } });
    }
    conn = await pool.getConnection();
    if (!(await isController(conn, req.params.id, user_id))) {
      return res.status(403).json({ data: null, error: { message: 'Hanya host / co-host yang bisa mengendalikan' } });
    }
    const t = Math.max(0, Number(time) || 0);
    await conn.query(
      'UPDATE watch_parties SET pb_action = ?, pb_time = ?, pb_video = COALESCE(?, pb_video), pb_updated_at = NOW(3) WHERE id = ?',
      [action, t, video || null, req.params.id]
    );
    const rows = await conn.query('SELECT pb_action, pb_time, pb_video, pb_updated_at FROM watch_parties WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] || null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id/hosts — daftar co-host (+username)
router.get('/:id/hosts', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT h.*, p.username FROM watch_party_hosts h
       LEFT JOIN profiles p ON p.id = h.user_id
       WHERE h.watch_party_id = ? ORDER BY h.created_at ASC`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/watch-parties/:id/hosts { requester_id, user_id } — hanya host utama
router.post('/:id/hosts', async (req, res) => {
  let conn;
  try {
    const { requester_id, user_id } = req.body || {};
    if (!requester_id || !user_id) {
      return res.status(400).json({ data: null, error: { message: 'requester_id dan user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const party = await conn.query('SELECT host_id FROM watch_parties WHERE id = ? LIMIT 1', [req.params.id]);
    if (party.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Party tidak ditemukan' } });
    }
    if (party[0].host_id !== requester_id) {
      return res.status(403).json({ data: null, error: { message: 'Hanya host utama yang bisa menambah co-host' } });
    }
    if (user_id === party[0].host_id) {
      return res.status(400).json({ data: null, error: { message: 'Sudah menjadi host utama' } });
    }
    try {
      const hid = uuidv4();
      await conn.query('INSERT INTO watch_party_hosts (id, watch_party_id, user_id) VALUES (?, ?, ?)', [hid, req.params.id, user_id]);
      const rows = await conn.query('SELECT * FROM watch_party_hosts WHERE id = ?', [hid]);
      return res.json({ data: rows[0], error: null });
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ data: null, error: { message: 'Sudah menjadi co-host', code: '23505' } });
      }
      throw insertErr;
    }
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/watch-parties/:id/hosts?user_id=X&requester_id=Y — host utama / diri sendiri
router.delete('/:id/hosts', async (req, res) => {
  let conn;
  try {
    const { user_id, requester_id } = req.query;
    conn = await pool.getConnection();
    const party = await conn.query('SELECT host_id FROM watch_parties WHERE id = ? LIMIT 1', [req.params.id]);
    if (party.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Party tidak ditemukan' } });
    }
    if (requester_id !== party[0].host_id && requester_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Tidak berhak menghapus co-host' } });
    }
    await conn.query('DELETE FROM watch_party_hosts WHERE watch_party_id = ? AND user_id = ?', [req.params.id, user_id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties - list all (ordered by created_at desc)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM watch_parties ORDER BY created_at DESC LIMIT 50');
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id - get single
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM watch_parties WHERE id = ?', [req.params.id]);
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

// POST /api/watch-parties - create (bisa ditempel ke voice_channel_id)
router.post('/', async (req, res) => {
  let conn;
  try {
    const { community_id, host_id, title, stream_url, stream_type, is_live, viewer_count, voice_channel_id } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Judul nobar wajib diisi' } });
    }
    const partyId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO watch_parties (id, community_id, host_id, title, stream_url, stream_type, is_live, viewer_count, voice_channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [partyId, community_id || null, host_id || null, String(title).trim().slice(0, 100), stream_url || null, stream_type || 'youtube', is_live !== false, viewer_count || 0, voice_channel_id || null]
    );
    const rows = await conn.query('SELECT * FROM watch_parties WHERE id = ?', [partyId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/watch-parties/:id - update (e.g. viewer_count, voice_channel_id, akhiri nobar)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const allowed = ['title', 'stream_url', 'stream_type', 'is_live', 'viewer_count', 'voice_channel_id'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    conn = await pool.getConnection();
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await conn.query(`UPDATE watch_parties SET ${setClause} WHERE id = ?`, [...Object.values(updates), req.params.id]);
    }
    const rows = await conn.query('SELECT * FROM watch_parties WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] || null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id/chat - list chat (ordered by created_at asc)
router.get('/:id/chat', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT c.*, p.avatar_url FROM watch_chat c
       LEFT JOIN profiles p ON p.id = c.user_id
       WHERE c.watch_party_id = ? ORDER BY c.created_at ASC`, [req.params.id]);
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/watch-parties/:id/chat - send chat message
router.post('/:id/chat', async (req, res) => {
  let conn;
  try {
    const { user_id, username, message, image_url } = req.body;
    const chatId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO watch_chat (id, watch_party_id, user_id, username, message, image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [chatId, req.params.id, user_id || null, username || 'Guest', message || '', image_url || null]
    );
    const rows = await conn.query('SELECT * FROM watch_chat WHERE id = ?', [chatId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id/reactions?limit=200 — reaksi terbaru
router.get('/:id/reactions', async (req, res) => {
  let conn;
  try {
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT * FROM watch_reactions WHERE watch_party_id = ? ORDER BY created_at DESC LIMIT ${parsedLimit}`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/watch-parties/:id/reactions { user_id, emoji }
router.post('/:id/reactions', async (req, res) => {
  let conn;
  try {
    const { user_id, emoji } = req.body || {};
    if (!emoji) {
      return res.status(400).json({ data: null, error: { message: 'emoji wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rid = uuidv4();
    await conn.query(
      'INSERT INTO watch_reactions (id, watch_party_id, user_id, emoji) VALUES (?, ?, ?, ?)',
      [rid, req.params.id, user_id || null, String(emoji).slice(0, 16)]
    );
    const rows = await conn.query('SELECT * FROM watch_reactions WHERE id = ?', [rid]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/watch-parties/:id/moments — daftar momen highlight
router.get('/:id/moments', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT * FROM watch_moments WHERE watch_party_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/watch-parties/:id/moments { user_id, username, label }
router.post('/:id/moments', async (req, res) => {
  let conn;
  try {
    const { user_id, username, label } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Label momen wajib diisi' } });
    }
    conn = await pool.getConnection();
    const mid = uuidv4();
    await conn.query(
      'INSERT INTO watch_moments (id, watch_party_id, user_id, username, label) VALUES (?, ?, ?, ?, ?)',
      [mid, req.params.id, user_id || null, username || 'Guest', String(label).trim().slice(0, 200)]
    );
    const rows = await conn.query('SELECT * FROM watch_moments WHERE id = ?', [mid]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
