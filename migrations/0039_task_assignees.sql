-- Multiple assignees per task (JSON array); owner_* mirrors first assignee.
ALTER TABLE tasks ADD COLUMN assignees_json TEXT NOT NULL DEFAULT '[]';
