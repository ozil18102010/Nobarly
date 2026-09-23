# Nobarly — Nonton Bareng & Komunitas Gamer

Platform nonton streaming bareng (nobar) + komunitas gamer: party YouTube & Twitch yang
playback-nya sinkron ngikutin host, voice channel + soundboard, chat & DM real-time,
komunitas game, dan customize profil gratis (avatar GIF, nameplate, banner).

**Versi saat ini: v2.17.0** — download APK di
[Releases](https://github.com/ozil18102010/Nobarly/releases/latest).

## Fitur

- 📺 Nobar sinkron (YouTube & Twitch, playback ngikutin host + antrean putar otomatis)
- 🔊 Voice channel + soundboard + video call + share layar
- 💬 Chat channel real-time + DM + reply + reaksi
- 👥 Komunitas game (buat / gabung, channel text & voice)
- 🎨 Customize gratis: avatar GIF, nameplate custom, banner, theme dark/light
- 🐞 Lapor Bug dari dalam app + cek update otomatis
- 🖥️ Desktop (Electron) + 📱 Android (Capacitor) + PWA

## Download APK

Ambil versi terbaru di [Releases](https://github.com/ozil18102010/Nobarly/releases/latest)
(`nobarly-v2.17.0.apk`). Kalau muncul "Unknown app / Install anyway", itu wajar
karena belum lewat Play Store — pilih Install anyway.

## Jalanin lokal (development)

Butuh: Node.js + MariaDB/MySQL.

```bash
# 1. Install dependency
npm install
npm run install-server

# 2. Config database
cp .env.example .env
# lalu isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET di .env

# 3. Siapkan database
# jalankan server/schema.sql di MySQL/MariaDB kamu

# 4. Jalanin server + app desktop
npm run dev
# atau server saja: npm run server
# atau desktop saja: npm start
```

Server lokal jalan di `http://localhost:5000` (ikut `SERVER_PORT`/`PORT` di `.env`).

## Build APK

```bash
./scripts/build-apk.sh
# hasil: android/app/build/outputs/apk/debug/nobarly-v2.17.0.apk
```

Butuh JDK 17 (script download otomatis sekali) + Android SDK.
Setiap rilis baru, naikkan versi di 3 tempat biar sinkron:
`package.json` → `version`, `src/js/version.js` → `NOBARLY_VERSION`,
`android/app/build.gradle` → `versionCode` (+1) & `versionName`.

## Struktur repo

```
server/      backend Node.js + MySQL (schema.sql, migrasi, routes)
src/         frontend web / WebView (login, dashboard, js, icons, manifest PWA)
android/     project Capacitor Android (mipmap icon, build.gradle)
main.js      entry Electron desktop
scripts/     build-apk.sh, update-public-url.sh, start-online.sh
render.yaml  blueprint deploy backend ke Render
```

## Deploy backend online

Lihat [PUBLISH.md](PUBLISH.md) — database gratis (Aiven / TiDB / Railway),
deploy server ke Render, sambungkan APK via `PROD_SERVER` di `src/js/config.js`,
lalu share APK lewat Release / Drive.

## Catatan

- File lokal yang tidak ikut repo: `.env`, `uploads/*`, `*.apk`, `*.keystore`
  (lihat `.gitignore`).
- Syarat & privasi: [TERMS.md](TERMS.md), [PRIVACY.md](PRIVACY.md).
