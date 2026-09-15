-- Migrasi 004: nobar menyatu dengan voice channel (ala Discord) + soundboard
USE nobarly;

-- Party nobar bisa ditempel ke satu voice channel: yang join voice otomatis
-- nonton bareng + ngobrol di satu tempat.
ALTER TABLE watch_parties ADD COLUMN IF NOT EXISTS voice_channel_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_party_voice_channel ON watch_parties (voice_channel_id);

-- Event soundboard per voice channel (dipolling member, dimainkan lokal via WebAudio)
CREATE TABLE IF NOT EXISTS voice_sounds (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  username VARCHAR(50),
  sound VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_voice_sounds_channel ON voice_sounds (channel_id, created_at);
