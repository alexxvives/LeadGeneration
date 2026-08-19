-- Bounce used to mark delivery_status without deleting the address.
-- Strip the bounced recipient from lead.emails, then point to_email at any
-- remaining address (or NULL). Safe to re-run.

UPDATE leads
SET emails = (
  SELECT COALESCE(
    json_group_array(j.value ORDER BY j.key),
    '[]'
  )
  FROM json_each(
    CASE
      WHEN leads.emails IS NULL OR trim(leads.emails) IN ('', 'null') THEN '[]'
      ELSE leads.emails
    END
  ) AS j
  WHERE lower(trim(replace(j.value, '%20', ' '))) NOT IN (
    SELECT lower(trim(replace(o.to_email, '%20', ' ')))
    FROM outreach o
    WHERE o.lead_id = leads.id
      AND o.delivery_status = 'bounced'
      AND trim(coalesce(o.to_email, '')) != ''
  )
)
WHERE id IN (
  SELECT DISTINCT l.id
  FROM leads l
  INNER JOIN outreach o ON o.lead_id = l.id
  WHERE o.delivery_status = 'bounced'
);

UPDATE outreach
SET to_email = (
  SELECT CASE
    WHEN l.emails IS NULL OR trim(l.emails) IN ('', '[]', 'null') THEN NULL
    ELSE json_extract(l.emails, '$[0]')
  END
  FROM leads l
  WHERE l.id = outreach.lead_id
)
WHERE delivery_status = 'bounced';
