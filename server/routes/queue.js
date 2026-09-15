const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// GET /api/queue?watch_party_id=X — antrean video, urut posisi
router.get('/', async (req, res) => {
  let conn;
  try {
    const { watch_party_id } = req.query;
    if (!watch_party_id) {
      return res.status(400).json({ data: null, error: { message: 'watch_party_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT * FROM watch_queue WHERE watch_party_id = ? ORDER BY position ASC, created_at ASC LIMIT 100',
      [watch_party_id]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        data: null,
        error: { message: 'Tabel watch_queue belum ada. Jalankan migration-007.sql.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/queue { watch_party_id, title, stream_url, stream_type?, added_by?, added_by_name? }
router.post('/', async (req, res) => {
  let conn;
  try {
    const { watch_party_id, title, stream_url, stream_type, added_by, added_by_name } = req.body || {};
    if (!watch_party_id || !title || !stream_url) {
      return res.status(400).json({ data: null, error: { message: 'party, judul, dan URL wajib diisi' } });
    }
    if (!['youtube', 'twitch'].includes(stream_type || 'youtube')) {
      return res.status(400).json({ data: null, error: { message: 'Tipe harus youtube / twitch' } });
    }
    const qid = uuidv4();
    conn = await pool.getConnection();
    const max = await conn.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM watch_queue WHERE watch_party_id = ?',
      [watch_party_id]
    );
    await conn.query(
      `INSERT INTO watch_queue (id, watch_party_id, title, stream_url, stream_type, added_by, added_by_name, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [qid, watch_party_id, String(title).slice(0, 200), stream_url,
       stream_type || 'youtube', added_by || null,
       added_by_name ? String(added_by_name).slice(0, 50) : null,
       (max[0] ? max[0].mp : -1) + 1]
    );
    const rows = await conn.query('SELECT * FROM watch_queue WHERE id = ?', [qid]);
    res.json({ data: rows[0], error: null });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        data: null,
        error: { message: 'Tabel watch_queue belum ada. Jalankan migration-007.sql.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/queue/:id — hapus item antrean
router.delete('/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('DELETE FROM watch_queue WHERE id = ?', [req.params.id]);
    res.json({ data: null, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
