# Checkpoint Feature Implementation Plan

## Overview
This document outlines the implementation plan for the checkpoint system in Vibe Kanban, which enables forking an attempt from any message in a conversation, creating a new attempt that continues from that exact point with the precise state at that moment.

## Architecture Summary

### Checkpoint System
- Automatic state capture after each state-mutating operation during conversation
- Git refs storage: `refs/vk-checkpoints/{attempt_id}/msg-{index}`
- No database storage required - checkpoints persist with worktree
- Real-time checkpoint creation during stream processing

### Fork Feature
- User clicks "Fork" on any message in conversation
- System finds last available checkpoint at or before message N
- Creates new worktree from checkpoint commit
- Includes conversation context up to selected message

## Phase 1: Backend Checkpoint Infrastructure

### 1.1 Create Checkpoint Service (`backend/src/services/checkpoint_service.rs`)
- **Purpose**: Capture git worktree state after state-mutating operations
- **Key Components**:
  - `CheckpointService` struct with synchronous state tracking (uses `std::sync::Mutex`)
  - `capture_checkpoint_state(message_index)` method with:
    - **Synchronous critical section**: Update index and get tree OID (must be immediate)
    - Returns `CheckpointCommitData` for async processing
    - Accepts sparse message indices directly
  - `create_checkpoint_commit(data)` static method:
    - **Async non-critical section**: Create commit from tree OID
  - Checkpoint reference naming: `refs/vk-checkpoints/{attempt_id}/msg-{message_index}`
  - Skip detection to avoid duplicate checkpoints (tracks last tree OID)
  - Pre-populate index in constructor for performance

### 1.2 Database Schema Updates
- No new tables needed (checkpoints stored as git refs)
- Consider adding optional checkpoint tracking fields to `execution_processes` table for debugging

### 1.3 Stream Integration Updates
- **File**: `backend/src/routes/stream.rs`
- Modify normalized log streaming to detect state-mutating tools
- Pass current message index to checkpoint service
- Create checkpoint immediately after detecting mutations
- Tools to monitor: `write`, `edit`, `multiedit`, `bash`, `execute`, `todowrite`
- Skip read-only operations: `read`, `grep`, `ls`, `glob`

### 1.4 Executor Integration
- **Files**: `backend/src/executor.rs`, `backend/src/executors/*.rs`
- Add checkpoint service to executor context
- Trigger checkpoints based on `NormalizedEntryType::ToolUse`
- Pass checkpoint service through execution flow

## Phase 2: Fork Backend Implementation

### 2.1 Fork Service (`backend/src/services/fork_service.rs`)
- `find_last_checkpoint_before()` - locate checkpoint at or before message index
- `extract_conversation_up_to()` - get conversation context up to fork point
- Handle checkpoint resolution (many messages won't have checkpoints)

### 2.2 Fork API Endpoints (`backend/src/routes/task_attempts.rs`)
- **GET** `/api/attempts/{attempt_id}/checkpoints` - List available checkpoints
  - Response: Array of `{message_index, commit_sha, timestamp}`
- **POST** `/api/attempts/{attempt_id}/fork` - Fork from checkpoint
  - Body: `{message_index, custom_prompt?}`
  - Response: `{new_attempt_id, worktree_path, branch}`

### 2.3 Task Attempt Model Updates (`backend/src/models/task_attempt.rs`)
- Add `fork_attempt_from_checkpoint()` method
- Add `list_checkpoints()` method
- Update worktree creation to support checkpoint commits

## Phase 3: Frontend Implementation

### 3.1 Conversation UI Updates
- **File**: `frontend/src/components/tasks/TaskDetails/LogsTab/ConversationEntry.tsx`
- Add fork button to each conversation entry
- Show fork icon conditionally (only on entries with available checkpoints)
- Handle fork button click with confirmation dialog

### 3.2 Fork Dialog Component
- **New File**: `frontend/src/components/tasks/ForkDialog.tsx`
- Show fork confirmation with context
- Optional custom prompt field
- Display which checkpoint will be used

### 3.3 API Client Updates (`frontend/src/lib/api.ts`)
- Add `listCheckpoints(attemptId)` method
- Add `forkAttempt(attemptId, messageIndex, customPrompt?)` method
- Update types for checkpoint data

### 3.4 Navigation and State Management
- Handle navigation to forked attempt
- Show fork relationship in UI (parent/child attempts)
- Update task attempt list to show fork hierarchy

## Phase 4: Testing and Validation

### 4.1 Unit Tests
- Checkpoint service tests (creation, retrieval, skip detection)
- Fork service tests (finding checkpoints, conversation extraction)
- API endpoint tests

### 4.2 Integration Tests
- End-to-end checkpoint creation during execution
- Fork operation with various message indices
- Worktree state verification after fork

### 4.3 Performance Testing
- Checkpoint creation performance (target: 10-50ms)
- Stream processing impact
- Fork operation speed

## Implementation Order and Dependencies

1. **Week 1**: Checkpoint Service Core
   - Implement `CheckpointService` class
   - Add git ref management
   - Basic unit tests

2. **Week 2**: Stream Integration
   - Integrate checkpoint service with stream processing
   - Tool detection logic
   - Test with various executors

3. **Week 3**: Fork Backend
   - Fork service implementation
   - API endpoints
   - Worktree creation from checkpoints

4. **Week 4**: Frontend Implementation
   - UI components for forking
   - API client updates
   - Navigation and state management

5. **Week 5**: Testing and Polish
   - Comprehensive testing
   - Performance optimization
   - Documentation

## Key Technical Considerations

1. **Checkpoint Storage**: Using git refs keeps checkpoints isolated and automatically cleaned up with worktrees
2. **Performance**: Critical section must be fast (just index operations)
3. **Granularity**: Checkpoints only after mutations means fork may use earlier state
4. **Context Preservation**: Fork includes full conversation up to selected message
5. **Error Handling**: Graceful fallback if checkpoints are missing

## Files to Create/Modify

### New Files:
- `backend/src/services/checkpoint_service.rs`
- `backend/src/services/fork_service.rs`
- `frontend/src/components/tasks/ForkDialog.tsx`

### Modified Files:
- `backend/src/routes/stream.rs` - Add checkpoint triggering
- `backend/src/routes/task_attempts.rs` - Add fork endpoints
- `backend/src/models/task_attempt.rs` - Add fork methods
- `backend/src/executor.rs` - Pass checkpoint service
- `backend/src/services/mod.rs` - Export new services
- `frontend/src/components/tasks/TaskDetails/LogsTab/ConversationEntry.tsx` - Add fork button
- `frontend/src/lib/api.ts` - Add fork API methods
- `shared-types/` - Update after adding new types

## Important Notes

- **Checkpoint Granularity**: Since checkpoints only occur after state-mutating operations, forking from a read operation or assistant message will use the last mutation's state
- **Conversation Context**: The fork includes conversation up to the selected message, even if the checkpoint is earlier
- **Example**: If message 5 is a file write (checkpoint created) and messages 6-8 are reads, forking from message 8 uses checkpoint 5's state but includes messages 1-8 as context
- **Executor-Specific Conversation Format**: Currently storing normalized conversation entries is insufficient. Each executor (Claude, Gemini, Amp, etc.) requires its specific conversation format to properly resume. Future implementation needs:
  - A `truncate_session` method in the Executor trait to handle raw executor output truncation
  - Each executor to parse its own format and return properly formatted truncated output
  - Storage of executor-specific truncated output instead of normalized entries

## Performance Considerations

- Checkpoint capture: ~10-50ms (mostly file I/O)
- Critical section: Just `update_all` + `add_all`
- Start simple, optimize only if profiling shows issues
- Consider async commit phase if tree creation is slow