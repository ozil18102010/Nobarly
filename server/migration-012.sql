-- Migrasi 012: nameplate custom (preset id / URL foto) — semua gratis
USE nobarly;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nameplate VARCHAR(500);
