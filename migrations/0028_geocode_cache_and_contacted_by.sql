-- Durable Nominatim/Photon geocode cache (survives Worker isolate recycles)
-- + who first contacted a lead (shared-board attribution).

CREATE TABLE IF NOT EXISTS geocode_cache (
  query      TEXT PRIMARY KEY,
  lat        REAL,
  lng        REAL,
  found      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

ALTER TABLE leads ADD COLUMN contacted_by_user_id TEXT;
ALTER TABLE leads ADD COLUMN contacted_by_name TEXT;
