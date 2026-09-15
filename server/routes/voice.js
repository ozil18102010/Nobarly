const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// POST /api/voice/join - join voice channel
router.post('/join', async (req, res) => {
  let conn;
  try {
    const { community_id, channel_id, user_id, peer_id, is_active, is_muted } = req.body || {};
    if (!channel_id || !user_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id dan user_id wajib diisi' } });
    }
    const sessionId = uuidv4();
    conn = await pool.getConnection();
    // Hapus sesi lama user di channel ini dulu (anti-duplikat hantu:
    // dulu tiap join INSERT baru → daftar member kembar & count ngaco).
    await conn.query('DELETE FROM voice_sessions WHERE channel_id = ? AND user_id = ?', [channel_id, user_id]);
    await conn.query(
      'INSERT INTO voice_sessions (id, community_id, channel_id, user_id, peer_id, is_active, is_muted) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sessionId, community_id || null, channel_id, user_id, peer_id || null, is_active !== false, is_muted === true]
    );
    const rows = await conn.query('SELECT * FROM voice_sessions WHERE id = ?', [sessionId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/voice/users?channel_id=X - list active voice users
router.get('/users', async (req, res) => {
  let conn;
  try {
    const { channel_id } = req.query;
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM voice_sessions WHERE channel_id = ? AND is_active = true', [channel_id]);
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/voice/mute - toggle mute / status video { channel_id, user_id, is_muted?, is_video? }
router.put('/mute', async (req, res) => {
  let conn;
  try {
    const { channel_id, user_id, is_muted, is_video } = req.body;
    const sets = [];
    const vals = [];
    if (is_muted !== undefined) {
      sets.push('is_muted = ?');
      vals.push(is_muted === true);
    }
    if (is_video !== undefined) {
      sets.push('is_video = ?');
      vals.push(is_video === true);
    }
    if (sets.length === 0) {
      return res.status(400).json({ data: null, error: { message: 'Tidak ada field yang diupdate' } });
    }
    conn = await pool.getConnection();
    await conn.query(
      `UPDATE voice_sessions SET ${sets.join(', ')} WHERE channel_id = ? AND user_id = ?`,
      [...vals, channel_id, user_id]
    );
    res.json({ data: null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/voice/leave?channel_id=X&user_id=Y - leave voice
router.delete('/leave', async (req, res) => {
  let conn;
  try {
    const { channel_id, user_id } = req.query;
    conn = await pool.getConnection();
    await conn.query('DELETE FROM voice_sessions WHERE channel_id = ? AND user_id = ?', [channel_id, user_id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/voice/mine?user_id=X - hapus SEMUA sesi milik user (bersih-bersih
// sesi hantu saat app dibuka, mis. kemarin ditutup paksa saat masih di voice)
router.delete('/mine', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    await conn.query('DELETE FROM voice_sessions WHERE user_id = ?', [user_id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/voice/sounds?channel_id=X&limit=30 — event soundboard terbaru
router.get('/sounds', async (req, res) => {
  let conn;
  try {
    const { channel_id, limit } = req.query;
    if (!channel_id) {
      return res.status(400).json({ data: null, error: { message: 'channel_id wajib diisi' } });
    }
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT * FROM voice_sounds WHERE channel_id = ? ORDER BY created_at DESC LIMIT ${parsedLimit}`,
      [channel_id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/voice/sounds { channel_id, user_id, username, sound }
router.post('/sounds', async (req, res) => {
  let conn;
  try {
    const { channel_id, user_id, username, sound } = req.body || {};
    if (!channel_id || !sound) {
      return res.status(400).json({ data: null, error: { message: 'channel_id dan sound wajib diisi' } });
    }
    if (!/^[a-z0-9_]{1,32}$/i.test(String(sound))) {
      return res.status(400).json({ data: null, error: { message: 'Nama sound tidak valid' } });
    }
    conn = await pool.getConnection();
    const sid = uuidv4();
    await conn.query(
      'INSERT INTO voice_sounds (id, channel_id, user_id, username, sound) VALUES (?, ?, ?, ?, ?)',
      [sid, channel_id, user_id || null, username || 'User', String(sound).toLowerCase()]
    );
    const rows = await conn.query('SELECT * FROM voice_sounds WHERE id = ?', [sid]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
