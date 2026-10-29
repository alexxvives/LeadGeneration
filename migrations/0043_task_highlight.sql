-- Highlighted tasks (red on the calendar): post-sale follow-ups computed from
-- the activation date. Additive only; existing rows default to 0.
ALTER TABLE tasks ADD COLUMN highlight INTEGER NOT NULL DEFAULT 0;
