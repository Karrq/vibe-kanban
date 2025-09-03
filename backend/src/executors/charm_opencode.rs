use async_trait::async_trait;
use uuid::Uuid;

use super::prompt_utils;
use crate::{
    command_runner::{CommandProcess, CommandRunner},
    executor::{Executor, ExecutorError},
    models::{project::Project, task::Task},
    utils::shell::get_shell_command,
};

/// An executor that uses OpenCode to process tasks
pub struct CharmOpencodeExecutor;

#[async_trait]
impl Executor for CharmOpencodeExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        // Get the project to fetch the prompt template
        let project = Project::find_by_id(pool, task.project_id).await?.ok_or(
            ExecutorError::ContextCollectionFailed("Project not found".to_string()),
        )?;

        let prompt = prompt_utils::build_task_prompt(&project, &task);

        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = format!(
            "opencode -p \"{}\" --output-format=json",
            prompt.replace('"', "\\\"")
        );

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&opencode_command)
            .working_dir(worktree_path);

        let proc = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "CharmOpenCode")
                .with_task(task_id, Some(task.title.clone()))
                .with_context("CharmOpenCode CLI execution for new task")
                .spawn_error(e)
        })?;

        Ok(proc)
    }

    async fn spawn_followup(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        session_id: &str,
        prompt: &str,
        worktree_path: &str,
    ) -> Result<CommandProcess, ExecutorError> {
        // CharmOpencode doesn't support session-based followup
        // When session_id is empty (restart_session=true), use the full task prompt
        // Otherwise use the followup prompt
        let input_prompt = if session_id.is_empty() {
            // Get the task and project to build the full prompt
            let task = Task::find_by_id(pool, task_id)
                .await?
                .ok_or(ExecutorError::TaskNotFound)?;
            let project = Project::find_by_id(pool, task.project_id).await?.ok_or(
                ExecutorError::ContextCollectionFailed("Project not found".to_string()),
            )?;
            prompt_utils::build_task_prompt(&project, &task)
        } else {
            prompt.to_string()
        };
        
        let (shell_cmd, shell_arg) = get_shell_command();
        let opencode_command = format!(
            "opencode -p \"{}\" --output-format=json",
            input_prompt.replace('"', "\\\"")
        );

        let mut command = CommandRunner::new();
        command
            .command(shell_cmd)
            .arg(shell_arg)
            .arg(&opencode_command)
            .working_dir(worktree_path);

        let proc = command.start().await.map_err(|e| {
            crate::executor::SpawnContext::from_command(&command, "CharmOpenCode")
                .with_context("CharmOpenCode CLI followup execution")
                .spawn_error(e)
        })?;

        Ok(proc)
    }
}
