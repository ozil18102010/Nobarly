const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/debates?community_id=X — daftar debat
router.get('/', async (req, res) => {
  let conn;
  try {
    const { community_id } = req.query;
    conn = await pool.getConnection();
    let rows;
    if (community_id) {
      rows = await conn.query('SELECT * FROM debates WHERE community_id = ? ORDER BY created_at DESC', [community_id]);
    } else {
      rows = await conn.query('SELECT * FROM debates ORDER BY created_at DESC');
    }
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/debates/:id — debat + pembicara + hasil vote
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM debates WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Debat tidak ditemukan' } });
    }
    const debate = rows[0];
    const speakers = await conn.query(
      `SELECT s.*, p.username FROM debate_speakers s
       LEFT JOIN profiles p ON p.id = s.user_id WHERE s.debate_id = ?`,
      [req.params.id]
    );
    const votes = await conn.query(
      'SELECT side, COUNT(*) AS c FROM debate_votes WHERE debate_id = ? GROUP BY side',
      [req.params.id]
    );
    const countA = Number(votes.find(v => v.side === 'A')?.c || 0);
    const countB = Number(votes.find(v => v.side === 'B')?.c || 0);
    debate.speakers = speakers;
    debate.votes_a = countA;
    debate.votes_b = countB;
    res.json({ data: debate, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/debates — buat debat baru
router.post('/', async (req, res) => {
  let conn;
  try {
    const { community_id, host_id, title, description, side_a, side_b, turn_seconds } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Judul debat wajib diisi' } });
    }
    const did = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO debates (id, community_id, host_id, title, description, side_a, side_b, turn_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [did, community_id || null, host_id || null, String(title).trim().slice(0, 200),
       (description || '').trim().slice(0, 2000) || null,
       (side_a || 'PRO').trim().slice(0, 100), (side_b || 'KONTRA').trim().slice(0, 100),
       Math.min(Math.max(parseInt(turn_seconds, 10) || 120, 30), 1800)]
    );
    const rows = await conn.query('SELECT * FROM debates WHERE id = ?', [did]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/debates/:id — kontrol host (status, giliran, durasi)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const allowed = ['status', 'current_side', 'turn_seconds', 'title', 'description'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.status && !['open', 'live', 'closed'].includes(updates.status)) {
      return res.status(400).json({ data: null, error: { message: 'Status tidak valid' } });
    }
    if (updates.current_side && !['A', 'B'].includes(updates.current_side)) {
      return res.status(400).json({ data: null, error: { message: 'Sisi tidak valid' } });
    }
    conn = await pool.getConnection();
    // Tiap giliran dimulai / status jadi live: set ulang turn_ends_at
    if (updates.current_side || updates.status === 'live') {
      const cur = await conn.query('SELECT turn_seconds FROM debates WHERE id = ?', [req.params.id]);
      const secs = updates.turn_seconds || (cur[0]?.turn_seconds || 120);
      updates.turn_seconds = secs;
      await conn.query('UPDATE debates SET turn_ends_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?', [secs, req.params.id]);
    }
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await conn.query(`UPDATE debates SET ${setClause} WHERE id = ?`, [...Object.values(updates), req.params.id]);
    }
    const rows = await conn.query('SELECT * FROM debates WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] || null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/debates/:id/join { user_id, side } — naik ke sisi A/B (pindah = update)
router.post('/:id/join', async (req, res) => {
  let conn;
  try {
    const { user_id, side } = req.body || {};
    if (!user_id || !['A', 'B'].includes(side)) {
      return res.status(400).json({ data: null, error: { message: 'user_id dan side (A/B) wajib diisi' } });
    }
    conn = await pool.getConnection();
    const debate = await conn.query("SELECT status FROM debates WHERE id = ? LIMIT 1", [req.params.id]);
    if (debate.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'Debat tidak ditemukan' } });
    }
    if (debate[0].status === 'closed') {
      return res.status(400).json({ data: null, error: { message: 'Debat sudah ditutup' } });
    }
    await conn.query('DELETE FROM debate_speakers WHERE debate_id = ? AND user_id = ?', [req.params.id, user_id]);
    await conn.query('INSERT INTO debate_speakers (id, debate_id, user_id, side) VALUES (?, ?, ?, ?)', [uuidv4(), req.params.id, user_id, side]);
    res.json({ data: { side }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/debates/:id/join?user_id=X — turun panggung
router.delete('/:id/join', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('DELETE FROM debate_speakers WHERE debate_id = ? AND user_id = ?', [req.params.id, req.query.user_id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/debates/:id/vote { user_id, side } — vote penonton (bisa pindah)
router.post('/:id/vote', async (req, res) => {
  let conn;
  try {
    const { user_id, side } = req.body || {};
    if (!user_id || !['A', 'B'].includes(side)) {
      return res.status(400).json({ data: null, error: { message: 'user_id dan side (A/B) wajib diisi' } });
    }
    conn = await pool.getConnection();
    try {
      await conn.query('INSERT INTO debate_votes (id, debate_id, user_id, side) VALUES (?, ?, ?, ?)', [uuidv4(), req.params.id, user_id, side]);
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY') {
        await conn.query('UPDATE debate_votes SET side = ? WHERE debate_id = ? AND user_id = ?', [side, req.params.id, user_id]);
      } else {
        throw insertErr;
      }
    }
    const votes = await conn.query('SELECT side, COUNT(*) AS c FROM debate_votes WHERE debate_id = ? GROUP BY side', [req.params.id]);
    res.json({
      data: {
        votes_a: Number(votes.find(v => v.side === 'A')?.c || 0),
        votes_b: Number(votes.find(v => v.side === 'B')?.c || 0)
      },
      error: null
    });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
