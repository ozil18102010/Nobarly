-- Migrasi 005: laporan bug dari APK / web (biar gampang fix bareng teman)
USE nobarly;

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
