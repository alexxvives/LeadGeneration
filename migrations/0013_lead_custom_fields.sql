-- Per-lead custom table column values (JSON object: columnId → string).
ALTER TABLE leads ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}';
