// Indikator "sedang mengetik" (ephemeral, in-memory — hilang saat restart, wajar).
const express = require('express');

const router = express.Router();

// key -> Map(user_id -> { username, at })
const typing = new Map();

function getBucket(scope, scopeId) {
  const key = `${scope}:${scopeId}`;
  if (!typing.has(key)) typing.set(key, new Map());
  return typing.get(key);
}

function prune(bucket) {
  const now = Date.now();
  for (const [uid, v] of bucket) {
    if (now - v.at > 6000) bucket.delete(uid);
  }
}

// POST /api/typing { scope: 'channel'|'dm', scope_id, user_id, username }
router.post('/', (req, res) => {
  const { scope, scope_id, user_id, username } = req.body || {};
  if (!['channel', 'dm'].includes(scope) || !scope_id || !user_id) {
    return res.status(400).json({ data: null, error: { message: 'scope, scope_id, user_id wajib diisi' } });
  }
  const bucket = getBucket(scope, String(scope_id));
  bucket.set(String(user_id), { username: String(username || 'User').slice(0, 50), at: Date.now() });
  prune(bucket);
  res.json({ data: { ok: true }, error: null });
});

// GET /api/typing?scope=&scope_id=&user_id= — yang lain sedang mengetik
router.get('/', (req, res) => {
  const { scope, scope_id, user_id } = req.query;
  if (!scope || !scope_id) {
    return res.status(400).json({ data: null, error: { message: 'scope & scope_id wajib diisi' } });
  }
  const bucket = getBucket(scope, String(scope_id));
  prune(bucket);
  const out = [];
  for (const [uid, v] of bucket) {
    if (uid !== String(user_id || '')) out.push({ user_id: uid, username: v.username });
  }
  res.json({ data: out.slice(0, 5), error: null });
});

module.exports = router;
