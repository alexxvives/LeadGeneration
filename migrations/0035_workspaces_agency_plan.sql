-- Gift every existing workspace Agency (current public top tier).
-- One-shot grant for all current accounts; new signups still start on free.

UPDATE workspaces SET plan_id = 'agency' WHERE plan_id != 'agency';
