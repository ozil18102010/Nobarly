const express = require('express');
const pool = require('../config');

const router = express.Router();

// Katalog server-side (harga dipercaya dari sini, bukan dari APK)
const SHOP = {
  frame_white: { kind: 'avatar_frame', value: 'white', price: 100, label: 'Bingkai Putih' },
  frame_gold: { kind: 'avatar_frame', value: 'gold', price: 200, label: 'Bingkai Emas' },
  frame_red: { kind: 'avatar_frame', value: 'red', price: 150, label: 'Bingkai Merah' },
  frame_blue: { kind: 'avatar_frame', value: 'blue', price: 150, label: 'Bingkai Biru' },
  banner_sunset: { kind: 'banner', value: 'sunset', price: 150, label: 'Banner Sunset' },
  banner_ocean: { kind: 'banner', value: 'ocean', price: 150, label: 'Banner Ocean' },
  banner_forest: { kind: 'banner', value: 'forest', price: 150, label: 'Banner Forest' },
  banner_neon: { kind: 'banner', value: 'neon', price: 250, label: 'Banner Neon' },
};

// GET /api/quests/shop — katalog + saldo user
router.get('/shop', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.query;
    let orbs = 0;
    if (user_id) {
      conn = await pool.getConnection();
      const rows = await conn.query('SELECT orbs FROM profiles WHERE id = ? LIMIT 1', [user_id]);
      if (rows.length > 0) orbs = rows[0].orbs || 0;
    }
    const items = Object.entries(SHOP).map(([id, it]) => ({ id, ...it }));
    res.json({ data: { orbs, items }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/quests/buy { user_id, item_id } — beli & langsung pakai
router.post('/buy', async (req, res) => {
  let conn;
  try {
    const { user_id, item_id } = req.body || {};
    const item = SHOP[item_id];
    if (!user_id || !item) {
      return res.status(400).json({ data: null, error: { message: 'user / item tidak valid' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT orbs FROM profiles WHERE id = ? LIMIT 1', [user_id]);
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'User tidak ditemukan' } });
    }
    if ((rows[0].orbs || 0) < item.price) {
      return res.status(400).json({ data: null, error: { message: 'Orbs kurang! Check-in harian dulu. 🪙' } });
    }
    await conn.query(
      `UPDATE profiles SET orbs = orbs - ?, ${item.kind} = ? WHERE id = ?`,
      [item.price, item.value, user_id]
    );
    const updated = await conn.query(
      'SELECT orbs, avatar_frame, banner FROM profiles WHERE id = ?', [user_id]
    );
    res.json({ data: { ...updated[0], bought: item_id }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/quests/checkin { user_id } — +50 orbs, sekali sehari
router.post('/checkin', async (req, res) => {
  let conn;
  try {
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ data: null, error: { message: 'user_id wajib diisi' } });
    }
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT orbs, (last_checkin IS NOT NULL AND DATE(last_checkin) = CURDATE()) AS claimed_today FROM profiles WHERE id = ? LIMIT 1',
      [user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: { message: 'User tidak ditemukan' } });
    }
    // Bandingkan pakai tanggal DB (CURDATE) supaya tidak beda zona waktu
    if (rows[0].claimed_today) {
      return res.json({ data: { orbs: rows[0].orbs || 0, claimed: false }, error: null });
    }
    await conn.query(
      'UPDATE profiles SET orbs = COALESCE(orbs, 0) + 50, last_checkin = CURDATE() WHERE id = ?',
      [user_id]
    );
    const updated = await conn.query('SELECT orbs FROM profiles WHERE id = ?', [user_id]);
    res.json({ data: { orbs: updated[0].orbs, claimed: true, reward: 50 }, error: null });
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        data: null,
        error: { message: 'Kolom orbs/last_checkin belum ada. Jalankan migration-008.sql.' },
      });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
