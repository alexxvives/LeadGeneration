-- Post-send delivery outcome stub (manual UI today; webhooks later).
ALTER TABLE outreach ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'unknown';
