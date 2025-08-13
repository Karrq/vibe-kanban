-- Add autocontinue_enabled column to projects table
ALTER TABLE projects ADD COLUMN autocontinue_enabled BOOLEAN NOT NULL DEFAULT FALSE;