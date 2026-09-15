const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/friends?user_id=X — semua relasi + profil lawan + status
router.get('/', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT f.*,
              CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS friend_id,
              CASE WHEN f.requester_id = ? THEN a.username ELSE r.username END AS friend_username,
              CASE WHEN f.requester_id = ? THEN a.email ELSE r.email END AS friend_email,
              CASE WHEN f.requester_id = ? THEN a.avatar_url ELSE r.avatar_url END AS friend_avatar,
              CASE WHEN f.requester_id = ? THEN a.last_seen ELSE r.last_seen END AS friend_last_seen,
              CASE WHEN f.requester_id = ? THEN a.status ELSE r.status END AS friend_status,
              CASE WHEN f.requester_id = ? THEN a.server_tag ELSE r.server_tag END AS friend_tag
       FROM friends f
       LEFT JOIN profiles r ON r.id = f.requester_id
       LEFT JOIN profiles a ON a.id = f.addressee_id
       WHERE f.requester_id = ? OR f.addressee_id = ?
       ORDER BY f.created_at DESC`,
      [user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/friends { user_id, friend_id } — kirim permintaan
router.post('/', async (req, res) => {
  let conn;
  try {
    const { user_id, friend_id } = req.body || {};
    if (!user_id || !friend_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id dan friend_id wajib diisi' } });
    }
    if (user_id === friend_id) {
      return res.status(400).json({ data: null, error: { message: 'Tidak bisa berteman dengan diri sendiri' } });
    }
    conn = await pool.getConnection();
    const target = await conn.query('SELECT id FROM profiles WHERE id = ? LIMIT 1', [friend_id]);
    if (target.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'User tidak ditemukan' } });
    }
    const existing = await conn.query(
      'SELECT * FROM friends WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1',
      [user_id, friend_id, friend_id, user_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ data: null, error: { message: 'Sudah berteman / permintaan terkirim', code: '23505' } });
    }
    const fid = uuidv4();
    await conn.query(
      "INSERT INTO friends (id, requester_id, addressee_id, status) VALUES (?, ?, ?, 'pending')",
      [fid, user_id, friend_id]
    );
    const rows = await conn.query('SELECT * FROM friends WHERE id = ?', [fid]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ data: null, error: { message: 'Sudah berteman / permintaan terkirim', code: '23505' } });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/friends/:id { user_id, status } — terima/tolak (hanya penerima)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const { user_id, status } = req.body || {};
    if (!['accepted', 'pending'].includes(status)) {
      return res.status(400).json({ data: null, error: { message: 'Status tidak valid' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM friends WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Permintaan tidak ditemukan' } });
    }
    if (rows[0].addressee_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Hanya penerima yang bisa merespons' } });
    }
    if (status === 'pending') {
      await conn.query('DELETE FROM friends WHERE id = ?', [req.params.id]);
      return res.json({ data: null, error: null });
    }
    await conn.query("UPDATE friends SET status = 'accepted' WHERE id = ?", [req.params.id]);
    const updated = await conn.query('SELECT * FROM friends WHERE id = ?', [req.params.id]);
    res.json({ data: updated[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/friends/:id?user_id=X — hapus pertemanan (salah satu pihak)
router.delete('/:id', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM friends WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Tidak ditemukan' } });
    }
    if (rows[0].requester_id !== user_id && rows[0].addressee_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Bukan pertemananmu' } });
    }
    await conn.query('DELETE FROM friends WHERE id = ?', [req.params.id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
