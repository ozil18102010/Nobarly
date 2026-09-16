-- Nobarly Database Schema for MariaDB

CREATE DATABASE IF NOT EXISTS nobarly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nobarly;

-- Profiles (termasuk akun login)
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  avatar_url VARCHAR(500),
  last_seen TIMESTAMP NULL,
  bio VARCHAR(280),
  orbs INT DEFAULT 0,
  avatar_frame VARCHAR(24),
  banner VARCHAR(500),
  nameplate VARCHAR(500),
  status VARCHAR(12) DEFAULT 'online',
  oauth_provider VARCHAR(20),
  oauth_id VARCHAR(100),
  connections TEXT,
  last_checkin DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Communities
CREATE TABLE IF NOT EXISTS communities (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  game_category VARCHAR(50),
  owner_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Community Members
CREATE TABLE IF NOT EXISTS community_members (
  id VARCHAR(36) PRIMARY KEY,
  community_id VARCHAR(36),
  user_id VARCHAR(36),
  role VARCHAR(20) DEFAULT 'member',
  UNIQUE KEY unique_member (community_id, user_id),
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id VARCHAR(36) PRIMARY KEY,
  community_id VARCHAR(36),
  name VARCHAR(50) NOT NULL,
  type ENUM('text', 'voice') NOT NULL,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36),
  community_id VARCHAR(36),
  user_id VARCHAR(36),
  title VARCHAR(200) NOT NULL,
  content TEXT,
  upvotes INT DEFAULT 0,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post Votes
CREATE TABLE IF NOT EXISTS post_votes (
  id VARCHAR(36) PRIMARY KEY,
  post_id VARCHAR(36),
  user_id VARCHAR(36),
  vote_type INT NOT NULL,
  UNIQUE KEY unique_vote (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(36) PRIMARY KEY,
  post_id VARCHAR(36),
  user_id VARCHAR(36),
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Watch Parties
CREATE TABLE IF NOT EXISTS watch_parties (
  id VARCHAR(36) PRIMARY KEY,
  community_id VARCHAR(36),
  host_id VARCHAR(36),
  title VARCHAR(100) NOT NULL,
  stream_url VARCHAR(500),
  stream_type ENUM('youtube', 'twitch'),
  is_live BOOLEAN DEFAULT true,
  viewer_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (host_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Watch Chat
CREATE TABLE IF NOT EXISTS watch_chat (
  id VARCHAR(36) PRIMARY KEY,
  watch_party_id VARCHAR(36),
  user_id VARCHAR(36),
  username VARCHAR(50),
  message TEXT,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watch_party_id) REFERENCES watch_parties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Voice Sessions
CREATE TABLE IF NOT EXISTS voice_sessions (
  id VARCHAR(36) PRIMARY KEY,
  community_id VARCHAR(36),
  channel_id VARCHAR(36),
  user_id VARCHAR(36),
  peer_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  is_muted BOOLEAN DEFAULT false,
  is_video BOOLEAN DEFAULT false,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrasi 002: chat channel, teman, DM, linimasa, debat, reaksi & momen nobar
-- Migrasi 002: fitur Discord (chat channel, teman, DM), X (linimasa),
-- Reddit (komentar bertingkat), dan khas Nobarly (debat, reaksi & momen nobar)

-- Obrolan real-time per text channel (ala Discord)
CREATE TABLE IF NOT EXISTS channel_messages (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  content TEXT,
  image_url VARCHAR(500),
  reply_to VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP NULL,
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
  reply_to VARCHAR(36),
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

-- Migrasi 003: sinkronisasi playback nobar + co-host streamer

-- State playback terakhir dari host/co-host (dibaca penonton untuk follow)
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

-- Migrasi 004: nobar + voice channel + soundboard
-- Migrasi 004: nobar menyatu dengan voice channel (ala Discord) + soundboard

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

-- Migrasi 005: laporan bug dari APK / web
CREATE TABLE IF NOT EXISTS bug_reports (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  username VARCHAR(50),
  title VARCHAR(200) DEFAULT 'Laporan Bug',
  message TEXT NOT NULL,
  page VARCHAR(200),
  app_version VARCHAR(20),
  device_info VARCHAR(1000),
  status ENUM('open', 'fixed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports (created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports (status);

-- Migrasi 007 (v2.0): presence + reply DM + antrean nobar
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
