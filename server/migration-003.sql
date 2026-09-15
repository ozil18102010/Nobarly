-- Migrasi 003: sinkronisasi playback nobar + co-host streamer
USE nobarly;

-- State playback terakhir dari host/co-host (dibaca penonton untuk follow)
-- PENTING: pb_updated_at TIDAK boleh ON UPDATE — kolom ini hanya ditulis
-- endpoint playback. Update lain (mis. viewer_count) tidak boleh me-reset jam sync.
ALTER TABLE watch_parties ADD COLUMN IF NOT EXISTS pb_action ENUM('play', 'pause') DEFAULT 'play';
ALTER TABLE watch_parties ADD COLUMN IF NOT EXISTS pb_time FLOAT DEFAULT 0;
ALTER TABLE watch_parties ADD COLUMN IF NOT EXISTS pb_video VARCHAR(100);
ALTER TABLE watch_parties ADD COLUMN IF NOT EXISTS pb_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Co-host: selain host utama, boleh mengendalikan playback
CREATE TABLE IF NOT EXISTS watch_party_hosts (
  id VARCHAR(36) PRIMARY KEY,
  watch_party_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_party_host (watch_party_id, user_id),
  FOREIGN KEY (watch_party_id) REFERENCES watch_parties(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
