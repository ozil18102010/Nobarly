const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/chat?channel_id=X&limit=50 — pesan + username penulis + reply preview
router.get('/', async (req, res) => {
  let conn;
  try {
    const { channel_id, limit } = req.query;
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT m.*, p.username, p.avatar_url,
              (SELECT content FROM channel_messages WHERE id = m.reply_to) AS reply_content,
              (SELECT username FROM profiles WHERE id = (SELECT user_id FROM channel_messages WHERE id = m.reply_to)) AS reply_username
       FROM channel_messages m
       LEFT JOIN profiles p ON p.id = m.user_id
       WHERE m.channel_id = ?
       ORDER BY m.created_at ASC
       LIMIT ${parsedLimit}`,
      [channel_id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/chat — kirim pesan (teks dan/atau gambar, bisa reply)
router.post('/', async (req, res) => {
  let conn;
  try {
    const { channel_id, user_id, content, image_url, reply_to } = req.body || {};
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    if ((!content || !String(content).trim()) && !image_url) {
      return res.status(400).json({ data: null, error: { message: 'Pesan tidak boleh kosong' } });
    }
    const msgId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO channel_messages (id, channel_id, user_id, content, image_url, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
      [msgId, channel_id, user_id || null, (content || '').trim().slice(0, 2000) || null, image_url || null, reply_to || null]
    );
    const rows = await conn.query(
      `SELECT m.*, p.username FROM channel_messages m
       LEFT JOIN profiles p ON p.id = m.user_id WHERE m.id = ?`,
      [msgId]
    );
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/chat/:id { user_id, content } — edit pesan sendiri (max 2000)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const { user_id, content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Pesan tidak boleh kosong' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT user_id FROM channel_messages WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Pesan tidak ditemukan' } });
    }
    if (rows[0].user_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Hanya bisa mengedit pesan sendiri' } });
    }
    await conn.query('UPDATE channel_messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?', [String(content).trim().slice(0, 2000), req.params.id]);
    const updated = await conn.query(
      `SELECT m.*, p.username FROM channel_messages m
       LEFT JOIN profiles p ON p.id = m.user_id WHERE m.id = ?`,
      [req.params.id]
    );
    res.json({ data: updated[0], error: null });
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        data: null, error: { message: 'Kolom edited_at belum ada. Jalankan migration terbaru.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/chat/:id?user_id=X — hapus pesan sendiri
router.delete('/:id', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT user_id FROM channel_messages WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Pesan tidak ditemukan' } });
    }
    if (rows[0].user_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Hanya bisa menghapus pesan sendiri' } });
    }
    await conn.query('DELETE FROM channel_messages WHERE id = ?', [req.params.id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/chat/reactions?channel_id=X — SEMUA reaksi channel sekaligus.
// (v2.0: 1 request ganti 50 request per polling → chat jauh lebih enteng)
router.get('/reactions', async (req, res) => {
  let conn;
  try {
    const { channel_id } = req.query;
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT r.*, p.username FROM message_reactions r
       LEFT JOIN profiles p ON p.id = r.user_id
       WHERE r.message_id IN (SELECT id FROM channel_messages WHERE channel_id = ?)
       ORDER BY r.created_at ASC
       LIMIT 500`,
      [channel_id]
    );
    const byMsg = {};
    for (const r of rows) {
      (byMsg[r.message_id] = byMsg[r.message_id] || []).push(r);
    }
    res.json({ data: byMsg, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/chat/:id/reactions — daftar reaksi + username
router.get('/:id/reactions', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT r.*, p.username FROM message_reactions r
       LEFT JOIN profiles p ON p.id = r.user_id
       WHERE r.message_id = ? ORDER BY r.created_at ASC`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/chat/:id/reactions { user_id, emoji } — toggle reaksi
router.post('/:id/reactions', async (req, res) => {
  let conn;
  try {
    const { user_id, emoji } = req.body || {};
    if (!user_id || !emoji) {
      return res.status(400).json({ data: null, error: { message: 'user_id dan emoji wajib diisi' } });
    }
    conn = await pool.getConnection();
    const existing = await conn.query(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [req.params.id, user_id, emoji]
    );
    let reacted;
    if (existing.length > 0) {
      await conn.query('DELETE FROM message_reactions WHERE id = ?', [existing[0].id]);
      reacted = false;
    } else {
      await conn.query(
        'INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
        [uuidv4(), req.params.id, user_id, String(emoji).slice(0, 16)]
      );
      reacted = true;
    }
    const rows = await conn.query('SELECT * FROM message_reactions WHERE message_id = ?', [req.params.id]);
    res.json({ data: { reacted, reactions: rows }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
