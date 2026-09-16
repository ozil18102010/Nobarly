// Login sosial: Google & GitHub — alur OAuth via server (aman).
// client_secret TIDAK PERNAH ke APK: tukar code → token murni di server.
// Klien (web/APK) cuma buka: GET /api/auth/oauth/:provider?target=native|web
// Callback provider → server → redirect balik:
//   native: nobarly://auth?token=JWT&provider=X  (ditangkap APK via deep link)
//   web:    {origin}/login.html?oauth_token=JWT&provider=X
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const PROVIDERS = {
  google: {
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    extra: { access_type: 'online', prompt: 'select_account' },
  },
  github: {
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    authUrl: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    extra: {},
  },
};

function cfg(name) {
  const p = PROVIDERS[name];
  if (!p) return null;
  const id = process.env[p.env[0]] || null;
  const secret = process.env[p.env[1]] || null;
  if (!id || !secret) return null;
  return { ...p, id, secret };
}

function baseUrl(req) {
  if (process.env.OAUTH_BASE_URL) return process.env.OAUTH_BASE_URL.replace(/\/$/, '');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0];
  return `${proto}://${req.get('host')}`;
}

function signState(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyState(state) {
  try {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return null;
    const expect = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!obj || !obj.nonce || !obj.target) return null;
    // state max 15 menit
    if (Date.now() - (obj.ts || 0) > 15 * 60 * 1000) return null;
    return obj;
  } catch (_) {
    return null;
  }
}

function webOriginAllowed(origin, req) {
  try {
    const o = new URL(origin);
    if (!/^https?:$/.test(o.protocol)) return false;
    const host = req.get('host');
    if (o.host === host) return true;
    if (/^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(o.hostname)) return true;
    const allow = (process.env.OAUTH_WEB_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return allow.includes(o.origin);
  } catch (_) {
    return false;
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
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
    created_at: row.created_at || null,
  };
}

// GET /api/auth/oauth/providers — provider mana yang dikonfigurasi (untuk show/hide tombol)
router.get('/providers', (req, res) => {
  res.json({
    data: {
      google: !!cfg('google'),
      github: !!cfg('github'),
      // facebook dihapus permanen — false dipertahankan agar APK lama menyembunyikan tombolnya
      facebook: false,
    },
    error: null,
  });
});

// GET /api/auth/oauth/:provider?target=native|web&web_origin=... — mulai login
router.get('/:provider', (req, res) => {
  const name = req.params.provider;
  const c = cfg(name);
  if (!c) {
    return res.status(400).json({ data: null, error: { message: `Login ${name} belum dikonfigurasi server.` } });
  }
  const target = req.query.target === 'web' ? 'web' : 'native';
  const webOrigin = String(req.query.web_origin || '');
  if (target === 'web' && !webOriginAllowed(webOrigin, req)) {
    return res.status(400).json({ data: null, error: { message: 'web_origin tidak diizinkan.' } });
  }
  const redirectUri = `${baseUrl(req)}/api/auth/oauth/${name}/callback`;
  const state = signState({
    target,
    web_origin: target === 'web' ? new URL(webOrigin).origin : null,
    nonce: uuidv4(),
    ts: Date.now(),
  });
  const q = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: c.scope,
    state,
    ...c.extra,
  });
  res.redirect(`${c.authUrl}?${q.toString()}`);
});

async function exchangeGoogle(c, code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.id,
      client_secret: c.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json();
  if (!tok.id_token) {
    throw new Error(`Google: gagal tukar code (${tok.error || 'tanpa id_token'}${tok.error_description ? ' — ' + tok.error_description : ''}).`);
  }
  const v = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`);
  const info = await v.json();
  if (!info.sub || info.aud !== c.id) throw new Error('Google: token tidak valid.');
  return {
    id: String(info.sub),
    email: info.email_verified === 'true' || info.email_verified === true ? (info.email || null) : (info.email || null),
    name: info.name || (info.email ? info.email.split('@')[0] : 'User'),
    avatar: info.picture || null,
  };
}

async function exchangeGithub(c, code, redirectUri) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: c.id, client_secret: c.secret, code, redirect_uri: redirectUri }),
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error('GitHub: gagal tukar code.');
  const me = await (await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'nobarly' },
  })).json();
  if (!me.id) throw new Error('GitHub: gagal ambil profil.');
  let email = me.email || null;
  try {
    const emails = await (await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'nobarly' },
    })).json();
    const primary = (emails || []).find((e) => e.primary && e.verified) || (emails || []).find((e) => e.verified);
    if (primary) email = primary.email;
  } catch (_) {}
  return { id: String(me.id), email, name: me.name || me.login || 'User', avatar: me.avatar_url || null };
}

async function uniqueUsername(conn, base) {
  let clean = String(base || 'User').trim().slice(0, 40) || 'User';
  for (let i = 0; i < 20; i++) {
    const cand = i === 0 ? clean : `${clean}${i}`;
    const rows = await conn.query('SELECT id FROM profiles WHERE username = ? LIMIT 1', [cand]);
    if (rows.length === 0) return cand;
  }
  return `${clean}${uuidv4().slice(0, 4)}`;
}

// GET /api/auth/oauth/:provider/callback — terima code dari provider
router.get('/:provider/callback', async (req, res) => {
  const name = req.params.provider;
  const c = cfg(name);
  const fail = (msg) => res.status(400).send(`<h3>Gagal login ${name}</h3><p>${String(msg || '').replace(/</g, '&lt;')}</p><p><a href="/">Kembali</a></p>`);
  if (!c) return fail('provider belum dikonfigurasi.');
  const st = verifyState(req.query.state);
  if (!st) return fail('state tidak valid / kedaluwarsa.');
  if (req.query.error) return fail(req.query.error_description || req.query.error);
  if (!req.query.code) return fail('code tidak ada.');
  const redirectUri = `${baseUrl(req)}/api/auth/oauth/${name}/callback`;
  let conn;
  try {
    const profile = name === 'google'
      ? await exchangeGoogle(c, req.query.code, redirectUri)
      : await exchangeGithub(c, req.query.code, redirectUri);

    conn = await pool.getConnection();
    let rows = [];
    // 1) cocokkan akun tertaut
    try {
      rows = await conn.query('SELECT * FROM profiles WHERE oauth_provider = ? AND oauth_id = ? LIMIT 1', [name, profile.id]);
    } catch (_) { rows = []; /* kolom belum migrasi → fallback email */ }
    // 2) cocokkan email (gabung akun manual + sosial)
    if (rows.length === 0 && profile.email) {
      rows = await conn.query('SELECT * FROM profiles WHERE email = ? LIMIT 1', [String(profile.email).toLowerCase()]);
    }
    let user;
    if (rows.length > 0) {
      user = rows[0];
      try {
        await conn.query('UPDATE profiles SET oauth_provider = ?, oauth_id = ? WHERE id = ?', [name, profile.id, user.id]);
      } catch (_) {}
      if (!user.avatar_url && profile.avatar) {
        try { await conn.query('UPDATE profiles SET avatar_url = ? WHERE id = ?', [profile.avatar, user.id]); } catch (_) {}
      }
    } else {
      const userId = uuidv4();
      const username = await uniqueUsername(conn, profile.name);
      const email = profile.email ? String(profile.email).toLowerCase() : null;
      if (email) {
        const dup = await conn.query('SELECT id FROM profiles WHERE email = ? LIMIT 1', [email]);
        if (dup.length > 0) return fail('email sudah dipakai akun lain.');
      }
      const cols = ['id', 'username', 'email', 'password_hash', 'avatar_url'];
      const vals = [userId, username, email, null, profile.avatar];
      let sql = 'INSERT INTO profiles (id, username, email, password_hash, avatar_url';
      let ph = '?, ?, ?, ?, ?';
      try {
        await conn.query('SELECT oauth_provider FROM profiles LIMIT 1');
        sql += ', oauth_provider, oauth_id';
        ph += ', ?, ?';
        vals.push(name, profile.id);
      } catch (_) {}
      sql += `) VALUES (${ph})`;
      await conn.query(sql, vals);
      const fresh = await conn.query('SELECT * FROM profiles WHERE id = ?', [userId]);
      user = fresh[0];
    }
    const token = signToken(publicUser(user));
    if (st.target === 'web' && st.web_origin) {
      return res.redirect(`${st.web_origin}/login.html?oauth_token=${encodeURIComponent(token)}&provider=${encodeURIComponent(name)}`);
    }
    return res.redirect(`nobarly://auth?token=${encodeURIComponent(token)}&provider=${encodeURIComponent(name)}`);
  } catch (e) {
    // Log server (tanpa secret) agar bisa didiagnosis dari Railway
    try { console.error(`[oauth:${name}] ${e.message}`); } catch (_) {}
    return fail(e.message);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
