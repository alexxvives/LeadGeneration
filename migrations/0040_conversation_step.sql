-- Where an in-conversation lead sits (Evaluating, demo, contract, …).
-- Unresponsive is derived, not stored. conversation_step_at is the local
-- date the step was last set so a manual move resets the 14-day clock.
ALTER TABLE leads ADD COLUMN conversation_step TEXT;
ALTER TABLE leads ADD COLUMN conversation_step_at TEXT;
