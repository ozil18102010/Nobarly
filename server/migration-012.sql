-- Migrasi 012: nameplate custom (preset id / URL foto) — semua gratis, tanpa Nitro
USE nobarly;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nameplate VARCHAR(500);
