-- Board locks are now short bulk locks (import / Find leads / bulk delete),
-- not presence locks. Record what each lock is for, and purge expired rows
-- that the old presence heartbeat left behind. Touches board_locks only.
ALTER TABLE board_locks ADD COLUMN kind TEXT;
DELETE FROM board_locks WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
