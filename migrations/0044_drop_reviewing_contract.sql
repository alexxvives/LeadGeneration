-- "Reviewing contract" pipeline step removed: move its leads to the preceding
-- step (evaluating_post_demo). Only the step value changes; nothing is deleted.
UPDATE leads SET conversation_step = 'evaluating_post_demo'
WHERE conversation_step = 'reviewing_contract';
