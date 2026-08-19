-- Missed-call journal lines used the call-prefix shape (“…by {name}: ”)
-- even when there was no extra body. Drop a trailing colon (and spaces).

UPDATE leads
SET follow_ups = (
  SELECT COALESCE(
    json_group_array(
      CASE
        WHEN lower(trim(COALESCE(json_extract(j.value, '$.note'), '')))
               LIKE 'missed call by %'
         AND substr(rtrim(trim(json_extract(j.value, '$.note'))), -1) = ':'
        THEN json_set(
          json(j.value),
          '$.note',
          rtrim(rtrim(trim(json_extract(j.value, '$.note')), ':'), ' ')
        )
        ELSE json(j.value)
      END
      ORDER BY j.key
    ),
    '[]'
  )
  FROM json_each(leads.follow_ups) AS j
)
WHERE follow_ups LIKE '%Missed call by%';
