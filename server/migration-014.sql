-- Migrasi 014: tautan akun sosial (Google / GitHub)
USE nobarly;

ALTER TABLE profiles ADD COLUMN oauth_provider VARCHAR(20);
ALTER TABLE profiles ADD COLUMN oauth_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_oauth ON profiles (oauth_provider, oauth_id);
