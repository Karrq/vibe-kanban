use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::execution_process::{ExecutionProcess, ExecutionProcessStatus},
};

#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn list_project_processes(
    Path(project_id): Path<Uuid>,
    State(app_state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<ExecutionProcess>>>, StatusCode> {
    let processes = ExecutionProcess::find_by_project(&app_state.db_pool, project_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch processes for project {}: {:?}", project_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ApiResponse {
        success: true,
        data: Some(processes),
        error: None,
    }))
}

pub async fn kill_process(
    Path(process_id): Path<Uuid>,
    State(app_state): State<AppState>,
) -> Result<Json<ApiResponse<()>>, StatusCode> {
    // First, get the process to check its status
    let process = ExecutionProcess::find_by_id(&app_state.db_pool, process_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to find process {}: {:?}", process_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or_else(|| {
            tracing::warn!("Process {} not found", process_id);
            StatusCode::NOT_FOUND
        })?;

    // Only kill if the process is running
    if process.status != ExecutionProcessStatus::Running {
        return Ok(Json(ApiResponse {
            success: true,
            data: Some(()),
            error: Some(format!("Process is not running (status: {:?})", process.status)),
        }));
    }

    // Kill the process through the app_state execution manager
    // The actual process killing is handled by the execution monitor
    // We need to find the execution by its process_id (which is the execution_process id)
    if let Err(e) = app_state.stop_running_execution_by_id(process_id).await {
        tracing::warn!("Process may have already stopped or not tracked in memory: {:?}", e);
        // Even if killing failed, update the status to killed in database
    }

    // Update the process status in the database
    ExecutionProcess::update_status(
        &app_state.db_pool,
        process_id,
        ExecutionProcessStatus::Killed,
        Some(-9), // SIGKILL exit code
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to update process status {}: {:?}", process_id, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(ApiResponse {
        success: true,
        data: Some(()),
        error: None,
    }))
}