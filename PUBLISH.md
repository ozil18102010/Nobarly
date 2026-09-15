# Nobarly — Cara Publikasi APK ke Teman (Anti Ribet)

> STATUS 2026-09-12: server sudah ONLINE via tunnel publik sementara:
> `https://altered-relationships-promotions-move.trycloudflare.com`
> APK `nobarly-v1.1.0.apk` sudah dibuild dan menunjuk ke sana — tinggal share.
> Syarat: laptop ini tetap nyala (server + tunnel jalan di background).
> Kalau laptop restart: jalankan lagi `node server/server.js` + tunnel (lihat bagian 6),
> update `PROD_SERVER` kalau URL tunnel berubah, lalu `npm run apk:build`.

Masalah kemarin: APK masih menunjuk ke `http://192.168.100.37:5000` (WiFi rumah).
Teman di luar WiFi = tidak bisa login. Sekarang sudah diperbaiki:

- APK default ke server **online (HTTPS)** → `src/js/config.js` → `PROD_SERVER`
- Ada **nomor versi** (`src/js/version.js`, sekarang `1.1.0`) tampil di login + dashboard
- Ada tombol **🐞 Lapor Bug** di dashboard → masuk ke tabel `bug_reports`
- Error crash otomatis terkirim ke server (max 1x/menit, tidak ganggu user)
- Ada cek update otomatis: kalau server lebih baru, muncul banner "Ada versi baru"
- Backend siap deploy ke Render gratis (`render.yaml`)

---

## 1. Deploy backend online (sekali saja, ~15 menit)

### 1a. Bikin database MySQL gratis
Pilih salah satu (gratis):
- **Aiven** (aio) — https://aiven.io → Create MySQL (free) → catat Host, Port, User, Password, Database
- **TiDB Cloud** — https://tidbcloud.com → Serverless gratis, kompatibel MySQL
- **Railway** — https://railway.app → New → Database → MySQL

Setelah jadi, jalankan di database itu:
1. `server/schema.sql` (bikin semua tabel, termasuk `bug_reports`)
2. Kalau DB sudah ada isi lama: jalankan `server/migration-005.sql` saja

### 1b. Deploy server ke Render (gratis)
1. Push folder Nobarly ini ke GitHub (private boleh)
2. Buka https://render.com → New → **Blueprint** → pilih repo → OK (`render.yaml` otomatis kepakai)
3. Isi Environment:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` → dari langkah 1a
   - `DB_SSL` → `true` (untuk Aiven/TiDB), `false` kalau Railway
   - `JWT_SECRET` → klik Generate (sudah auto)
   - `APP_VERSION` → `1.1.0`
   - `APK_URL` → kosongkan dulu, isi nanti setelah upload APK
4. Deploy → tunggu hijau → catat URL, mis. `https://nobarly-server.onrender.com`
5. Tes di browser: `https://nobarly-server.onrender.com/api/health` → harus `{"status":"ok",...}`
   Dan: `https://nobarly-server.onrender.com/api/version`

> Catatan Render gratis: server tidur setelah 15 menit tidak dipakai, bangun ~30 detik saat dibuka pertama. Wajar.

### 1c. Sambungkan APK ke server online (1 baris)
Edit `src/js/config.js`:
```js
var PROD_SERVER = 'https://ALAMAT-RENDER-KAMU.onrender.com/api';
```
Ganti dengan URL Render dari langkah 1b. Itu saja. Tidak perlu utak-atik IP lagi.

---

## 2. Build APK buat dibagikan (1 perintah)

```bash
npm run apk:build
# sama dengan ./scripts/build-apk.sh
```

Hasil:
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/debug/nobarly-v1.1.0.apk` (nama ber-versi, ini yang dishare)

Setiap rilis baru:
1. Naikkan versi di 3 tempat (biar sinkron):
   - `package.json` → `version`
   - `src/js/version.js` → `NOBARLY_VERSION`
   - `android/app/build.gradle` → `versionCode +1`, `versionName`
2. `npm run apk:build`
3. Upload + share (langkah 3)

---

## 3. Share ke teman (pilih 1)

**Paling gampang (tanpa Play Store):**
1. Upload `nobarly-v1.1.0.apk` ke **Google Drive** → Share → Anyone with link, atau ke **GitHub Release**
2. Kirim link + pesan ini ke teman:
   > Install Nobarly v1.1.0: [link]. Kalau ada tulisan "Unknown app", pilih Install anyway (wajar karena belum Play Store). Login/daftar langsung bisa, tidak perlu setting WiFi. Kalau error, klik 🐞 Lapor Bug di dalam app.
3. (Opsional) Isi `APK_URL` di Render dengan link di atas → teman versi lama otomatis dapat banner update.

**Naik kelas (biar kelihatan resmi):**
- GitHub Release: repo → Releases → Draft new → upload APK → teman download dari `github.com/.../releases/latest`
- Firebase App Distribution: gratis, bisa lihat siapa install + crash report otomatis
- Play Store Internal Testing: butuh akun developer $25 sekali bayar, upload AAB

---

## 4. Cara baca laporan bug dari teman

Semua laporan masuk ke tabel `bug_reports`. Cara lihat:

```bash
# via API (browser / curl):
https://ALAMAT-RENDER-KAMU.onrender.com/api/feedback?limit=50
```

Isinya: judul, pesan, **versi app teman**, halaman, tipe HP, username, waktu.
Kalau sudah diperbaiki:
```bash
curl -X PUT https://ALAMAT-RENDER-KAMU.onrender.com/api/feedback/ID-LAPORAN \
  -H "Content-Type: application/json" -d '{"status":"fixed"}'
```

Alur fix enak:
1. Teman lapor via tombol 🐞 (atau error otomatis masuk sendiri)
2. Kamu lihat versi berapa yang rusak (mis. v1.1.0)
3. Perbaiki → naikkan versi (1.1.1) → build → share link baru
4. Teman versi lama otomatis lihat banner "Ada versi baru"

---

## 5. Masih lokal? (darurat / demo satu WiFi)

Kalau belum deploy dan mau demo cepat satu WiFi:
1. Dashboard → ikon server → isi `http://IP-LAPTOP:5000/api`
2. Atau di login → "Pengaturan server" → Simpan
3. Tidak disarankan buat dibagi ke teman luar — pakai langkah 1 agar permanen.

## 6. Laptop mati / restart (sudah otomatis)

- **MariaDB**: otomatis nyala sendiri (sudah `enabled`). ✅
- **Server + tunnel**: otomatis nyala via cron `@reboot` → `scripts/start-online.sh`. Cek: `cat /tmp/opencode/public-url.txt`
- **Tapinya**: URL tunnel gratis **berubah tiap boot**. Setelah boot, cek kecocokan:
  - Kalau `start-online.sh` bilang COCOK → tidak perlu apa-apa.
  - Kalau BEDA → jalankan `./scripts/update-public-url.sh <URL-BARU>` (update config + rebuild APK otomatis), lalu kirim ulang APK.
- **Solusi permanen (disarankan)**: named tunnel Cloudflare (URL tetap, gratis, butuh akun 1x) atau deploy Render (laptop boleh mati total). Bilang saja kalau mau pindah.

---

## Checklist file yang diubah update ini
- `server/routes/feedback.js` (baru) + `server/migration-005.sql` (baru)
- `server/server.js` → `/api/version`, `/api/health` bawa versi, `PORT` Render
- `server/config.js` → dukung `DATABASE_URL`, `MYSQL*`, `DB_SSL`
- `server/schema.sql` → tabel `bug_reports`
- `render.yaml` (baru), `.env.example` (baru)
- `src/js/version.js` (baru), `src/js/bugreport.js` (baru)
- `src/js/config.js` → default APK = HTTPS produksi, `BAKED_SERVER_V=2`
- `src/dashboard.html` + `src/js/dashboard.js` → tombol 🐞 + tampil versi
- `src/login.html` → tampil versi
- `scripts/build-apk.sh` (baru), `package.json` → `apk:build`, versi 1.1.0
- `android/app/build.gradle` → versionCode 2, versionName 1.1.0

## Riwayat versi
- **v2.10.0**: Revisi UI laptop ala Discord, full gratis — hapus Quests/Shop/Nitro dari menu (ganti Customize) • Settings via logo gear di profile card (theme dark/light, status, server, bug, versi, logout) • klik profile card → floating self-profile (banner, nameplate, bio, Edit Profile, status, Switch Accounts, footer gear+logout) • Edit Profile 3 kolom (nameplate custom foto 600×120, avatar GIF animasi di chat/DM/voice, banner warna/foto, tanpa Nitro) • backend `nameplate` (`migration-012.sql`) • avatar GIF tetap bergerak everywhere
- **v2.8.0**: Fix crash buka DM dari Profil • prompt() → modal (momen + repost, fix Android) • share layar laptop (handler Electron) • indikator "sedang mengetik" • apiFetch anti-crash offline • upload wajib login • laporan lama ditandai fixed
- **v2.7.3**: Badge 📹 kamera di tile voice • status mute/kamera instan (optimistik, tanpa nunggu polling) • polling member 2 dtk + cache profil • deteksi bicara 200ms • `migration-009.sql`
- **v2.7.2**: Tile voice ngikutin suara (diam = border hitam, bicara = putih) • mute = foto grayscale + border & mic merah • penanda "kamu" pindah ke papan nama
- **v2.7.1**: Tile voice ngisi layar (makin dikit orang makin gede, avatar 96px)
- **v2.7.0**: Voice stage full + soundboard floating (tengah/sheet, ada search+✕) • drawer kontrol auto-hide saat idle • semua tombol drawer berfungsi
- **v2.6.0**: Animasi ala Discord (halaman fade-geser, pesan/tile baru pop, modal zoom, tombol memendek, tile bicara berdenyut, join ada loading) + anti-flicker + hormat reduced-motion
- **v2.5.0**: Klik avatar di chat → popup profil ala Discord (banner, mutual friends/servers, bio, Message @user) • HP: kartu mengambang
- **v2.4.1**: Panel user dibikin clean (ikon lapor + server + versi dibuang, sisa avatar/nama/status/logout)
- **v2.4.0**: Rich theme (bg #111214, status hijau/kuning/merah, frame & banner warna) • halaman Profil + Edit (bio, tag, connections, frame, banner) • Quests (check-in 🪙) + Shop + Nitro + Settings • bottom nav baru + mini-profile • Active Stream Card • panel profil kanan (laptop) • `migration-008.sql`
- **v2.3.1**: Hapus avatar "D" di rel bawah (minta user) • profil tetap via panel user
- **v2.3.0**: Voice laptop ala Discord (stage + panel chat kanan + tombol ⋯ + box Voice Connected)
- **v2.2.1**: Fix rel nyangkut di bawah layar desktop (pindah ke dalam container) • kolom chat kepotong ikut bener
- **v2.2.0**: Refactor UI Geometric Mono (radius 0, tanpa biru/ungu, font mono status) • layout 3 kolom desktop (rel 72px + swap sidebar) • breakpoint 768 • voice tile kotak + active speaker (border putih) • bottom toolbar + soundboard bottom-sheet (HP) • panel user di kolom channel
- **v2.1.1**: Tombol 🐞 di rel HP (selalu terlihat) • fix kamera HP (1 sesi AV + replaceTrack, lawan NotReadableError) • tombol Share disembunyikan bila tak didukung (WebView HP) • auto-lapor bawa stack trace • 2 laporan v2.0.0 ditandai fixed
- **v2.1.0**: Komunitas ala Discord (header + jumlah member + search + section lipat) • voice room ala Discord (pre-join + tile besar + bar kontrol) • tetap monochrome
- **v2.0.1**: Foto tampil di chat channel + chat nobar • Keluar + Lapor Bug pindah ke modal Profil • userbar dipisah dari halaman Pesan (HP) • auto-diagnostik kamera/share (error detail masuk Lapor Bug)
- **v2.0.0**: 📹 video call + share layar di voice room • 🟢 status online akurat (heartbeat) • ↩️ reply DM • 🎬 antrean putar nobar (+jalan otomatis) • ⚡ reaksi chat 1 request (dulu 50x) • 💀 skeleton loading
- **v1.1.1**: Lapor Bug 🐞, cek update otomatis, APK default HTTPS, TURN voice, fix terima pertemanan, fallback YouTube embed, Twitch parent dinamis
- **v1.1.2**: Fix YouTube Error 153 di desktop (iframe biasa di `file://`) + status mode desktop
- **v1.1.3**: Halaman Pesan ala Discord (snippet + waktu + userbar + tombol kembali) + `GET /api/dm/recent`
- **v1.1.4**: Foto profil (kolom `avatar_url`, `migration-006.sql`, modal ganti foto, tampil di DM/voice/sidebar) + rel server kiri (mobile)
- Catatan deploy: DB online wajib sudah menjalankan `migration-005.sql` + `migration-006.sql` + `migration-007.sql` (atau import ulang `schema.sql` terbaru)
