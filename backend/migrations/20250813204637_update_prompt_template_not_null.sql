-- First set a default value for any NULL prompt_template values
UPDATE projects 
SET prompt_template = 'project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION'
WHERE prompt_template IS NULL;

-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
-- Create a new table with the correct schema
CREATE TABLE projects_new (
    id BLOB PRIMARY KEY,
    name TEXT NOT NULL,
    git_repo_path TEXT NOT NULL DEFAULT '' UNIQUE,
    setup_script TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    dev_script TEXT DEFAULT '',
    cleanup_script TEXT,
    executor_env_script TEXT,
    prompt_template TEXT NOT NULL DEFAULT 'project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION'
);

-- Copy data from old table to new table
INSERT INTO projects_new (id, name, git_repo_path, setup_script, created_at, updated_at,
                          dev_script, cleanup_script, executor_env_script, prompt_template)
SELECT id, name, git_repo_path, setup_script, created_at, updated_at,
       dev_script, cleanup_script, executor_env_script, 
       COALESCE(prompt_template, 'project_id: $VK_PROJECT_ID

Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION')
FROM projects;

-- Drop the old table
DROP TABLE projects;

-- Rename the new table to the original name
ALTER TABLE projects_new RENAME TO projects;
