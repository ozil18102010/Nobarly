-- Migrasi 002: fitur Discord (chat channel, teman, DM), X (linimasa),
-- Reddit (komentar bertingkat), dan khas Nobarly (debat, reaksi & momen nobar)
USE nobarly;

-- Obrolan real-time per text channel (ala Discord)
CREATE TABLE IF NOT EXISTS channel_messages (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  content TEXT,
  image_url VARCHAR(500),
  reply_to VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages (channel_id, created_at);

-- Reaksi emoji pada pesan channel
CREATE TABLE IF NOT EXISTS message_reactions (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pertemanan (ala Discord)
CREATE TABLE IF NOT EXISTS friends (
  id VARCHAR(36) PRIMARY KEY,
  requester_id VARCHAR(36) NOT NULL,
  addressee_id VARCHAR(36) NOT NULL,
  status ENUM('pending', 'accepted') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_friendship (requester_id, addressee_id),
  FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pesan langsung (DM) antar user
CREATE TABLE IF NOT EXISTS dm_messages (
  id VARCHAR(36) PRIMARY KEY,
  sender_id VARCHAR(36),
  receiver_id VARCHAR(36),
  content TEXT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_dm_pair ON dm_messages (sender_id, receiver_id, created_at);

-- Linimasa singkat (ala X): 280 karakter + gambar + repost
CREATE TABLE IF NOT EXISTS shouts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  content VARCHAR(280),
  image_url VARCHAR(500),
  repost_of VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (repost_of) REFERENCES shouts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_shouts_created ON shouts (created_at);

-- Like pada shout
CREATE TABLE IF NOT EXISTS shout_likes (
  id VARCHAR(36) PRIMARY KEY,
  shout_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_shout_like (shout_id, user_id),
  FOREIGN KEY (shout_id) REFERENCES shouts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Follow antar user (ala X)
CREATE TABLE IF NOT EXISTS follows (
  id VARCHAR(36) PRIMARY KEY,
  follower_id VARCHAR(36) NOT NULL,
  followed_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_follow (follower_id, followed_id),
  FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (followed_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arena Debat (khas Nobarly): PRO vs KONTRA + voting penonton
CREATE TABLE IF NOT EXISTS debates (
  id VARCHAR(36) PRIMARY KEY,
  community_id VARCHAR(36),
  host_id VARCHAR(36),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  side_a VARCHAR(100) NOT NULL DEFAULT 'PRO',
  side_b VARCHAR(100) NOT NULL DEFAULT 'KONTRA',
  status ENUM('open', 'live', 'closed') DEFAULT 'open',
  turn_seconds INT DEFAULT 120,
  current_side ENUM('A', 'B') DEFAULT 'A',
  turn_ends_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (host_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pembicara per sisi debat
CREATE TABLE IF NOT EXISTS debate_speakers (
  id VARCHAR(36) PRIMARY KEY,
  debate_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  side ENUM('A', 'B') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_speaker (debate_id, user_id),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vote penonton debat (satu vote per user, bisa pindah sisi)
CREATE TABLE IF NOT EXISTS debate_votes (
  id VARCHAR(36) PRIMARY KEY,
  debate_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  side ENUM('A', 'B') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_debate_vote (debate_id, user_id),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reaksi melayang saat nobar (khas Nobarly)
CREATE TABLE IF NOT EXISTS watch_reactions (
  id VARCHAR(36) PRIMARY KEY,
  watch_party_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watch_party_id) REFERENCES watch_parties(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_watch_reactions_party ON watch_reactions (watch_party_id, created_at);

-- Penanda momen/highlight saat nobar (buat streamer)
CREATE TABLE IF NOT EXISTS watch_moments (
  id VARCHAR(36) PRIMARY KEY,
  watch_party_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  username VARCHAR(50),
  label VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watch_party_id) REFERENCES watch_parties(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Komentar bertingkat (ala Reddit): parent reply
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36);
