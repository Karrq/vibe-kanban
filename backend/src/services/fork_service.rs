use git2::{Oid, Repository, WorktreeAddOptions};
use sqlx::SqlitePool;
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::{
    executor::NormalizedEntry,
    models::execution_process::{ExecutionProcess, ExecutionProcessType},
    services::checkpoint_service::CheckpointInfo,
};

#[derive(Debug)]
pub enum ForkServiceError {
    Git(git2::Error),
    Database(sqlx::Error),
    InvalidRepository(String),
    CheckpointNotFound(String),
    ConversationExtractionFailed(String),
}

impl std::fmt::Display for ForkServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ForkServiceError::Git(e) => write!(f, "Git error: {}", e),
            ForkServiceError::Database(e) => write!(f, "Database error: {}", e),
            ForkServiceError::InvalidRepository(e) => write!(f, "Invalid repository: {}", e),
            ForkServiceError::CheckpointNotFound(e) => write!(f, "Checkpoint not found: {}", e),
            ForkServiceError::ConversationExtractionFailed(e) => {
                write!(f, "Failed to extract conversation: {}", e)
            }
        }
    }
}

impl std::error::Error for ForkServiceError {}

impl From<git2::Error> for ForkServiceError {
    fn from(err: git2::Error) -> Self {
        ForkServiceError::Git(err)
    }
}

impl From<sqlx::Error> for ForkServiceError {
    fn from(err: sqlx::Error) -> Self {
        ForkServiceError::Database(err)
    }
}

/// Service for handling fork operations with checkpoints
pub struct ForkService {
    worktree_path: String,
    attempt_id: Uuid,
    attempt_id_short: String,
}

impl ForkService {
    /// Create a new ForkService for a worktree
    pub fn new(worktree_path: &str, attempt_id: Uuid) -> Result<Self, ForkServiceError> {
        // Verify the repository exists
        let _repo = Repository::open(worktree_path)?;

        // Format the short attempt ID for checkpoint references
        let attempt_id_short = attempt_id
            .to_string()
            .split('-')
            .next()
            .unwrap_or("unknown")
            .to_string();

        info!(
            "Initialized ForkService for attempt {} at {}",
            attempt_id_short, worktree_path
        );

        Ok(Self {
            worktree_path: worktree_path.to_string(),
            attempt_id,
            attempt_id_short,
        })
    }

    /// Create a [`CheckpointInfo`] targetin the given branch
    pub fn checkpoint_from_branch(
        &self,
        branch_name: &str,
    ) -> Result<CheckpointInfo, ForkServiceError> {
        let repo = Repository::open(&self.worktree_path)?;

        // Get base branch commit
        let target_branch = repo
            .find_branch(&branch_name, git2::BranchType::Local)
            .map_err(|_| ForkServiceError::CheckpointNotFound(branch_name.to_string()))?;
        let target_commit = target_branch.get().peel_to_commit()?;

        Ok(CheckpointInfo {
            message_index: 0,
            commit_sha: target_commit.id().to_string(),
            timestamp: target_commit.time().seconds(),
            executor_id: String::from("branch"),  // Special indicator for branch-based checkpoint
        })
    }

    /// Find the last checkpoint at or before the given message index for a specific execution process
    pub fn find_last_checkpoint_before(
        &self,
        execution_process_id: Uuid,
        message_index: usize,
    ) -> Result<Option<CheckpointInfo>, ForkServiceError> {
        let repo = Repository::open(&self.worktree_path)?;

        // Get the short exec ID to match the checkpoint ref format
        let exec_id_short = execution_process_id.to_string().split('-').next().unwrap_or("unknown").to_string();
        
        // Search in the specific execution process's checkpoint namespace
        // Pattern: refs/vk-checkpoints/{attempt_id_short}/{exec_id_short}/msg-*
        let glob_pattern = format!("refs/vk-checkpoints/{}/{}/msg-*", self.attempt_id_short, exec_id_short);
        
        let best_checkpoint = repo.references_glob(&glob_pattern)?
            .filter_map(Result::ok)
            .filter_map(|reference| {
                let commit = reference.peel_to_commit().ok()?;
                let ref_name = reference.name()?;
                
                // Get the message index from the last part (msg-{index})
                let msg_part = ref_name.split('/').last()?;
                let index_str = msg_part.strip_prefix("msg-")?;
                let index = index_str.parse::<usize>().ok()?;
                
                // Only consider checkpoints at or before the requested index
                if index <= message_index {
                    Some(CheckpointInfo {
                        message_index: index,
                        commit_sha: commit.id().to_string(),
                        timestamp: commit.time().seconds(),
                        executor_id: exec_id_short.clone(),
                    })
                } else {
                    None
                }
            })
            .max_by_key(|checkpoint| checkpoint.message_index);

        if let Some(ref checkpoint) = best_checkpoint {
            debug!(
                "Found checkpoint at message {} for fork request at message {}",
                checkpoint.message_index, message_index
            );
        } else {
            debug!("No checkpoint found at or before message {}", message_index);
        }

        Ok(best_checkpoint)
    }

    /// Extract conversation entries up to and including the specified message index
    pub async fn extract_conversation_up_to(
        &self,
        db_pool: &SqlitePool,
        message_index: usize,
    ) -> Result<Vec<NormalizedEntry>, ForkServiceError> {
        // Get all execution processes for this attempt
        let processes = ExecutionProcess::find_by_task_attempt_id(db_pool, self.attempt_id).await?;

        // Sort processes by created_at to ensure correct order
        let mut sorted_processes = processes;
        sorted_processes.sort_by_key(|p| p.created_at);

        let mut all_entries = Vec::new();
        let mut current_index = 0;

        // Process each execution in order
        for process in sorted_processes {
            // Skip non-executor processes (setup scripts, dev servers, etc.)
            if process.process_type != ExecutionProcessType::CodingAgent {
                continue;
            }

            // Get normalized conversation for this process
            if let Some(stdout) = &process.stdout {
                if !stdout.trim().is_empty() {
                    // Parse executor type and create executor
                    let executor_type = process.executor_type.as_deref().unwrap_or("unknown");

                    use crate::executor::ExecutorConfig;
                    let executor_config = match executor_type.to_string().parse::<ExecutorConfig>()
                    {
                        Ok(config) => config,
                        Err(_) => {
                            error!("Failed to parse executor type: {}", executor_type);
                            continue;
                        }
                    };

                    let executor = executor_config.create_executor();
                    let working_dir_path = match std::fs::canonicalize(&process.working_directory) {
                        Ok(canonical_path) => canonical_path.to_string_lossy().to_string(),
                        Err(_) => process.working_directory.clone(),
                    };

                    // Normalize logs and add entries
                    if let Ok(normalized) = executor.normalize_logs(stdout, &working_dir_path) {
                        for entry in normalized.entries {
                            if current_index <= message_index {
                                all_entries.push(entry);
                                current_index += 1;
                            } else {
                                // We've reached the target message index
                                break;
                            }
                        }
                    }
                }
            }

            // Stop if we've collected enough entries
            if current_index > message_index {
                break;
            }
        }

        info!(
            "Extracted {} conversation entries up to message index {}",
            all_entries.len(),
            message_index
        );

        Ok(all_entries)
    }

    /// Extract truncated raw output up to and including the specified message index
    /// This preserves the executor's native format for proper conversation continuation
    pub async fn extract_truncated_output(
        &self,
        db_pool: &SqlitePool,
        message_index: usize,
        executor_type: &str,
    ) -> Result<String, ForkServiceError> {
        use crate::executor::ExecutorConfig;

        // Get all execution processes for this attempt
        let processes = ExecutionProcess::find_by_task_attempt_id(db_pool, self.attempt_id).await?;

        // Sort processes by created_at to ensure correct order
        let mut sorted_processes = processes;
        sorted_processes.sort_by_key(|p| p.created_at);

        // Parse executor type and create executor
        let executor_config = match executor_type.to_string().parse::<ExecutorConfig>() {
            Ok(config) => config,
            Err(_) => {
                error!("Failed to parse executor type: {}", executor_type);
                return Err(ForkServiceError::ConversationExtractionFailed(format!(
                    "Invalid executor type: {}",
                    executor_type
                )));
            }
        };

        let executor = executor_config.create_executor();

        // Collect all raw outputs from coding agent processes
        let mut combined_output = Vec::new();
        let mut messages_remaining = message_index + 1; // +1 because we want to include the message at message_index

        for process in sorted_processes {
            // Skip non-executor processes
            if process.process_type != ExecutionProcessType::CodingAgent {
                continue;
            }

            if let Some(stdout) = &process.stdout {
                if !stdout.trim().is_empty() {
                    if messages_remaining == 0 {
                        break; // We've already collected enough messages
                    }

                    // Truncate this process's output to include only the messages we need
                    // truncate_output will return the actual number of messages included
                    let (truncated, messages_included) = executor
                        .truncate_output(
                            stdout,
                            messages_remaining.saturating_sub(1), // -1 because truncate_output is 0-indexed
                            &self.worktree_path,
                        )
                        .map_err(|e| {
                            ForkServiceError::ConversationExtractionFailed(format!(
                                "Failed to truncate output: {}",
                                e
                            ))
                        })?;

                    if messages_included > 0 {
                        combined_output.push(truncated);
                        messages_remaining = messages_remaining.saturating_sub(messages_included);
                    }

                    if messages_remaining == 0 {
                        break; // We've collected all needed messages
                    }
                }
            }
        }

        // Combine all outputs with newlines between them
        let final_output = combined_output.join("\n");

        info!(
            "Extracted truncated output up to message index {} for executor {} (combined {} processes, {} messages remaining)",
            message_index,
            executor_type,
            combined_output.len(),
            messages_remaining
        );

        Ok(final_output)
    }

    /// Create a new worktree from a checkpoint commit
    pub fn create_forked_worktree(
        &self,
        main_repo_path: &str,
        checkpoint: &CheckpointInfo,
        new_branch_name: &str,
        new_worktree_path: &str,
    ) -> Result<(), ForkServiceError> {
        // Open the main repository, not the worktree
        let repo = Repository::open(main_repo_path)?;

        // Find the checkpoint commit
        let commit_oid = Oid::from_str(&checkpoint.commit_sha)?;
        let commit = repo.find_commit(commit_oid)?;

        // Create a new branch at the checkpoint commit
        let new_branch = repo
            .branch(new_branch_name, &commit, true)?
            .into_reference();

        // Create worktree for the new branch
        let mut worktree_opts = WorktreeAddOptions::new();
        worktree_opts.reference(Some(&new_branch));

        let _worktree = repo.worktree(
            new_branch_name,
            std::path::Path::new(new_worktree_path),
            Some(&worktree_opts),
        )?;

        info!(
            "Created forked worktree at {} from checkpoint at message {}",
            new_worktree_path, checkpoint.message_index
        );

        Ok(())
    }
}
