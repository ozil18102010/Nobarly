// Middleware auth Nobarly: verifikasi JWT dari header Authorization.
// Dipakai endpoint sensitif (update profil, dsb.) supaya user_id client
// tidak bisa dipalsukan. Token diterbitkan routes/auth.js (7 hari).
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Wajib login: tanpa token valid → 401.
function requireLogin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ data: null, error: { message: 'Login dulu (token tidak ada)' } });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    req.authUser = payload;
    next();
  } catch (_) {
    return res.status(401).json({ data: null, error: { message: 'Sesi kedaluwarsa, login ulang' } });
  }
}

// Profil hanya boleh diubah pemiliknya sendiri.
function requireSelf(paramName) {
  return (req, res, next) => {
    if (!req.authUser || req.authUser.id !== req.params[paramName || 'id']) {
      return res.status(403).json({ data: null, error: { message: 'Hanya pemilik akun yang bisa mengubah ini' } });
    }
    next();
  };
}

module.exports = { requireLogin, requireSelf, JWT_SECRET };
