const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/channels?community_id=X - list channels by community (ordered by name)
router.get('/', async (req, res) => {
  let conn;
  try {
    const { community_id } = req.query;
    conn = await pool.getConnection();
    let rows;
    if (community_id) {
      rows = await conn.query('SELECT * FROM channels WHERE community_id = ? ORDER BY name', [community_id]);
    } else {
      rows = await conn.query('SELECT * FROM channels ORDER BY name');
    }
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/channels - create channel (supports single or batch)
router.post('/', async (req, res) => {
  let conn;
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    conn = await pool.getConnection();
    const created = [];
    for (const ch of payload) {
      const channelId = ch.id || uuidv4();
      await conn.query(
        'INSERT INTO channels (id, community_id, name, type) VALUES (?, ?, ?, ?)',
        [channelId, ch.community_id, ch.name, ch.type]
      );
      const rows = await conn.query('SELECT * FROM channels WHERE id = ?', [channelId]);
      created.push(rows[0]);
    }
    res.json({ data: created.length === 1 ? created[0] : created, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
