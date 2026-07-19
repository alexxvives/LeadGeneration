-- Free-text company / venue type (e.g. Pharmacy, Aesthetic Clinic).
-- Populated from Excel import aliases or keyword suggestion on enrich.
ALTER TABLE leads ADD COLUMN company_type TEXT;
