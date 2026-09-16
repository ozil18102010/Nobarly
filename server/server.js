const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const authRouter = require('./routes/auth');
const uploadsRouter = require('./routes/uploads');
const profilesRouter = require('./routes/profiles');
const communitiesRouter = require('./routes/communities');
const channelsRouter = require('./routes/channels');
const postsRouter = require('./routes/posts');
const watchRouter = require('./routes/watch');
const voiceRouter = require('./routes/voice');
const chatRouter = require('./routes/chat');
const friendsRouter = require('./routes/friends');
const dmRouter = require('./routes/dm');
const timelineRouter = require('./routes/timeline');
const followsRouter = require('./routes/follows');
const debatesRouter = require('./routes/debates');
const feedbackRouter = require('./routes/feedback');
const oauthRouter = require('./routes/oauth');
const queueRouter = require('./routes/queue');
const questsRouter = require('./routes/quests');
const typingRouter = require('./routes/typing');

const app = express();
// Render / Railway / Fly memberi PORT via env. SERVER_PORT tetap didukung lokal.
// Default 5000 (dulu 3000) supaya selaras dengan frontend, Electron (main.js),
// .env.example, dan semua docs — tanpa .env pun langsung nyambung.
const PORT = process.env.PORT || process.env.SERVER_PORT || 5000;
// Versi app — tampil di APK + endpoint /api/version biar ketahuan teman pakai versi mana.
const APP_VERSION = process.env.APP_VERSION || '2.14.0';

app.use(cors());
app.use(express.json());
// Percaya header X-Forwarded-Proto dari Railway agar redirect_uri OAuth https benar
app.set('trust proxy', 1);

// File gambar upload (GET /uploads/<nama-file>)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve frontend (login.html, dashboard.html, js, css) supaya HP / PWA / APK
// bisa akses cukup dengan 1 origin: http://<ip-laptop>:5000 atau domain hosting.
// Contoh HP via WiFi: http://192.168.100.37:5000/login.html (tanpa ini HP cuma dapat API).
const webRoot = path.join(__dirname, '..', 'src');
app.use(express.static(webRoot));
app.get('/', (req, res) => {
  res.sendFile(path.join(webRoot, 'login.html'));
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/auth/oauth', oauthRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/communities', communitiesRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/watch-parties', watchRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/chat', chatRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/dm', dmRouter);
app.use('/api/shouts', timelineRouter);
app.use('/api/follows', followsRouter);
app.use('/api/debates', debatesRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/queue', queueRouter);
app.use('/api/quests', questsRouter);
app.use('/api/typing', typingRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Nobarly server running', version: APP_VERSION });
});

// Versi server — dipakai APK untuk cek update ("ada versi baru, download lagi")
app.get('/api/version', (req, res) => {
  res.json({
    data: {
      version: APP_VERSION,
      // Isi APK_URL di hosting (env) dengan link download APK terbaru,
      // mis. https://github.com/username/nobarly/releases/latest
      apk_url: process.env.APK_URL || null,
      message: process.env.UPDATE_MESSAGE || null,
    },
    error: null,
  });
});

// Jam server (ms) — dipakai klien menghitung offset jam untuk sync playback
app.get('/api/time', (req, res) => {
  res.json({ data: { now: Date.now() }, error: null });
});

// 404 JSON untuk endpoint /api yang tidak dikenal
app.use('/api', (req, res) => {
  res.status(404).json({ data: null, error: { message: 'Endpoint tidak ditemukan' } });
});

// Produksi wajib punya JWT_SECRET sendiri (dulu fallback 'dev-secret...' = token bisa ditempa)
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET belum diisi di production. Isi JWT_SECRET di env lalu restart.');
  process.exit(1);
}

// Error handler: selalu balas JSON (bukan HTML) supaya db.js tidak crash parse
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ data: null, error: { message: 'Body JSON tidak valid' } });
  }
  // Error dari multer (file kebesaran / tipe salah)
  if (err && (err.code === 'LIMIT_FILE_SIZE' || (err.message && /tipe file|multer/i.test(err.message)))) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Gambar maksimal 5MB.'
      : err.message;
    return res.status(400).json({ data: null, error: { message: msg } });
  }
  res.status(500).json({ data: null, error: { message: (err && err.message) || 'Server error' } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nobarly server v${APP_VERSION} running on http://localhost:${PORT}`);
  console.log(`Akses HP satu WiFi via IP laptop, mis. http://192.168.100.37:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health | Version: http://localhost:${PORT}/api/version`);
});
