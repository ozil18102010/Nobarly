const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/follows?follower_id=X — yang saya follow (+profil)
// GET /api/follows?followed_id=X — pengikut saya (+profil)
router.get('/', async (req, res) => {
  let conn;
  try {
    const { follower_id, followed_id } = req.query;
    conn = await pool.getConnection();
    let rows;
    if (follower_id) {
      rows = await conn.query(
        `SELECT f.*, p.username, p.email FROM follows f
         JOIN profiles p ON p.id = f.followed_id
         WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
        [follower_id]
      );
    } else if (followed_id) {
      rows = await conn.query(
        `SELECT f.*, p.username, p.email FROM follows f
         JOIN profiles p ON p.id = f.follower_id
         WHERE f.followed_id = ? ORDER BY f.created_at DESC`,
        [followed_id]
      );
    } else {
      return res.status(400).json({ data: null, error: { message: 'follower_id atau followed_id wajib diisi' } });
    }
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/follows/check?follower_id=X&followed_id=Y
router.get('/check', async (req, res) => {
  let conn;
  try {
    const { follower_id, followed_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id FROM follows WHERE follower_id = ? AND followed_id = ? LIMIT 1',
      [follower_id, followed_id]
    );
    res.json({ data: { following: rows.length > 0 }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/follows { follower_id, followed_id }
router.post('/', async (req, res) => {
  let conn;
  try {
    const { follower_id, followed_id } = req.body || {};
    if (!follower_id || !followed_id) {
      return res.status(400).json({ data: null, error: { message: 'follower_id dan followed_id wajib diisi' } });
    }
    if (follower_id === followed_id) {
      return res.status(400).json({ data: null, error: { message: 'Tidak bisa follow diri sendiri' } });
    }
    conn = await pool.getConnection();
    try {
      const fid = uuidv4();
      await conn.query('INSERT INTO follows (id, follower_id, followed_id) VALUES (?, ?, ?)', [fid, follower_id, followed_id]);
      const rows = await conn.query('SELECT * FROM follows WHERE id = ?', [fid]);
      return res.json({ data: rows[0], error: null });
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ data: null, error: { message: 'Sudah follow', code: '23505' } });
      }
      throw insertErr;
    }
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/follows?follower_id=X&followed_id=Y
router.delete('/', async (req, res) => {
  let conn;
  try {
    const { follower_id, followed_id } = req.query;
    conn = await pool.getConnection();
    await conn.query('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?', [follower_id, followed_id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
