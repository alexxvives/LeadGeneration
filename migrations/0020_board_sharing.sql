-- Board sharing: members, email invites, soft presence locks (ADR 0015).

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members (user_id);

CREATE TABLE IF NOT EXISTS board_invites (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_invites_email ON board_invites (email, status);

CREATE TABLE IF NOT EXISTS board_locks (
  board_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  locked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
