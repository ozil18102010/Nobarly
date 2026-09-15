-- Migrasi 009: status kamera di voice (badge 📹 di tile)
USE nobarly;

ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS is_video BOOLEAN DEFAULT false;
