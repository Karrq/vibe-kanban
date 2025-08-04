# Fork Feature Implementation Plan

## Overview
Enable forking an attempt from any message in a conversation, creating a new attempt that continues from that exact point with the precise state at that moment.

## Architecture

### Checkpoint System
Automatic state capture after each state-mutating operation during conversation.

#### Storage
- Git refs: `refs/vk-checkpoints/{attempt_id}/msg-{index}`
- No database storage required
- Checkpoints persist with worktree (cleaned up together)
- Invisible to normal git operations

#### When to Checkpoint
- After state-mutating tools only: `write`, `edit`, `multiedit`, `bash`, `execute`, `todowrite`, etc.
- Skip read-only operations: `read`, `grep`, `ls`, `glob`
- Real-time during stream processing

#### Implementation

```rust
// backend/src/services/checkpoint_service.rs

pub struct CheckpointService {
    repo: Repository,              // Persistent repo connection
    temp_index: Index,            // Persistent temporary index (never touches worktree index)
    attempt_ref_prefix: String,   // Pre-formatted: "refs/vk-cp/{attempt_id_short}/m"
    checkpoint_index: usize,
    last_tree_oid: Option<Oid>,  // For skip detection
}

impl CheckpointService {
    pub fn new(worktree_path: &str, attempt_id: Uuid) -> Result<Self, git2::Error> {
        // Initialize with pre-populated temp index from HEAD
    }
    
    pub fn capture_checkpoint(&mut self) -> Result<(), git2::Error> {
        // CRITICAL SECTION (must be fast)
        self.temp_index.update_all(&["."], None)?;  // Update tracked files
        self.temp_index.add_all(&["."], ...)?;      // Add new files
        
        // NON-CRITICAL (state captured)
        let tree_id = self.temp_index.write_tree_to(&self.repo)?;
        
        // Skip if no changes
        if Some(tree_id) == self.last_tree_oid {
            return Ok(());
        }
        
        // Create checkpoint commit
        let checkpoint_ref = format!("{}{:04}", self.attempt_ref_prefix, self.checkpoint_index);
        self.repo.commit(
            Some(&checkpoint_ref),
            &sig,
            &sig,
            ".",  // Minimal message
            &tree,
            &[&parent],
        )?;
        
        self.checkpoint_index += 1;
        Ok(())
    }
}
```

#### Stream Integration

```rust
// During normalized log streaming
while let Some(entry) = parse_next_entry().await {
    // Checkpoint immediately on detecting mutation
    if let NormalizedEntryType::ToolUse { tool_name, .. } = &entry.entry_type {
        if is_state_mutating_tool(tool_name) {
            checkpoint_service.capture_checkpoint();
        }
    }
    
    yield Event::Entry(entry);
}
```

### Fork Feature

#### How It Works
1. User clicks "Fork" on message N in conversation
2. System finds **last available checkpoint at or before message N**
   - Checkpoints only exist after state-mutating operations
   - Many messages (reads, assistant responses) don't create checkpoints
   - Fork will use the most recent checkpoint ≤ N
3. Creates new worktree from checkpoint commit (exact state at checkpoint)
4. Creates new attempt with:
   - New worktree path
   - Same executor as original
   - Conversation context up to message N as initial prompt (includes messages after checkpoint)

#### Backend Implementation

```rust
// backend/src/routes/fork.rs

pub async fn fork_attempt_from_checkpoint(
    pool: &SqlitePool,
    original_attempt_id: Uuid,
    message_index: usize,
) -> Result<TaskAttempt, Error> {
    // Get original attempt
    let original = TaskAttempt::find_by_id(pool, original_attempt_id).await?;
    
    // Find last checkpoint at or before message_index
    let repo = Repository::open(&original.worktree_path)?;
    let checkpoint_commit = find_last_checkpoint_before(
        &repo,
        original_attempt_id,
        message_index
    )?;
    
    // Create fork branch from checkpoint
    let fork_branch = format!("{}-fork-{}", original.branch, message_index);
    repo.branch(&fork_branch, &checkpoint_commit, false)?;
    
    // Create new worktree with exact checkpoint state
    let fork_worktree_path = create_worktree(&fork_branch)?;
    
    // Extract conversation up to fork point
    let conversation_context = extract_conversation_up_to(
        pool,
        original_attempt_id,
        message_index
    ).await?;
    
    // Create new attempt
    let forked_attempt = TaskAttempt::create(
        pool,
        original.task_id,
        fork_worktree_path,
        fork_branch,
        original.executor.clone(),
    ).await?;
    
    // Start executor with conversation context
    start_executor_with_context(
        &forked_attempt,
        &conversation_context,
    ).await?;
    
    Ok(forked_attempt)
}

/// Find the last checkpoint at or before the given message index
fn find_last_checkpoint_before(
    repo: &Repository,
    attempt_id: Uuid,
    message_index: usize,
) -> Result<Commit, Error> {
    let prefix = format!("refs/vk-checkpoints/{}/msg-", attempt_id);
    
    // Try message_index and work backwards
    for idx in (0..=message_index).rev() {
        let checkpoint_ref = format!("{}{:04}", prefix, idx);
        if let Ok(reference) = repo.find_reference(&checkpoint_ref) {
            return Ok(reference.peel_to_commit()?);
        }
    }
    
    Err(Error::NoCheckpointFound)
}
```

#### API Endpoints

```rust
// List checkpoints for an attempt
GET /api/attempts/{attempt_id}/checkpoints
Response: [{
    message_index: 0,
    commit_sha: "abc123",
    timestamp: 1234567890
}, ...]

// Fork from checkpoint
POST /api/attempts/{attempt_id}/fork
Body: {
    message_index: 5,
    custom_prompt: "optional additional context"
}
Response: {
    new_attempt_id: "...",
    worktree_path: "...",
    branch: "original-branch-fork-5"
}
```

#### Frontend Implementation

```tsx
// Add fork button to each message in conversation
function ConversationMessage({ entry, messageIndex }) {
    const handleFork = async () => {
        const result = await api.forkAttempt(attemptId, messageIndex);
        // Navigate to new attempt
        navigate(`/attempts/${result.new_attempt_id}`);
    };
    
    return (
        <div className="message">
            {entry.content}
            <button onClick={handleFork} title="Fork from here">
                <ForkIcon />
            </button>
        </div>
    );
}
```

## Implementation Steps

1. **Phase 1: Checkpoint System**
   - [ ] Implement CheckpointService with persistent temp index
   - [ ] Integrate with stream processing for state-mutating tools
   - [ ] Add checkpoint listing API
   - [ ] Test checkpoint creation performance

2. **Phase 2: Fork Backend**
   - [ ] Implement fork API endpoint
   - [ ] Create worktree from checkpoint commit
   - [ ] Extract conversation context up to fork point
   - [ ] Initialize new attempt with context

3. **Phase 3: Fork Frontend**
   - [ ] Add fork buttons to conversation messages
   - [ ] Create fork confirmation dialog
   - [ ] Handle navigation to forked attempt
   - [ ] Show fork relationship in UI

## Important Notes

- **Checkpoint Granularity**: Since checkpoints only occur after state-mutating operations, forking from a read operation or assistant message will use the last mutation's state
- **Conversation Context**: The fork includes conversation up to the selected message, even if the checkpoint is earlier
- **Example**: If message 5 is a file write (checkpoint created) and message 6-8 are reads, forking from message 8 uses checkpoint 5's state but includes messages 1-8 as context

## Key Benefits

1. **Perfect State Restoration**: Fork gets exact state at checkpoint, with full conversation context
2. **Clean Git History**: Checkpoints in separate ref namespace
3. **No Index Pollution**: Using temp index preserves agent's workspace
4. **Efficient Storage**: Checkpoints cleaned up with worktree
5. **Simple Mental Model**: Fork = branch from conversation point

## Performance Considerations

- Checkpoint capture: ~10-50ms (mostly file I/O)
- Critical section: Just `update_all` + `add_all`
- Start simple, optimize only if profiling shows issues
- Consider async commit phase if tree creation is slow

## Future Enhancements

- Checkpoint visualization in UI
- Bulk fork operations
- Checkpoint diffing tool
- Fork ancestry tracking