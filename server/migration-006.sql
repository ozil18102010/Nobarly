-- Migrasi 006: foto profil user
USE nobarly;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
