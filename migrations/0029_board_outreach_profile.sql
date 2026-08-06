-- Each board links to one outreach profile (pitch + Easy From/keys).
-- Null = fall back to workspace active profile at send/draft time.

ALTER TABLE boards ADD COLUMN outreach_profile_id TEXT;
