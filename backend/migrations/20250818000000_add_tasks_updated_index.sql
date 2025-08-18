-- Add index to tasks table for efficient recent tasks query
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);