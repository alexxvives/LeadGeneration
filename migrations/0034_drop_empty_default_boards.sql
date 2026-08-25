-- ADR 0023: leftover Default boards are clutter. Clear is_default on every
-- board, then delete empty boards named "Default" (no leads, no runs).
-- Boards named Default that still have leads stay as ordinary boards.

PRAGMA foreign_keys = ON;

UPDATE boards SET is_default = 0 WHERE is_default = 1;

DELETE FROM board_members
WHERE board_id IN (
  SELECT b.id FROM boards b
  WHERE lower(trim(b.name)) = 'default'
    AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.board_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.board_id = b.id)
);

DELETE FROM board_invites
WHERE board_id IN (
  SELECT b.id FROM boards b
  WHERE lower(trim(b.name)) = 'default'
    AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.board_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.board_id = b.id)
);

DELETE FROM board_locks
WHERE board_id IN (
  SELECT b.id FROM boards b
  WHERE lower(trim(b.name)) = 'default'
    AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.board_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.board_id = b.id)
);

DELETE FROM boards
WHERE lower(trim(name)) = 'default'
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.board_id = boards.id)
  AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.board_id = boards.id);
