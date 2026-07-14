-- Migration 0005: CRM relationship stage fields on leads.
-- Adds user-managed CRM tracking separate from the email-workflow status.
-- crm_stage: New / Contacted / In Conversation / Closed / Not Interested
-- contact_method: how the lead was first reached (email / phone / contact_form)
-- notes: freeform per-lead notes
-- follow_ups: JSON array of { id, date, note, done } follow-up reminders

ALTER TABLE leads ADD COLUMN crm_stage TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN contact_method TEXT;
ALTER TABLE leads ADD COLUMN notes TEXT;
ALTER TABLE leads ADD COLUMN follow_ups TEXT NOT NULL DEFAULT '[]';
