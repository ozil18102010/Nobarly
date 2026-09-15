const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

// POST /api/feedback — kirim laporan bug dari APK / web
// Body: { title?, message, page?, app_version?, device_info? }
// Dibikin publik (tanpa login) supaya teman yang gagal login pun bisa lapor.
router.post('/', async (req, res) => {
  let conn;
  try {
    const { title, message, page, app_version, device_info, user_id, username } = req.body || {};
    if (!message || String(message).trim().length < 3) {
      return res.status(400).json({ data: null, error: { message: 'Isi laporan bug dulu (min. 3 karakter).' } });
    }
    const id = uuidv4();
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO bug_reports (id, user_id, username, title, message, page, app_version, device_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user_id || null,
        username ? String(username).slice(0, 50) : null,
        title ? String(title).slice(0, 200) : 'Laporan Bug',
        String(message).slice(0, 5000),
        page ? String(page).slice(0, 200) : null,
        app_version ? String(app_version).slice(0, 20) : null,
        device_info ? String(device_info).slice(0, 1000) : null,
      ]
    );
    res.json({ data: { id }, error: null });
  } catch (e) {
    // Kalau tabel belum dimigrasi, kasih pesan jelas
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        data: null,
        error: { message: 'Tabel bug_reports belum ada. Jalankan migration-005.sql di database.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/feedback?limit=50 — lihat laporan masuk (buat kamu, pemilik app)
// TODO: kunci pakai admin token kalau sudah publik penuh.
router.get('/', async (req, res) => {
  let conn;
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, user_id, username, title, message, page, app_version, device_info, status, created_at FROM bug_reports ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    res.json({ data: rows, error: null });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        data: null,
        error: { message: 'Tabel bug_reports belum ada. Jalankan migration-005.sql di database.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/feedback/:id — tandai selesai (status: open/fixed)
router.put('/:id', async (req, res) => {
  let conn;
  try {
    const { status } = req.body || {};
    if (!['open', 'fixed'].includes(status)) {
      return res.status(400).json({ data: null, error: { message: 'status harus open / fixed' } });
    }
    conn = await pool.getConnection();
    await conn.query('UPDATE bug_reports SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ data: { id: req.params.id, status }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
