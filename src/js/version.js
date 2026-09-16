// Versi APK — NAIKKAN tiap kali build baru buat teman!
// Aturan simpel: 1.1.0 → 1.1.1 (fix kecil), 1.1.0 → 1.2.0 (fitur baru)
// Versi ini tampil di dashboard + terkirim otomatis saat Lapor Bug,
// jadi kamu tahu teman pakai versi mana saat baca laporan.
var NOBARLY_VERSION = '2.11.0';
try {
  window.NOBARLY_VERSION = NOBARLY_VERSION;
} catch (_) {}
