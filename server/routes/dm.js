const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/dm?user_id=X&peer_id=Y — riwayat percakapan dua arah (+ reply preview)
router.get('/', async (req, res) => {
  let conn;
  try {
    const { user_id, peer_id, limit } = req.query;
    if (!user_id || !peer_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id dan peer_id wajib diisi' } });
    }
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT m.*, p.username AS sender_name,
              (SELECT content FROM dm_messages WHERE id = m.reply_to) AS reply_content,
              (SELECT username FROM profiles WHERE id = (SELECT sender_id FROM dm_messages WHERE id = m.reply_to)) AS reply_username
       FROM dm_messages m
       LEFT JOIN profiles p ON p.id = m.sender_id
       WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC
       LIMIT ${parsedLimit}`,
      [user_id, peer_id, peer_id, user_id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/dm/recent?user_id=X — 1 pesan terakhir per lawan bicara
// (buat daftar Messages ala Discord: snippet + waktu)
router.get('/recent', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT m.*, peer_p.username AS peer_username, peer_p.avatar_url AS peer_avatar,
              peer_p.last_seen AS peer_last_seen, peer_p.status AS peer_status,
              peer_p.server_tag AS peer_tag,
              CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS peer_id
       FROM dm_messages m
       LEFT JOIN profiles peer_p
         ON peer_p.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
       WHERE m.sender_id = ? OR m.receiver_id = ?
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [user_id, user_id, user_id, user_id]
    );
    // Dedupe: baris pertama per peer = pesan terbaru
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      if (seen.has(r.peer_id)) continue;
      seen.add(r.peer_id);
      out.push({
        peer_id: r.peer_id,
        peer_username: r.peer_username || 'User',
        peer_avatar: r.peer_avatar || null,
        peer_last_seen: r.peer_last_seen || null,
        peer_status: r.peer_status || 'online',
        peer_tag: r.peer_tag || null,
        content: r.content || null,
        image_url: r.image_url || null,
        sender_id: r.sender_id,
        is_mine: r.sender_id === user_id,
        created_at: r.created_at,
      });
    }
    res.json({ data: out, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/dm { sender_id, receiver_id, content, image_url, reply_to }
router.post('/', async (req, res) => {
  let conn;
  try {
    const { sender_id, receiver_id, content, image_url, reply_to } = req.body || {};
    if (!sender_id || !receiver_id) {
      return res.status(400).json({ data: null, error: { message: 'sender_id dan receiver_id wajib diisi' } });
    }
    if ((!content || !String(content).trim()) && !image_url) {
      return res.status(400).json({ data: null, error: { message: 'Pesan tidak boleh kosong' } });
    }
    const msgId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO dm_messages (id, sender_id, receiver_id, content, image_url, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
      [msgId, sender_id, receiver_id, (content || '').trim().slice(0, 2000) || null, image_url || null, reply_to || null]
    );
    const rows = await conn.query('SELECT * FROM dm_messages WHERE id = ?', [msgId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
