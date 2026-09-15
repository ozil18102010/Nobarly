const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/posts?channel_id=X or ?community_id=a,b,c - list posts
router.get('/', async (req, res) => {
  let conn;
  try {
    const { channel_id, community_id, limit } = req.query;
    conn = await pool.getConnection();
    let rows;

    // Batas default 50 (anti-DoS: dulu tanpa LIMIT, 1 komunitas ramai = full scan)
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    if (channel_id) {
      rows = await conn.query(`SELECT * FROM posts WHERE channel_id = ? ORDER BY created_at DESC LIMIT ${parsedLimit}`, [channel_id]);
    } else if (community_id) {
      const ids = community_id.split(',').filter(Boolean).slice(0, 50);
      if (ids.length === 0) {
        rows = [];
      } else {
        const placeholders = ids.map(() => '?').join(',');
        const sql = `SELECT * FROM posts WHERE community_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ${parsedLimit}`;
        rows = await conn.query(sql, [...ids]);
      }
    } else {
      rows = await conn.query(`SELECT * FROM posts ORDER BY created_at DESC LIMIT ${parsedLimit}`);
    }
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/posts/:id - get single post
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
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

// POST /api/posts - create post
router.post('/', async (req, res) => {
  let conn;
  try {
    // upvotes DIABAIKAN dari client (dulu bisa POST {upvotes:9999} = skor palsu)
    const { community_id, channel_id, user_id, title, content, image_url } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Judul post wajib diisi' } });
    }
    if (!community_id && !channel_id) {
      return res.status(400).json({ data: null, error: { message: 'community_id atau channel_id wajib diisi' } });
    }
    const cleanTitle = String(title).trim().slice(0, 200);
    const cleanContent = content ? String(content).slice(0, 5000) : null;
    const cleanImage = image_url ? String(image_url).slice(0, 500) : null;
    const postId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO posts (id, community_id, channel_id, user_id, title, content, upvotes, image_url) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [postId, community_id || null, channel_id || null, user_id || null, cleanTitle, cleanContent, cleanImage]
    );
    const rows = await conn.query('SELECT * FROM posts WHERE id = ?', [postId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/posts/votes/check?post_id=X&user_id=Y - get user's vote on a post
router.get('/votes/check', async (req, res) => {
  let conn;
  try {
    const { post_id, user_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM post_votes WHERE post_id = ? AND user_id = ?', [post_id, user_id]);
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: 'Not found' } });
    }
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/posts/votes - add vote
router.post('/votes', async (req, res) => {
  let conn;
  try {
    const { post_id, user_id, vote_type } = req.body || {};
    // Dulu vote_type bebas (1000 = skor palsu karena recalc SUM). Kunci ke ±1.
    if (![1, -1].includes(Number(vote_type))) {
      return res.status(400).json({ data: null, error: { message: 'vote_type harus 1 atau -1' } });
    }
    if (!post_id || !user_id) {
      return res.status(400).json({ data: null, error: { message: 'post_id dan user_id wajib diisi' } });
    }
    const cleanVote = Number(vote_type);
    const voteId = uuidv4();
    conn = await pool.getConnection();
    try {
      await conn.query(
        'INSERT INTO post_votes (id, post_id, user_id, vote_type) VALUES (?, ?, ?, ?)',
        [voteId, post_id, user_id, cleanVote]
      );
    } catch (insertErr) {
      // already voted - update instead
      if (insertErr.code === 'ER_DUP_ENTRY') {
        await conn.query('UPDATE post_votes SET vote_type = ? WHERE post_id = ? AND user_id = ?', [cleanVote, post_id, user_id]);
      } else {
        throw insertErr;
      }
    }
    await recalcUpvotes(conn, post_id);
    const rows = await conn.query('SELECT * FROM posts WHERE id = ?', [post_id]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/posts/votes?vote_id=X - remove vote (auto-lookup post_id for recalc)
router.delete('/votes', async (req, res) => {
  let conn;
  try {
    const voteId = req.query.vote_id || req.query.id;
    if (!voteId) {
      return res.status(400).json({ data: null, error: { message: 'vote_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    // auto-lookup post_id before deleting
    const existing = await conn.query('SELECT post_id FROM post_votes WHERE id = ?', [voteId]);
    const postId = existing[0]?.post_id || req.query.post_id || null;
    await conn.query('DELETE FROM post_votes WHERE id = ?', [voteId]);
    if (postId) await recalcUpvotes(conn, postId);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/posts/votes/:id - update vote type (auto-lookup post_id for recalc)
router.put('/votes/:id', async (req, res) => {
  let conn;
  try {
    const { vote_type } = req.body || {};
    if (![1, -1].includes(Number(vote_type))) {
      return res.status(400).json({ data: null, error: { message: 'vote_type harus 1 atau -1' } });
    }
    conn = await pool.getConnection();
    await conn.query('UPDATE post_votes SET vote_type = ? WHERE id = ?', [Number(vote_type), req.params.id]);
    // auto-lookup post_id for recalc
    let postId = req.body.post_id || null;
    if (!postId) {
      const rows = await conn.query('SELECT post_id FROM post_votes WHERE id = ?', [req.params.id]);
      postId = rows[0]?.post_id || null;
    }
    if (postId) await recalcUpvotes(conn, postId);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/posts/:id/comments - list comments
router.get('/:id/comments', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 100', [req.params.id]);
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/posts/:id/comments - add comment (dukung reply via parent_id)
router.post('/:id/comments', async (req, res) => {
  let conn;
  try {
    const { user_id, content, parent_id } = req.body || {};
    // Dulu content kosong/NULL lolos → 500 dari DB. Validasi di sini jadi 400 rapi.
    if (!content || !String(content).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Isi komentar wajib diisi' } });
    }
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    const commentId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO comments (id, post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?, ?)',
      [commentId, req.params.id, user_id, String(content).trim().slice(0, 2000), parent_id || null]
    );
    const rows = await conn.query('SELECT * FROM comments WHERE id = ?', [commentId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

async function recalcUpvotes(conn, postId) {
  const sums = await conn.query('SELECT COALESCE(SUM(vote_type), 0) AS total FROM post_votes WHERE post_id = ?', [postId]);
  const total = Number(sums[0]?.total || 0);
  await conn.query('UPDATE posts SET upvotes = ? WHERE id = ?', [total, postId]);
}

module.exports = router;
