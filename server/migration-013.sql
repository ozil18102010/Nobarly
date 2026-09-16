-- Migrasi 013: hapus server_tag (fitur badge dihapus permanen)
USE nobarly;

ALTER TABLE profiles DROP COLUMN server_tag;
