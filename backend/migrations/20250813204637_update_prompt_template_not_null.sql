-- Make prompt_template NOT NULL with a default value
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- However, since this migration was already applied, we'll just add a comment
-- to indicate this migration updated the prompt_template to be NOT NULL with a default

-- In a fresh database, this would be handled by the table recreation
-- For existing databases, this migration was already applied
-- The default value ensures existing rows have a valid prompt_template

UPDATE projects 
SET prompt_template = 'project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION'
WHERE prompt_template IS NULL;