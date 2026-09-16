const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

function publicUser(row) {
  if (!row) return null;
  let connections = null;
  try { connections = row.connections ? JSON.parse(row.connections) : null; } catch (_) {}
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    avatar_url: row.avatar_url || null,
    bio: row.bio || null,
    orbs: row.orbs || 0,
    avatar_frame: row.avatar_frame || null,
    banner: row.banner || null,
    status: row.status || 'online',
    connections,
    last_seen: row.last_seen || null,
    created_at: row.created_at || null
  };
}

// POST /api/auth/register { username, email, password }
router.post('/register', async (req, res) => {
  let conn;
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ data: null, error: { message: 'username, email, dan password wajib diisi' } });
    }
    if (String(username).trim().length < 3) {
      return res.status(400).json({ data: null, error: { message: 'username minimal 3 karakter' } });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ data: null, error: { message: 'password minimal 6 karakter' } });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ data: null, error: { message: 'format email tidak valid' } });
    }
    const cleanUsername = String(username).trim();

    conn = await pool.getConnection();

    const existing = await conn.query(
      'SELECT id FROM profiles WHERE email = ? OR username = ? LIMIT 1',
      [cleanEmail, cleanUsername]
    );
    if (existing.length > 0) {
      return res.status(409).json({ data: null, error: { message: 'email atau username sudah dipakai', code: '23505' } });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const userId = uuidv4();
    await conn.query(
      'INSERT INTO profiles (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [userId, cleanUsername, cleanEmail, passwordHash]
    );
    const rows = await conn.query('SELECT * FROM profiles WHERE id = ?', [userId]);
    const user = publicUser(rows[0]);
    const token = signToken(user);
    res.json({ data: { token, user }, error: null });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ data: null, error: { message: 'email atau username sudah dipakai', code: '23505' } });
    }
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/auth/login { email, password }
router.post('/login', async (req, res) => {
  let conn;
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ data: null, error: { message: 'email dan password wajib diisi' } });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM profiles WHERE email = ? LIMIT 1', [cleanEmail]);
    if (rows.length === 0) {
      return res.status(401).json({ data: null, error: { message: 'email atau password salah' } });
    }
    const row = rows[0];
    if (!row.password_hash) {
      return res.status(401).json({
        data: null,
        error: { message: 'akun ini belum punya password (akun lama). Silakan daftar ulang / hubungi admin.' }
      });
    }
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ data: null, error: { message: 'email atau password salah' } });
    }
    const user = publicUser(row);
    const token = signToken(user);
    res.json({ data: { token, user }, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: { message: e.message } });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/auth/me — verifikasi token
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ data: null, error: { message: 'token tidak ada' } });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query('SELECT * FROM profiles WHERE id = ? LIMIT 1', [payload.id]);
      if (rows.length === 0) {
        return res.status(401).json({ data: null, error: { message: 'user tidak ditemukan' } });
      }
      res.json({ data: publicUser(rows[0]), error: null });
    } finally {
      if (conn) conn.release();
    }
  } catch (e) {
    res.status(401).json({ data: null, error: { message: 'token tidak valid / kedaluwarsa' } });
  }
});

module.exports = router;
