const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Upload wajib login (sebelumnya terbuka untuk publik → rawan spam file)
function requireLogin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ data: null, error: { message: 'Login dulu untuk upload.' } });
    }
    req.authUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    return res.status(401).json({ data: null, error: { message: 'Sesi kedaluwarsa, login ulang.' } });
  }
}

// ---- Penyimpanan: Cloudinary (online) vs disk lokal (laptop) ----
// Kalau 3 env Cloudinary diisi → file naik ke Cloudinary (URL https permanen,
// tidak hilang saat Render restart). Kalau kosong → perilaku lama (folder uploads/).
// Deteksi sekali saat start supaya tiap request tidak re-config.
const CLOUDINARY_ON = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
let cloudinary = null;
if (CLOUDINARY_ON) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[uploads] Penyimpanan: Cloudinary (' + process.env.CLOUDINARY_CLOUD_NAME + ')');
} else {
  console.log('[uploads] Penyimpanan: disk lokal (isi CLOUDINARY_* untuk permanen saat deploy)');
}

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// Memory storage: buffer dipakai untuk Cloudinary ATAU ditulis ke disk fallback.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error('Tipe file tidak didukung. Pakai JPG, PNG, GIF, atau WebP.'));
  }
});

function extFor(file) {
  return ALLOWED_MIME[file.mimetype] || path.extname(file.originalname || '').toLowerCase() || '.jpg';
}

function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'nobarly',
        public_id: path.basename(filename, path.extname(filename)),
        resource_type: 'image',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// POST /api/uploads — upload 1 gambar, balas { data: { url }, error }
// url = https Cloudinary (online) atau /uploads/xxx (lokal). Keduanya dipahami
// imageSrc() frontend + validasi avatar/banner backend.
router.post('/', requireLogin, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ data: null, error: { message: 'File gambar wajib diisi (field "image")' } });
  }
  const filename = uuidv4() + extFor(req.file);
  if (CLOUDINARY_ON) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, filename);
      if (!result || !result.secure_url) throw new Error('Cloudinary tidak mengembalikan URL');
      return res.json({ data: { url: result.secure_url }, error: null });
    } catch (e) {
      console.error('[uploads] Cloudinary gagal:', e.message);
      return res.status(502).json({ data: null, error: { message: 'Upload gambar gagal, coba lagi.' } });
    }
  }
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  } catch (e) {
    return res.status(500).json({ data: null, error: { message: 'Gagal menyimpan gambar.' } });
  }
  res.json({ data: { url: `/uploads/${filename}` }, error: null });
});

module.exports = router;
