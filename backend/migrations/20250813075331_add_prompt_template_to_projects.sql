-- Add prompt_template field to projects table
ALTER TABLE projects ADD COLUMN prompt_template TEXT;

-- Set default template for existing projects
UPDATE projects 
SET prompt_template = 'project_id: $VK_PROJECT_ID
            
Task title: $VK_TASK_TITLE
Task description: $VK_TASK_DESCRIPTION'
WHERE prompt_template IS NULL;