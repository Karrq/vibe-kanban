use crate::models::{project::Project, task::Task};

/// Process a prompt template, replacing variables with actual values
pub fn process_prompt_template(
    template: &str,
    project: &Project,
    task: &Task,
) -> String {
    template
        .replace("$VK_PROJECT_ID", &project.id.to_string())
        .replace("$VK_PROJECT_NAME", &project.name)
        .replace("$VK_TASK_ID", &task.id.to_string())
        .replace("$VK_TASK_TITLE", &task.title)
        .replace("$VK_TASK_DESCRIPTION", task.description.as_deref().unwrap_or(""))
}

/// Build a prompt for a task using the project's template
pub fn build_task_prompt(project: &Project, task: &Task) -> String {
    // Use the project's template (which is now always set, even if empty)
    let template = if project.prompt_template.is_empty() {
        // If the user explicitly cleared the template, return empty string
        String::new()
    } else {
        process_prompt_template(&project.prompt_template, project, task)
    };
    
    // Handle case where task has no description
    if task.description.is_none() && !template.is_empty() {
        // Remove the description line if it's empty
        template.lines()
            .filter(|line| !line.contains("Task description:") || !line.trim_end().ends_with(":"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        template
    }
}