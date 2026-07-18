-- Platform admin role on Auth.js users (replaces ADMIN_EMAIL / ADMIN_PASSWORD env).
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
