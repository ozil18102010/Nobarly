#!/bin/bash
# Ganti URL publik APK setelah reboot (URL tunnel gratis berubah tiap boot).
# Pakai: ./scripts/update-public-url.sh https://xxx.trycloudflare.com
# Otomatis: update PROD_SERVER + naikkan BAKED_SERVER_V + rebuild APK.
set -e
cd "$(dirname "$0")/.."

if [ -z "${1:-}" ]; then
  echo "Pakai: ./scripts/update-public-url.sh https://xxx.trycloudflare.com"
  echo "Lihat URL aktif: cat /tmp/opencode/public-url.txt"
  exit 1
fi
BASE=$(echo "$1" | sed 's:/\+$::')
case "$BASE" in
  http://*|https://*) ;;
  *) BASE="https://$BASE" ;;
esac
API="$BASE/api"

echo "URL baru: $API"
# 1. Update PROD_SERVER di config.js
sed -i "s|^var PROD_SERVER = .*|var PROD_SERVER = '$API';|" src/js/config.js
# 2. Naikkan BAKED_SERVER_V supaya HP lama otomatis pindah server
V=$(grep -oE "var BAKED_SERVER_V = [0-9]+" src/js/config.js | grep -oE "[0-9]+")
NEWV=$((V + 1))
sed -i "s|var BAKED_SERVER_V = .*|var BAKED_SERVER_V = $NEWV;|" src/js/config.js
grep -n "PROD_SERVER =\|BAKED_SERVER_V =" src/js/config.js | head -3

# 3. Rebuild APK (pakai script standar)
./scripts/build-apk.sh

echo ""
echo "SELESAI. Kirim ulang APK ke teman via WhatsApp."
echo "Teman versi lama otomatis pindah server setelah update (migrasi v$NEWV)."
