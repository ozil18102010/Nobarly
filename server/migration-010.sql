-- Migrasi 010: label edit pesan channel
USE nobarly;

ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL;
