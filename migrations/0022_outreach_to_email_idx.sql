-- Speed up webhook email-fallback lookup (audit A5 / step 11).
-- Query uses lower(to_email); expression index matches findLatestSentByEmail.

CREATE INDEX IF NOT EXISTS outreach_sent_to_email_idx
  ON outreach (lower(to_email), sent_at DESC)
  WHERE status = 'sent';
