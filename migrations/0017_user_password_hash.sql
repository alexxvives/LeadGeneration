-- Per-user password login (Auth.js users table).
-- Magic link remains for forgot-password / existing email-only users.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN password_hash TEXT;
