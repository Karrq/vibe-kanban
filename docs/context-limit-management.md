# Context Limit Management Feature

## Overview
Vibe Kanban includes an intelligent context limit management system for Claude Code conversations that automatically detects and handles context window limitations to ensure continuous task execution.

## Current Implementation Status

### 1. Context Limit Detection
**Location:** `backend/src/executors/claude.rs:238-244`
- **Method:** Parses Claude's JSON output for error messages
- **Detection Patterns:**
  - `"prompt too long"`
  - `"context limit"`
  - `"token limit"`
- **Output:** Marks errors as `NormalizedEntryType::ErrorMessage` with "Context limit reached" prefix

### 2. Post-Execution Context Check
**Location:** `backend/src/execution_monitor.rs:843-874`
- **Trigger:** After each Claude execution completes
- **Action:** Stores a note in the database when context limit is detected
- **Message:** `"[Context limit reached - follow-up messages will start a new session]"`

### 3. Proactive Context Management
**Location:** `backend/src/services/process_service.rs`

#### Context Usage Estimation (lines 51-61)
- **Current Method:** Character count estimation
  - Assumes ~200k token context window
  - Estimates ~4 characters per token
  - Maximum ~800,000 characters
- **Returns:** Usage percentage (0.0 to 1.0)
- **Limitation:** Rough approximation, not actual token count

#### Auto-Compaction Trigger (lines 64-88)
- **Threshold:** 85% of estimated context usage
- **Check:** Performed before each follow-up execution
- **Logging:** Info level log when compaction is recommended

#### Follow-up Conversation Handling (lines 547-599)
Current implementation (INCORRECT - needs fixing):
- System starts new session when approaching limits
- Should instead continue existing session with compaction request

### 4. Current Implementation Issues
The current implementation incorrectly:
1. Starts a new session immediately when approaching context limits
2. Asks Claude to summarize in the new session (where Claude has no context)
3. Doesn't properly preserve context between sessions

## Correct Compaction Strategy (TO BE IMPLEMENTED)

### For Sessions Approaching Limit (≥85%):
1. **Continue existing session** with a compaction request
2. **Send compaction prompt** to Claude in the same session: 
   - "Please provide a comprehensive summary of our conversation including key decisions, completed tasks, current state, and any important context"
3. **Receive and store** Claude's compacted summary response
4. **Start new session** with the compacted summary as initial context
5. **Process user's request** in the new session with preserved context

**Flow Diagram:**
```
Session 1 (approaching limit):
[messages 0..N] → [compact prompt] → [Claude's summary response]
                                              ↓
                                    (stored as context)
                                              ↓
Session 2 (new):
[compacted summary as initial context] → [user's request] → [Claude continues with context]
```

### For Sessions Already Over Limit:
1. **Cannot retrieve context** - session is already too large
2. **System notification**: "Previous session exceeded context limits and cannot continue. Starting new session."
3. **Start fresh session** without automatic context
4. **User provides context**: User must manually provide relevant context in their follow-up message

## Planned Enhancements

### 1. Fix Compaction Implementation
**Priority:** Critical
- **Current Issue:** System starts new session and asks for summary where Claude has no context
- **Fix Required:** 
  - Continue existing session when approaching limit
  - Request compaction in the same session
  - Extract and store the summary
  - Then start new session with summary as context

### 2. Improved Token Counting
**Priority:** High
- **Current:** Character-based estimation (unreliable)
- **Proposed:** Use Anthropic's token counting API endpoint
- **Benefits:** 
  - Accurate context usage tracking
  - Better prediction of when compaction is needed
  - Avoid premature or late compaction

### 3. User Notification System
**Priority:** High
- **Current:** Silent compaction/new session creation
- **Proposed:** Add system messages to conversation stream
- **Implementation:**
  - Insert `NormalizedEntryType::SystemMessage` when:
    - Auto-compaction triggers
    - New session starts due to context limit
    - Context limit error occurs
  - Messages should include:
    - What happened (compaction/new session)
    - Why it happened (context usage percentage)
    - What was preserved (summary content)
- **Frontend:** Display these messages with distinct styling

### 4. Manual Compaction Trigger
**Priority:** Medium
- **Proposed:** Add endpoint for manual compaction
- **Implementation Approach:**
  - Create `/api/tasks/:task_id/attempts/:attempt_id/compact` endpoint
  - Reuse compaction logic from auto-compaction
  - Allow users to trigger at natural stopping points
- **Architecture Considerations:**
  - Extract compaction logic into reusable service method
  - Ensure proper session state management
  - Store compaction metadata (timestamp, trigger type, context size)
- **UI Integration:**
  - Add "Compact Conversation" button in task view
  - Show context usage indicator
  - Disable when already compacting or in new session

### 5. Additional Improvements (Future)
- **Configurable Thresholds:** Allow per-project context limit thresholds (currently hardcoded 85%)
- **Summary Storage:** Systematic storage of conversation summaries for better context preservation
- **Metrics Collection:** Track compaction frequency and effectiveness
- **Smart Compaction:** Use Claude to generate better contextual summaries
- **Compaction History:** Track all compaction events with before/after token counts

## Technical Architecture

```
┌─────────────────┐
│ Claude Executor │
├─────────────────┤
│ - Parse outputs │
│ - Detect errors │
└────────┬────────┘
         │
         v
┌─────────────────────┐
│ Execution Monitor   │
├─────────────────────┤
│ - Check completion  │
│ - Store summaries   │
└────────┬────────────┘
         │
         v
┌──────────────────────┐
│ Process Service      │
├──────────────────────┤
│ - Estimate usage     │
│ - Decide strategy    │
│ - Create new session │
│   or continue        │
└──────────────────────┘
```

## Usage Examples

### Scenario 1: Approaching Context Limit (Correct Implementation)
```
Session 1:
User: "Add error handling"
System: [Context at 87% - Requesting compaction]
Assistant: [Compaction prompt sent to Claude in same session]
Claude: "Here's a comprehensive summary of our work: 
  - Implemented features X, Y, Z
  - Current state: Working on authentication module
  - Key decisions: Using JWT tokens, PostgreSQL for storage..."
System: [Compaction complete - Starting new session with context]

Session 2:
System: [New session initialized with compacted context]
User: "Add error handling"
Claude: "Based on our previous work with the authentication module using JWT tokens, 
         I'll now add comprehensive error handling..."
```

### Scenario 2: Context Limit Already Hit
```
User: "Continue implementing the feature"
System: [Previous session exceeded context limits - Cannot retrieve context]
System: [Starting new session without automatic context]
User: "We were working on the payment processing module. The last thing we did was..."
Claude: "Thanks for the context. I'll continue with the payment processing module..."
```

### Scenario 3: Manual Compaction (Future)
```
User: [Clicks "Compact Conversation" button]
System: [Manual compaction requested]
Assistant: [Compaction prompt sent to Claude]
Claude: "Summary of our session: ..."
System: [Ready for new session with compacted context]
```

## File Locations
- **Claude Executor:** `backend/src/executors/claude.rs`
- **Execution Monitor:** `backend/src/execution_monitor.rs`
- **Process Service:** `backend/src/services/process_service.rs`
- **Executor Types:** `backend/src/executor.rs`

## Testing Considerations
- Test with long-running conversations
- Verify compaction triggers at correct thresholds
- Ensure session IDs are properly managed
- Validate summary preservation across sessions
- Check error handling for edge cases

## Implementation Roadmap

### Phase 1: Fix Core Compaction Logic (Critical)
1. **Fix compaction flow** to continue session when requesting summary
2. **Store compaction summary** properly in database
3. **Initialize new session** with compacted context

### Phase 2: Improve Accuracy & Visibility (High Priority)
1. **Integrate Anthropic token counting API** for accurate usage tracking
2. **Add system messages** to notify users of compaction events
3. **Display context usage** in UI

### Phase 3: User Control (Medium Priority)
1. **Implement manual compaction endpoint**
2. **Add UI controls** for triggering compaction
3. **Show compaction history** and metrics

### Phase 4: Optimization (Future)
1. **Refine thresholds** based on real usage data
2. **Implement smart compaction** strategies
3. **Add per-project configuration** options

## Key Implementation Notes

### Refactoring Requirements
To support manual compaction, the following refactoring is needed:
1. **Extract compaction logic** from `process_service.rs` into a dedicated service
2. **Create reusable methods** for:
   - Checking context usage
   - Sending compaction prompt
   - Storing compaction summary
   - Initializing new session with context
3. **Ensure idempotency** - compaction should be safe to retry
4. **Add proper error handling** for partial compaction failures

### Database Schema Considerations
- Add `compaction_events` table to track when/why compaction occurred
- Store `compaction_summary` in `executor_sessions` table
- Add `context_token_count` field for accurate tracking
- Track `session_lineage` to connect compacted sessions