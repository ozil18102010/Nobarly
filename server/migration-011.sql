-- Migrasi 011: banner boleh berupa foto (URL upload)
USE nobarly;

ALTER TABLE profiles MODIFY COLUMN banner VARCHAR(500);
