#!/bin/bash
# Nobarly auto-online — dijalankan otomatis tiap laptop boot (cron @reboot).
# Urutan: MariaDB (otomatis oleh sistem) → server Nobarly → tunnel publik.
# Catatan: URL tunnel GRATIS berubah tiap boot. Setelah boot, script ini
# mencetak URL baru — kalau beda dari APK, jalankan:
#   ./scripts/update-public-url.sh <URL-BARU>
# (atau pindah ke named tunnel / Render biar URL permanen — lihat PUBLISH.md)
set -u
cd "$(dirname "$0")/.."
mkdir -p /tmp/opencode
# Binary di ~/.cache (permanen, tidak ikut kehapus seperti /tmp pas reboot)
CLOUDFLARED="$HOME/.cache/nobarly/cloudflared"
if [ ! -x "$CLOUDFLARED" ]; then
  echo "Download cloudflared dulu..."
  mkdir -p "$HOME/.cache/nobarly"
  curl -sL -o "$CLOUDFLARED" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$CLOUDFLARED"
fi

echo "[1/3] Tunggu MariaDB..."
for i in $(seq 1 30); do
  mariadb -u root -proot -e "SELECT 1" > /dev/null 2>&1 && break
  sleep 2
done

echo "[2/3] Hidupkan server Nobarly..."
if ! curl -sf -m 5 http://localhost:5000/api/health > /dev/null 2>&1; then
  setsid nohup node server/server.js > /tmp/opencode/nobarly-server.log 2>&1 < /dev/null
  for i in $(seq 1 30); do
    sleep 2
    curl -sf -m 5 http://localhost:5000/api/health > /dev/null 2>&1 && break
  done
fi
curl -sf -m 5 http://localhost:5000/api/health || echo "PERINGATAN: server lokal tidak nyala!"

echo "[3/3] Hidupkan tunnel publik..."
pkill -f "[c]loudflared tunnel" 2>/dev/null
sleep 1
setsid nohup "$CLOUDFLARED" tunnel --url http://localhost:5000 > /tmp/opencode/tunnel.log 2>&1 < /dev/null
URL=""
for i in $(seq 1 90); do
  sleep 2
  URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/opencode/tunnel.log 2>/dev/null | head -1)
  [ -n "$URL" ] && break
done
echo "$URL" > /tmp/opencode/public-url.txt
echo ""
echo "URL PUBLIK: $URL"
echo "Tes: $URL/api/health"
echo ""
echo "Cek APK masih cocok atau tidak:"
BAKED=$(grep -oE "https://[a-zA-Z0-9./-]+" src/js/config.js | grep trycloudflare | head -1)
if [ "$URL/api" = "$BAKED" ]; then
  echo "COCOK — APK yang sudah disebar tetap jalan. Tidak perlu apa-apa. ✅"
else
  echo "BEDA (APK menunjuk ke $BAKED)."
  echo "Jalankan: ./scripts/update-public-url.sh $URL"
fi
