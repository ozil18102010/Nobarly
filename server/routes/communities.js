const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/communities - list all communities (ordered by created_at desc)
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM communities ORDER BY created_at DESC LIMIT 50');
    res.json({ data: rows, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/communities/:id - get single community
router.get('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM communities WHERE id = ?', [req.params.id]);
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

// POST /api/communities - create community
router.post('/', async (req, res) => {
  let conn;
  try {
    const { id, name, description, game_category, owner_id } = req.body || {};
    // Dulu name kosong lolos → 500 dari DB. Validasi jadi 400 rapi.
    if (!name || !String(name).trim()) {
      return res.status(400).json({ data: null, error: { message: 'Nama komunitas wajib diisi' } });
    }
    const communityId = id || uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO communities (id, name, description, game_category, owner_id) VALUES (?, ?, ?, ?, ?)',
      [communityId, String(name).trim().slice(0, 100), description ? String(description).slice(0, 500) : null, game_category ? String(game_category).slice(0, 50) : null, owner_id || null]
    );
    const rows = await conn.query('SELECT * FROM communities WHERE id = ?', [communityId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: 'Terjadi kesalahan server' } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/communities/members?user_id=X - get memberships by user
router.get('/members/list', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM community_members WHERE user_id = ?', [user_id]);
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/communities/:id/members - get members of a community
router.get('/:id/members', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM community_members WHERE community_id = ?', [req.params.id]);
    res.json({ data: rows, error: null });
  } catch (e) {
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/communities/members - join/add member
router.post('/members', async (req, res) => {
  let conn;
  try {
    const { community_id, user_id, role } = req.body;
    const memberId = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO community_members (id, community_id, user_id, role) VALUES (?, ?, ?, ?)',
      [memberId, community_id, user_id, role || 'member']
    );
    const rows = await conn.query('SELECT * FROM community_members WHERE id = ?', [memberId]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.json({ data: null, error: { message: 'Already a member', code: '23505' } });
    }
    res.json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
