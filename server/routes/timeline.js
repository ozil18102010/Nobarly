const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// Bentuk satu shout lengkap: penulis + jumlah like + status like saya + repost asli
async function hydrateShout(conn, row, meId) {
  const shout = { ...row };
  const likes = await conn.query('SELECT COUNT(*) AS c FROM shout_likes WHERE shout_id = ?', [row.id]);
  shout.like_count = Number(likes[0]?.c || 0);
  shout.liked_by_me = false;
  if (meId) {
    const mine = await conn.query('SELECT id FROM shout_likes WHERE shout_id = ? AND user_id = ? LIMIT 1', [row.id, meId]);
    shout.liked_by_me = mine.length > 0;
  }
  if (row.repost_of) {
    const orig = await conn.query(
      `SELECT s.*, p.username AS username FROM shouts s
       LEFT JOIN profiles p ON p.id = s.user_id WHERE s.id = ? LIMIT 1`,
      [row.repost_of]
    );
    shout.repost = orig.length > 0 ? orig[0] : null;
  } else {
    shout.repost = null;
  }
  return shout;
}

// GET /api/shouts?feed_for=X&limit= — linimasa (milik sendiri + yang difollow)
// GET /api/shouts?user_id=X — shout milik user tertentu
// GET /api/shouts — semua terbaru
router.get('/', async (req, res) => {
  let conn;
  try {
    const { user_id, feed_for, limit, me } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const meId = me || feed_for || user_id || null;
    conn = await pool.getConnection();
    let rows;
    const base = `SELECT s.*, p.username AS username FROM shouts s
                  LEFT JOIN profiles p ON p.id = s.user_id`;
    if (feed_for) {
      rows = await conn.query(
        `${base} WHERE s.user_id = ? OR s.user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?)
         ORDER BY s.created_at DESC LIMIT ${parsedLimit}`,
        [feed_for, feed_for]
      );
    } else if (user_id) {
      rows = await conn.query(`${base} WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ${parsedLimit}`, [user_id]);
    } else {
      rows = await conn.query(`${base} ORDER BY s.created_at DESC LIMIT ${parsedLimit}`);
    }
    const data = [];
    for (const r of rows) data.push(await hydrateShout(conn, r, meId));
    res.json({ data, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/shouts/:id — satu shout lengkap
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT s.*, p.username AS username FROM shouts s
       LEFT JOIN profiles p ON p.id = s.user_id WHERE s.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Shout tidak ditemukan' } });
    }
    res.json({ data: await hydrateShout(conn, rows[0], req.query.me || null), error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/shouts { user_id, content, image_url, repost_of }
router.post('/', async (req, res) => {
  let conn;
  try {
    const { user_id, content, image_url, repost_of } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    const text = (content || '').trim();
    if (!text && !image_url && !repost_of) {
      return res.status(400).json({ data: null, error: { message: 'Shout tidak boleh kosong' } });
    }
    if (text.length > 280) {
      return res.status(400).json({ data: null, error: { message: 'Maksimal 280 karakter' } });
    }
    conn = await pool.getConnection();
    if (repost_of) {
      const orig = await conn.query('SELECT id FROM shouts WHERE id = ? LIMIT 1', [repost_of]);
      if (orig.length === 0) {
        return res.status(404).json({ data: null, error: { message: 'Shout asli tidak ditemukan' } });
      }
    }
    const sid = uuidv4();
    await conn.query(
      'INSERT INTO shouts (id, user_id, content, image_url, repost_of) VALUES (?, ?, ?, ?, ?)',
      [sid, user_id, text.slice(0, 280) || null, image_url || null, repost_of || null]
    );
    const rows = await conn.query(
      `SELECT s.*, p.username AS username FROM shouts s
       LEFT JOIN profiles p ON p.id = s.user_id WHERE s.id = ? LIMIT 1`,
      [sid]
    );
    res.json({ data: await hydrateShout(conn, rows[0], user_id), error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/shouts/:id?user_id=X — hapus shout sendiri
router.delete('/:id', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT user_id FROM shouts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Shout tidak ditemukan' } });
    }
    if (rows[0].user_id !== user_id) {
      return res.status(403).json({ data: null, error: { message: 'Hanya bisa menghapus shout sendiri' } });
    }
    await conn.query('DELETE FROM shouts WHERE id = ?', [req.params.id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/shouts/:id/like { user_id } — toggle like
router.post('/:id/like', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const existing = await conn.query('SELECT id FROM shout_likes WHERE shout_id = ? AND user_id = ? LIMIT 1', [req.params.id, user_id]);
    let liked;
    if (existing.length > 0) {
      await conn.query('DELETE FROM shout_likes WHERE id = ?', [existing[0].id]);
      liked = false;
    } else {
      await conn.query('INSERT INTO shout_likes (id, shout_id, user_id) VALUES (?, ?, ?)', [uuidv4(), req.params.id, user_id]);
      liked = true;
    }
    const counts = await conn.query('SELECT COUNT(*) AS c FROM shout_likes WHERE shout_id = ?', [req.params.id]);
    res.json({ data: { liked, like_count: Number(counts[0]?.c || 0) }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
