use std::time::Duration;
use std::sync::Arc;
use tokio::sync::Mutex;

use axum::{
    extract::{Path, Query, State},
    response::sse::{Event, Sse},
    routing::get,
    Router,
};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    executors::gemini::GeminiExecutor,
    models::execution_process::{ExecutionProcess, ExecutionProcessStatus},
    services::{CheckpointService, is_state_mutating_tool},
    executor::NormalizedEntryType,
};

/// Interval for DB tail polling (ms) - now blazing fast for real-time updates
const TAIL_INTERVAL_MS: u64 = 100;

/// Structured batch data for SSE streaming
#[derive(Serialize)]
struct BatchData {
    batch_id: u64,
    patches: Vec<Value>,
}

/// Query parameters for resumable SSE streaming
#[derive(Debug, Deserialize)]
pub struct StreamQuery {
    /// Optional cursor to resume streaming from specific batch ID
    since_batch_id: Option<u64>,
}

/// SSE handler for incremental normalized-logs JSON-Patch streaming
///
/// GET /api/projects/:project_id/execution-processes/:process_id/normalized-logs/stream?since_batch_id=123
pub async fn normalized_logs_stream(
    Path((_project_id, process_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<StreamQuery>,
    State(app_state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    // Get process info including task_attempt_id and working directory
    let (is_gemini, task_attempt_id, working_dir, process_type, process_created_at) = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
        Ok(Some(process)) => (
            process.executor_type.as_deref() == Some("gemini"),
            process.task_attempt_id,
            process.working_directory.clone(),
            process.process_type.clone(),
            process.created_at,
        ),
        _ => {
            tracing::warn!(
                "Failed to find execution process {} for SSE streaming",
                process_id
            );
            (false, Uuid::new_v4(), String::new(), crate::models::execution_process::ExecutionProcessType::CodingAgent, chrono::Utc::now())
        }
    };

    // Calculate cumulative message count from previous processes
    let cumulative_message_count = if matches!(process_type, crate::models::execution_process::ExecutionProcessType::CodingAgent) {
        // Get all previous CodingAgent processes for this attempt
        match ExecutionProcess::find_by_task_attempt_id(&app_state.db_pool, task_attempt_id).await {
            Ok(processes) => {
                let mut count = 0;
                for proc in processes.iter() {
                    // Only count CodingAgent processes that started before this one
                    if proc.process_type == crate::models::execution_process::ExecutionProcessType::CodingAgent 
                        && proc.created_at < process_created_at {
                        // Parse and normalize the logs to count entries
                        if let Some(stdout) = &proc.stdout {
                            if !stdout.trim().is_empty() {
                                if let Some(executor_type) = &proc.executor_type {
                                    use crate::executor::ExecutorConfig;
                                    if let Ok(config) = executor_type.parse::<ExecutorConfig>() {
                                        let executor = config.create_executor();
                                        let working_dir_path = proc.working_directory.clone();
                                        if let Ok(normalized) = executor.normalize_logs(stdout, &working_dir_path) {
                                            count += normalized.entries.len();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                count
            }
            Err(e) => {
                tracing::warn!("Failed to get previous processes for cumulative count: {}", e);
                0
            }
        }
    } else {
        0
    };

    tracing::info!(
        "Process {} starting with cumulative message count: {}",
        process_id,
        cumulative_message_count
    );

    // Initialize checkpoint service for CodingAgent processes
    let checkpoint_service = if matches!(process_type, crate::models::execution_process::ExecutionProcessType::CodingAgent) {
        match CheckpointService::new(&working_dir, task_attempt_id, process_id) {
            Ok(service) => {
                tracing::info!("Initialized checkpoint service for attempt {} process {}", task_attempt_id, process_id);
                Some(Arc::new(Mutex::new(service)))
            }
            Err(e) => {
                tracing::warn!("Failed to initialize checkpoint service: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Use blazing fast polling interval for Gemini (only streaming executor)
    let poll_interval = if is_gemini { 50 } else { TAIL_INTERVAL_MS };

    // Stream that yields patches from WAL (fast-path) or DB tail (fallback)
    let stream = async_stream::stream! {
        // Track previous stdout length and entry count for database polling fallback
        let mut last_len: usize = 0;
        let mut last_entry_count: usize = query.since_batch_id.unwrap_or(1) as usize;
        let mut interval = tokio::time::interval(Duration::from_millis(poll_interval));
        let mut last_seen_batch_id: u64 = query.since_batch_id.unwrap_or(0); // Cursor for WAL streaming

        // Monotonic batch ID for fallback polling (always start at 1)
        let since = query.since_batch_id.unwrap_or(1);
        let mut fallback_batch_id: u64 = since + 1;

        // Fast catch-up phase for resumable streaming
        if let Some(since_batch) = query.since_batch_id {
            if !is_gemini {
                // Load current process state to get all available entries
                if let Ok(Some(proc)) = ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
                    if let Some(stdout) = &proc.stdout {
                        // Create executor and normalize logs to get all entries
                        if let Some(executor) = proc.executor_type
                            .as_deref()
                            .unwrap_or("unknown")
                            .parse::<crate::executor::ExecutorConfig>()
                            .ok()
                            .map(|cfg| cfg.create_executor())
                        {
                            if let Ok(normalized) = executor.normalize_logs(stdout, &proc.working_directory) {
                            // Send all entries after since_batch_id immediately
                            let start_entry = since_batch as usize;
                            let catch_up_entries = normalized.entries.get(start_entry..).unwrap_or(&[]);

                            for (i, entry) in catch_up_entries.iter().enumerate() {
                                let batch_data = BatchData {
                                    batch_id: since_batch + 1 + i as u64,
                                    patches: vec![serde_json::json!({
                                        "op": "add",
                                        "path": "/entries/-",
                                        "value": entry
                                    })],
                                };
                                yield Ok(Event::default().event("patch").data(serde_json::to_string(&batch_data).unwrap_or_default()));
                            }

                                // Update cursors to current state
                                last_entry_count = normalized.entries.len();
                                fallback_batch_id = since_batch + 1 + catch_up_entries.len() as u64;
                                last_len = stdout.len();
                            }
                        }
                    }
                }
            }
        }

        loop {
            interval.tick().await;

            // Check process status first
            let process_status = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id).await {
                Ok(Some(proc)) => proc.status,
                _ => {
                    tracing::warn!("Execution process {} not found during SSE streaming", process_id);
                    break;
                }
            };

            if is_gemini {
                // Gemini streaming: Read from Gemini WAL using cursor
                let cursor = if last_seen_batch_id == 0 { None } else { Some(last_seen_batch_id) };
                if let Some(new_batches) = GeminiExecutor::get_wal_batches(process_id, cursor) {
                    // Send any new batches since last cursor
                    for batch in &new_batches {
                        // Send full batch including batch_id for cursor tracking
                        let batch_data = BatchData {
                            batch_id: batch.batch_id,
                            patches: batch.patches.clone(),
                        };
                        let json = serde_json::to_string(&batch_data).unwrap_or_default();
                        yield Ok(Event::default().event("patch").data(json));
                        // Update cursor to highest batch_id seen
                        last_seen_batch_id = batch.batch_id.max(last_seen_batch_id);
                    }
                }
            } else {
                // Fallback: Database polling for non-streaming executors
                // 1. Load the process
                    let proc = match ExecutionProcess::find_by_id(&app_state.db_pool, process_id)
                    .await
                    .ok()
                    .flatten()
                {
                    Some(p) => p,
                    None => {
                        tracing::warn!("Execution process {} not found during SSE polling", process_id);
                        continue;
                    }
                };

                // 2. Grab the stdout and check if there's new content
                let stdout = match proc.stdout {
                    Some(ref s) if s.len() > last_len && !s[last_len..].trim().is_empty() => s.clone(),
                    _ => continue, // no new output
                };

                // 3. Instantiate the right executor
                let executor = match proc.executor_type
                    .as_deref()
                    .unwrap_or("unknown")
                    .parse::<crate::executor::ExecutorConfig>()
                    .ok()
                    .map(|cfg| cfg.create_executor())
                {
                    Some(exec) => exec,
                    None => {
                        tracing::warn!(
                            "Unknown executor '{}' for process {}",
                            proc.executor_type.unwrap_or_default(),
                            process_id
                        );
                        continue;
                    }
                };

                // 4. Normalize logs
                let normalized = match executor.normalize_logs(&stdout, &proc.working_directory) {
                    Ok(norm) => norm,
                    Err(err) => {
                        tracing::error!(
                            "Failed to normalize logs for process {}: {}",
                            process_id,
                            err
                        );
                        continue;
                    }
                };

                if last_entry_count > normalized.entries.len() {
                    continue;
                }

                // 5. Compute patches for any new entries
                if last_entry_count >= normalized.entries.len() {
                    continue;
                }
                
                // Process ALL new entries in batch
                let new_entries = &normalized.entries[last_entry_count..];
                if new_entries.is_empty() {
                    continue;
                }
                
                // Build patches and check if any state-mutating tools are present
                let mut patches: Vec<Value> = Vec::new();
                let mut has_state_mutating_tool = false;
                
                for entry in new_entries.iter() {
                    patches.push(serde_json::json!({
                        "op": "add",
                        "path": "/entries/-",
                        "value": entry
                    }));
                    
                    // Check if this is a state-mutating tool
                    if let NormalizedEntryType::ToolUse { tool_name, .. } = &entry.entry_type {
                        if is_state_mutating_tool(tool_name) {
                            has_state_mutating_tool = true;
                        }
                    }
                }
                
                // 6. Create checkpoint BEFORE sending batch (checkpointing is time-sensitive!)
                // Checkpoint captures state after all entries in the batch
                if let Some(checkpoint_svc) = &checkpoint_service {
                    if has_state_mutating_tool {
                        // Use cumulative count + current process entries for global index
                        let checkpoint_index = cumulative_message_count + normalized.entries.len();
                        let service = checkpoint_svc.lock().await;
                        match service.capture_checkpoint_state(checkpoint_index) {
                            Ok(Some(commit_data)) => {
                                // Create commit asynchronously (non-critical section)
                                tokio::spawn(async move {
                                    match CheckpointService::create_checkpoint_commit(commit_data).await {
                                        Ok(_) => {
                                            tracing::debug!(
                                                "Checkpoint commit created at index {}",
                                                checkpoint_index
                                            );
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                "Failed to create checkpoint commit: {}",
                                                e
                                            );
                                        }
                                    }
                                });
                            }
                            Ok(None) => {
                                // No changes detected, checkpoint skipped
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to capture checkpoint state: {}",
                                    e
                                );
                            }
                        }
                    }
                }

                // 7. Emit the batch with all new entries (after checkpointing)
                let batch_data = BatchData {
                    batch_id: fallback_batch_id,
                    patches,
                };
                let json = serde_json::to_string(&batch_data).unwrap_or_default();
                yield Ok(Event::default().event("patch").data(json));

                // 8. Update our cursors for the entire batch
                fallback_batch_id += 1;
                last_entry_count = normalized.entries.len();
                last_len = stdout.len();
            }

            // Stop streaming when process completed
            if process_status != ExecutionProcessStatus::Running {
                break;
            }
        }
    };

    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

/// Router exposing `/normalized-logs/stream`
pub fn stream_router() -> Router<AppState> {
    Router::new().route(
        "/projects/:project_id/execution-processes/:process_id/normalized-logs/stream",
        get(normalized_logs_stream),
    )
}
