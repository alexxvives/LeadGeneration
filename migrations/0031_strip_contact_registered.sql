-- Drop legacy “Contact registered” journal lines (empty-channel fallback).
-- Notes were exactly that text, optionally “ — {name}”.

UPDATE leads
SET follow_ups = (
  SELECT COALESCE(
    json_group_array(json(j.value) ORDER BY j.key),
    '[]'
  )
  FROM json_each(leads.follow_ups) AS j
  WHERE lower(trim(COALESCE(json_extract(j.value, '$.note'), '')))
    NOT LIKE 'contact registered%'
)
WHERE follow_ups LIKE '%Contact registered%';
