-- Migrasi 007 (v2.0): presence online + reply DM + antrean nobar
USE nobarly;

-- Kapan user terakhir aktif (heartbeat dari APK, untuk titik hijau akurat)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen);

-- Reply pada DM (channel sudah punya reply_to sejak awal)
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS reply_to VARCHAR(36);

-- Antrean video per nobar party (tambah banyak link, putar satu-satu)
CREATE TABLE IF NOT EXISTS watch_queue (
  id VARCHAR(36) PRIMARY KEY,
  watch_party_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  stream_url VARCHAR(500) NOT NULL,
  stream_type ENUM('youtube', 'twitch') DEFAULT 'youtube',
  added_by VARCHAR(36),
  added_by_name VARCHAR(50),
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watch_party_id) REFERENCES watch_parties(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_queue_party ON watch_queue (watch_party_id, position, created_at);
