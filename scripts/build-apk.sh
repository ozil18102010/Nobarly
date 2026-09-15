#!/bin/bash
# Build APK Nobarly 1 perintah — buat dibagikan ke teman.
# Pakai: ./scripts/build-apk.sh
# Hasil: android/app/build/outputs/apk/debug/app-debug.apk
set -e
cd "$(dirname "$0")/.."

# Java 17 wajib (Gradle 8.2.1 tidak jalan di Java 25 bawaan sistem).
# Lokasi permanen ~/.cache (tidak ikut kehapus seperti /tmp pas reboot).
# Kalau belum ada, download otomatis sekali (~184MB).
JDK17="$HOME/.cache/nobarly/jdk17"
if [ ! -x "$JDK17/bin/java" ]; then
  if [ -x /tmp/opencode/jdk17/bin/java ]; then
    mkdir -p "$HOME/.cache/nobarly"
    cp -r /tmp/opencode/jdk17 "$JDK17"
  else
    echo "Download JDK 17 dulu (sekali saja)..."
    mkdir -p "$HOME/.cache/nobarly" /tmp/opencode
    curl -sL -o /tmp/opencode/jdk17.tar.gz https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.11_9.tar.gz
    mkdir -p "$JDK17"
    tar xzf /tmp/opencode/jdk17.tar.gz -C "$JDK17" --strip-components=1
  fi
fi
export JAVA_HOME="$JDK17"
export PATH="$JAVA_HOME/bin:$PATH"
# Android SDK (lokasi standar Fedora)
if [ -z "$ANDROID_HOME" ] && [ -d "$HOME/Android/Sdk" ]; then
  export ANDROID_HOME="$HOME/Android/Sdk"
  export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
fi

echo "=== 1/3 Sync Capacitor (src -> android) ==="
npx cap sync android

echo ""
echo "=== 2/3 Build APK debug ==="
cd android
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "=== 3/3 Selesai ==="
if [ -f "$APK" ]; then
  ls -lh "$APK"
  echo ""
  echo "APK siap dibagikan: android/app/build/outputs/apk/debug/app-debug.apk"
  # Copy dengan nama versi biar gampang share (nobarly-v1.1.0.apk)
  VER=$(node -p "require('../package.json').version" 2>/dev/null || echo "1.1.0")
  cp "$APK" "app/build/outputs/apk/debug/nobarly-v${VER}.apk"
  echo "Copy juga sebagai: android/app/build/outputs/apk/debug/nobarly-v${VER}.apk"
else
  echo "GAGAL: $APK tidak ketemu. Cek error Gradle di atas."
  exit 1
fi
