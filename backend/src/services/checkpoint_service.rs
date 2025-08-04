use git2::{Oid, Repository, Signature};
use std::sync::Mutex;
use tracing::{debug, info};
use uuid::Uuid;

#[derive(Debug)]
pub enum CheckpointError {
    Git(git2::Error),
    InvalidRepository(String),
}

impl std::fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CheckpointError::Git(e) => write!(f, "Git error: {}", e),
            CheckpointError::InvalidRepository(e) => write!(f, "Invalid repository: {}", e),
        }
    }
}

impl std::error::Error for CheckpointError {}

impl From<git2::Error> for CheckpointError {
    fn from(err: git2::Error) -> Self {
        CheckpointError::Git(err)
    }
}

/// Data needed to create a checkpoint commit asynchronously
#[derive(Clone)]
pub struct CheckpointCommitData {
    pub worktree_path: String,
    pub tree_oid: Oid,
    pub parent_oid: Oid,
    pub checkpoint_ref: String,
    pub message_index: usize,
}

/// Service for capturing git worktree checkpoints during execution
pub struct CheckpointService {
    worktree_path: String,
    attempt_ref_prefix: String,
    last_tree_oid: Mutex<Option<Oid>>,
}

impl CheckpointService {
    /// Create a new CheckpointService for a worktree
    pub fn new(worktree_path: &str, attempt_id: Uuid) -> Result<Self, CheckpointError> {
        // Verify the repository exists
        let _repo = Repository::open(worktree_path)?;
        
        // Format the ref prefix for this attempt
        let attempt_id_short = attempt_id.to_string().split('-').next().unwrap_or("unknown").to_string();
        let attempt_ref_prefix = format!("refs/vk-checkpoints/{}/msg-", attempt_id_short);
        
        info!(
            "Initialized CheckpointService for attempt {} at {}",
            attempt_id_short, worktree_path
        );
        
        Ok(Self {
            worktree_path: worktree_path.to_string(),
            attempt_ref_prefix,
            last_tree_oid: Mutex::new(None),
        })
    }
    
    /// Capture checkpoint state synchronously and return data for async commit
    pub fn capture_checkpoint_state(&self, message_index: usize) -> Result<Option<CheckpointCommitData>, CheckpointError> {
        let start = std::time::Instant::now();
        
        // Do all git operations in a sync block to avoid Send issues
        let (tree_oid, parent_oid) = {
            // Open the repository
            let repo = Repository::open(&self.worktree_path)?;
            
            // Get HEAD info
            let head = repo.head()?;
            let head_tree = head.peel_to_tree()?;
            let parent_oid = head.peel_to_commit()?.id();
            
            // Create a new in-memory index, pre-populated from HEAD
            let mut temp_index = git2::Index::new()?;
            temp_index.read_tree(&head_tree)?;
            
            // CRITICAL SECTION - must be fast and synchronous
            // Update the temp index with all changes from the worktree
            temp_index.update_all(&["."], None)?;
            
            // Add any new untracked files
            let mut add_opts = git2::IndexAddOption::DEFAULT;
            add_opts.insert(git2::IndexAddOption::CHECK_PATHSPEC);
            temp_index.add_all(&["."], add_opts, None)?;
            
            // Write the index to a tree object
            let tree_oid = temp_index.write_tree_to(&repo)?;
            
            (tree_oid, parent_oid)
        };
        
        // Check if tree has changed
        let mut last_tree_oid = self.last_tree_oid.lock().unwrap();
        if Some(tree_oid) == *last_tree_oid {
            debug!("Skipping checkpoint - no changes detected");
            return Ok(None);
        }
        
        // Update last tree oid
        *last_tree_oid = Some(tree_oid);
        
        // Create checkpoint reference name using message index
        let checkpoint_ref = format!("{}{}", self.attempt_ref_prefix, message_index);
        
        let elapsed = start.elapsed();
        debug!(
            "Captured checkpoint state for message {} in {:.2}ms",
            message_index,
            elapsed.as_secs_f64() * 1000.0
        );
        
        // Return data for async commit
        Ok(Some(CheckpointCommitData {
            worktree_path: self.worktree_path.clone(),
            tree_oid,
            parent_oid,
            checkpoint_ref,
            message_index,
        }))
    }
    
    /// Create a checkpoint commit asynchronously (non-critical section)
    pub async fn create_checkpoint_commit(data: CheckpointCommitData) -> Result<(), CheckpointError> {
        tokio::task::spawn_blocking(move || {
            let start = std::time::Instant::now();
            
            // Open repository
            let repo = Repository::open(&data.worktree_path)?;
            
            // Get the tree object
            let tree = repo.find_tree(data.tree_oid)?;
            
            // Get parent commit
            let parent_commit = repo.find_commit(data.parent_oid)?;
            
            // Create a minimal signature
            let sig = Signature::now("vibe-kanban", "checkpoint@vibe-kanban.local")?;
            
            // Create the checkpoint commit
            let _commit_oid = repo.commit(
                Some(&data.checkpoint_ref),
                &sig,
                &sig,
                ".",  // Minimal commit message
                &tree,
                &[&parent_commit],
            )?;
            
            let elapsed = start.elapsed();
            info!(
                "Created checkpoint commit for message {} at {} ({:.2}ms)",
                data.message_index,
                &data.checkpoint_ref,
                elapsed.as_secs_f64() * 1000.0
            );
            
            Ok::<(), CheckpointError>(())
        })
        .await
        .map_err(|e| CheckpointError::InvalidRepository(format!("Failed to spawn blocking task: {}", e)))?
    }
    
    
    /// List all checkpoints for this attempt
    pub fn list_checkpoints(&self) -> Result<Vec<CheckpointInfo>, CheckpointError> {
        let mut checkpoints = Vec::new();
        
        // Open the repository
        let repo = Repository::open(&self.worktree_path)?;
        
        // Iterate through all refs matching our prefix
        repo.references_glob(&format!("{}*", self.attempt_ref_prefix))?
            .filter_map(Result::ok)
            .for_each(|reference| {
                if let Ok(commit) = reference.peel_to_commit() {
                    // Extract message index from ref name
                    if let Some(ref_name) = reference.name() {
                        if let Some(index_str) = ref_name.strip_prefix(&self.attempt_ref_prefix) {
                            if let Ok(index) = index_str.parse::<usize>() {
                                checkpoints.push(CheckpointInfo {
                                    message_index: index,
                                    commit_sha: commit.id().to_string(),
                                    timestamp: commit.time().seconds(),
                                });
                            }
                        }
                    }
                }
            });
        
        // Sort by message index
        checkpoints.sort_by_key(|c| c.message_index);
        
        Ok(checkpoints)
    }
}

/// Information about a checkpoint
#[derive(Debug, Clone)]
pub struct CheckpointInfo {
    pub message_index: usize,
    pub commit_sha: String,
    pub timestamp: i64,
}

/// Determines if a tool name represents a state-mutating operation
pub fn is_state_mutating_tool(tool_name: &str) -> bool {
    matches!(
        tool_name.to_lowercase().as_str(),
        "write" | "edit" | "multiedit" | "bash" | "execute" | "todowrite" | 
        "file_write" | "file_edit" | "command_run" | "shell" | "run"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_is_state_mutating_tool() {
        // Mutating tools
        assert!(is_state_mutating_tool("write"));
        assert!(is_state_mutating_tool("Edit"));
        assert!(is_state_mutating_tool("MultiEdit"));
        assert!(is_state_mutating_tool("bash"));
        assert!(is_state_mutating_tool("execute"));
        assert!(is_state_mutating_tool("TodoWrite"));
        
        // Non-mutating tools
        assert!(!is_state_mutating_tool("read"));
        assert!(!is_state_mutating_tool("grep"));
        assert!(!is_state_mutating_tool("ls"));
        assert!(!is_state_mutating_tool("glob"));
        assert!(!is_state_mutating_tool("search"));
    }
}