use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json as ResponseJson,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{
        project::Project,
        task::TaskStatus,
        ApiResponse,
    },
};

/// Query parameters for branch endpoints
#[derive(Debug, Deserialize)]
pub struct BranchesQuery {
    pub project_id: Option<Uuid>,
}

/// Information about a git branch and its associated worktree (if any)
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct BranchInfo {
    pub branch_name: String,
    pub project_id: Uuid,
    pub project_name: String,
    
    // Worktree information (if exists)
    pub worktree_path: Option<String>,
    pub worktree_exists: bool,
    
    // Task/attempt information (if branch is associated with a task)
    pub task_id: Option<Uuid>,
    pub task_title: Option<String>,
    pub task_status: Option<TaskStatus>,
    pub attempt_id: Option<Uuid>,
    pub attempt_deleted: bool,
    
    // PR information
    pub pr_url: Option<String>,
    pub pr_status: Option<String>,
    pub pr_merged_at: Option<DateTime<Utc>>,
    pub merge_commit: Option<String>,
}

/// Get all branches across all projects with their worktree and task information
pub async fn get_all_branches(
    State(app_state): State<AppState>,
    Query(query): Query<BranchesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<BranchInfo>>>, StatusCode> {
    
    // Get projects based on query
    let projects = if let Some(project_id) = query.project_id {
        // Fetch specific project
        match Project::find_by_id(&app_state.db_pool, project_id).await {
            Ok(Some(project)) => vec![project],
            Ok(None) => {
                return Ok(ResponseJson(ApiResponse::success(Vec::new())));
            },
            Err(e) => {
                tracing::error!("Failed to fetch project: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    } else {
        // Fetch all projects
        match Project::find_all(&app_state.db_pool).await {
            Ok(projects) => projects,
            Err(e) => {
                tracing::error!("Failed to fetch projects: {}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    };
    
    // Process projects in parallel - the pool itself handles connection limits
    // and provides backpressure when exhausted
    let project_futures = projects.into_iter().map(|project| {
        let pool = app_state.db_pool.clone();
        async move {
            process_project_branches(project, pool).await
        }
    });
    
    let results = futures_util::future::join_all(project_futures).await;
    
    // Flatten results and filter out errors
    let mut all_branches = Vec::new();
    for result in results {
        if let Ok(branches) = result {
            all_branches.extend(branches);
        }
    }
    
    // Sort by project name, then branch name
    all_branches.sort_by(|a, b| {
        a.project_name.cmp(&b.project_name)
            .then_with(|| a.branch_name.cmp(&b.branch_name))
    });
    
    Ok(ResponseJson(ApiResponse::success(all_branches)))
}

/// Process branches for a single project
async fn process_project_branches(
    project: Project,
    pool: sqlx::SqlitePool,
) -> Result<Vec<BranchInfo>, Box<dyn std::error::Error + Send + Sync>> {
    use std::collections::HashMap;
    
    let mut branches_info = Vec::new();
    
    // Skip if project directory doesn't exist
    if !std::path::Path::new(&project.git_repo_path).exists() {
        return Ok(branches_info);
    }
    
    // Concurrently get branches and worktrees
    let branches_future = scan_git_branches(&project.git_repo_path);
    let worktrees_future = scan_git_worktrees(&project.git_repo_path);
    
    let (branches_result, worktrees_result) = tokio::join!(branches_future, worktrees_future);
    
    let branches = branches_result.unwrap_or_else(|e| {
        tracing::warn!("Failed to scan branches for project {}: {}", project.id, e);
        Vec::new()
    });
    
    let worktrees = worktrees_result.unwrap_or_else(|e| {
        tracing::warn!("Failed to scan worktrees for project {}: {}", project.id, e);
        Vec::new()
    });
    
    // Create a map of branch names to worktree paths
    let mut branch_worktrees: HashMap<String, String> = HashMap::new();
    for (worktree_path, branch_name) in worktrees {
        branch_worktrees.insert(branch_name, worktree_path.to_string_lossy().to_string());
    }
    
    // Get all task attempts for this project to match with branches
    let attempts_query = r#"
        SELECT 
            ta.id as attempt_id,
            ta.task_id,
            ta.branch,
            ta.worktree_path,
            ta.worktree_deleted,
            ta.pr_url,
            ta.pr_status,
            ta.pr_merged_at,
            ta.merge_commit,
            t.title as task_title,
            t.status as task_status
        FROM task_attempts ta
        JOIN tasks t ON ta.task_id = t.id
        WHERE t.project_id = ?
    "#;
    
    #[derive(sqlx::FromRow)]
    struct AttemptRow {
        attempt_id: Vec<u8>,
        task_id: Vec<u8>,
        branch: String,
        worktree_path: String,
        worktree_deleted: bool,
        pr_url: Option<String>,
        pr_status: Option<String>,
        pr_merged_at: Option<DateTime<Utc>>,
        merge_commit: Option<String>,
        task_title: String,
        task_status: Option<String>,
    }
    
    let attempts = sqlx::query_as::<_, AttemptRow>(attempts_query)
        .bind(project.id.as_bytes().as_slice())
        .fetch_all(&pool)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to fetch attempts for project {}: {}", project.id, e);
            Vec::new()
        });
    
    // Create a map of branch names to attempt info
    let mut branch_attempts: HashMap<String, AttemptRow> = HashMap::new();
    for attempt in attempts {
        branch_attempts.insert(attempt.branch.clone(), attempt);
    }
    
    // Process each branch
    for branch_name in branches {
        // Skip main/master branches
        if branch_name == "main" || branch_name == "master" {
            continue;
        }
        
        let worktree_path = branch_worktrees.get(&branch_name).cloned();
        let worktree_exists = worktree_path.as_ref()
            .map(|path| std::path::Path::new(path).exists())
            .unwrap_or(false);
        
        // Check if this branch has an associated task attempt
        let branch_info = if let Some(attempt) = branch_attempts.get(&branch_name) {
            BranchInfo {
                branch_name: branch_name.clone(),
                project_id: project.id,
                project_name: project.name.clone(),
                worktree_path: worktree_path.or_else(|| Some(attempt.worktree_path.clone())),
                worktree_exists,
                task_id: Some(Uuid::from_slice(&attempt.task_id).unwrap_or_default()),
                task_title: Some(attempt.task_title.clone()),
                task_status: attempt.task_status.as_ref().and_then(|s| match s.as_str() {
                    "todo" => Some(TaskStatus::Todo),
                    "inprogress" => Some(TaskStatus::InProgress),
                    "inreview" => Some(TaskStatus::InReview),
                    "done" => Some(TaskStatus::Done),
                    "cancelled" => Some(TaskStatus::Cancelled),
                    _ => None,
                }),
                attempt_id: Some(Uuid::from_slice(&attempt.attempt_id).unwrap_or_default()),
                attempt_deleted: attempt.worktree_deleted,
                pr_url: attempt.pr_url.clone(),
                pr_status: attempt.pr_status.clone(),
                pr_merged_at: attempt.pr_merged_at,
                merge_commit: attempt.merge_commit.clone(),
            }
        } else {
            // Orphaned branch - no associated task
            BranchInfo {
                branch_name: branch_name.clone(),
                project_id: project.id,
                project_name: project.name.clone(),
                worktree_path,
                worktree_exists,
                task_id: None,
                task_title: None,
                task_status: None,
                attempt_id: None,
                attempt_deleted: false,
                pr_url: None,
                pr_status: None,
                pr_merged_at: None,
                merge_commit: None,
            }
        };
        
        branches_info.push(branch_info);
    }
    
    Ok(branches_info)
}

/// Delete a branch and optionally its worktree
#[derive(Deserialize)]
pub struct DeleteBranchRequest {
    pub branch_name: String,
    pub project_id: Uuid,
    pub delete_worktree: bool,
    pub delete_branch: bool,
    pub force: bool,
}

pub async fn delete_branch(
    State(app_state): State<AppState>,
    Json(request): Json<DeleteBranchRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Get the project
    let project = match Project::find_by_id(&app_state.db_pool, request.project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => {
            return Ok(ResponseJson(ApiResponse::error("Project not found")));
        }
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    
    let branch_name = request.branch_name.clone();
    let repo_path = project.git_repo_path.clone();
    let force = request.force;
    let delete_worktree = request.delete_worktree;
    
    // Delete worktree first if requested
    if delete_worktree {
        let worktree_result = tokio::task::spawn_blocking({
            let repo_path = repo_path.clone();
            let branch_name = branch_name.clone();
            move || {
                use git2::Repository;
                
                let repo = Repository::open(&repo_path)
                    .map_err(|e| format!("Failed to open repository: {}", e))?;
                
                // Find and remove the worktree
                let worktrees = repo.worktrees()
                    .map_err(|e| format!("Failed to get worktrees: {}", e))?;
                for worktree_name in worktrees.iter().flatten() {
                    if let Ok(worktree) = repo.find_worktree(&worktree_name) {
                        let worktree_path = worktree.path().to_path_buf(); // Clone the path
                        drop(worktree); // Drop worktree immediately after getting the path
                        
                        // Check if this worktree is for our branch
                        let is_target_branch = if let Ok(wt_repo) = Repository::open(&worktree_path) {
                            if let Ok(head) = wt_repo.head() {
                                head.shorthand() == Some(&branch_name)
                            } else {
                                false
                            }
                        } else {
                            false
                        };
                        
                        if is_target_branch {
                            // Remove the worktree directory
                            if worktree_path.exists() {
                                let _ = std::fs::remove_dir_all(&worktree_path);
                            }
                            
                            // Remove worktree from git using command
                            let _ = std::process::Command::new("git")
                                .arg("-C")
                                .arg(&repo_path)
                                .arg("worktree")
                                .arg("remove")
                                .arg(&worktree_path)
                                .arg("--force")
                                .output();
                            
                            // Also run prune to clean up
                            let _ = std::process::Command::new("git")
                                .arg("-C")
                                .arg(&repo_path)
                                .arg("worktree")
                                .arg("prune")
                                .output();
                            
                            break;
                        }
                    }
                }
                
                Ok::<(), String>(())
            }
        })
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete worktree: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        
        if let Err(e) = worktree_result {
            tracing::warn!("Failed to delete worktree (continuing): {}", e);
        }
    }
    
    // Only delete the branch if requested
    if !request.delete_branch {
        // If we're not deleting the branch, we're done
        return Ok(ResponseJson(ApiResponse::success(())));
    }
    
    // Now delete the branch
    let result = tokio::task::spawn_blocking(move || {
        use git2::{Repository, BranchType};
        
        let repo = Repository::open(&repo_path)
            .map_err(|e| format!("Failed to open repository: {}", e))?;
        
        // Check if branch is currently checked out
        if let Ok(head) = repo.head() {
            if let Some(current_branch) = head.shorthand() {
                if current_branch == branch_name {
                    if !force {
                        return Err(format!("Cannot delete branch '{}' as it is currently checked out. Use force deletion to override.", branch_name));
                    }
                    // If forcing, checkout main/master first
                    let fallback_branch = if repo.find_branch("main", BranchType::Local).is_ok() {
                        "main"
                    } else if repo.find_branch("master", BranchType::Local).is_ok() {
                        "master"
                    } else {
                        return Err("Cannot delete the only branch".to_string());
                    };
                    
                    let obj = repo.revparse_single(&format!("refs/heads/{}", fallback_branch))
                        .map_err(|e| format!("Failed to find branch {}: {}", fallback_branch, e))?;
                    repo.checkout_tree(&obj, None)
                        .map_err(|e| format!("Failed to checkout {}: {}", fallback_branch, e))?;
                    repo.set_head(&format!("refs/heads/{}", fallback_branch))
                        .map_err(|e| format!("Failed to set HEAD to {}: {}", fallback_branch, e))?;
                }
            }
        }
        
        // Find and delete the branch
        let mut branch = repo.find_branch(&branch_name, BranchType::Local)
            .map_err(|e| format!("Failed to find branch '{}': {}", branch_name, e))?;
        
        // Try to delete the branch
        let delete_result = branch.delete();
        
        if let Err(e) = delete_result {
            if force {
                // If force delete requested and regular delete failed, use git command
                let output = std::process::Command::new("git")
                    .arg("-C")
                    .arg(&repo_path)
                    .arg("branch")
                    .arg("-D")  // Force delete
                    .arg(&branch_name)
                    .output()
                    .map_err(|e| format!("Failed to run git command: {}", e))?;
                
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Failed to force delete branch '{}': {}", branch_name, stderr));
                }
            } else {
                return Err(format!("Failed to delete branch '{}': {}. Use force deletion to delete unmerged branches.", branch_name, e));
            }
        }
        
        tracing::info!("Successfully deleted branch '{}'", branch_name);
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| {
        tracing::error!("Failed to delete branch (task error): {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    
    match result {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(e) => {
            tracing::error!("Failed to delete branch: {}", e);
            Ok(ResponseJson(ApiResponse::error(&e)))
        }
    }
}

/// Scan a git repository for all branches
async fn scan_git_branches(repo_path: &str) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
    use git2::{Repository, BranchType};
    
    let repo_path = repo_path.to_string();
    
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let mut branch_names = Vec::new();
        
        // Get all local branches
        let branches = repo.branches(Some(BranchType::Local))?;
        
        for branch_result in branches {
            if let Ok((branch, _)) = branch_result {
                if let Some(name) = branch.name()? {
                    branch_names.push(name.to_string());
                }
            }
        }
        
        Ok(branch_names)
    })
    .await?
}

/// Scan a git repository for all worktrees
async fn scan_git_worktrees(repo_path: &str) -> Result<Vec<(std::path::PathBuf, String)>, Box<dyn std::error::Error + Send + Sync>> {
    use git2::Repository;
    
    let repo_path = repo_path.to_string();
    
    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_path)?;
        let mut worktrees = Vec::new();
        
        // Get list of worktree names
        let worktree_names = repo.worktrees()?;
        
        for name in worktree_names.iter().flatten() {
            match repo.find_worktree(&name) {
                Ok(worktree) => {
                    let path = worktree.path();
                    
                    // Get the branch name for this worktree
                    let branch_name = if let Ok(wt_repo) = Repository::open(&path) {
                        if let Ok(head) = wt_repo.head() {
                            head.shorthand().unwrap_or(&name).to_string()
                        } else {
                            name.to_string()
                        }
                    } else {
                        name.to_string()
                    };
                    
                    worktrees.push((path.to_path_buf(), branch_name));
                }
                Err(e) => {
                    tracing::warn!("Failed to find worktree {}: {}", name, e);
                }
            }
        }
        
        Ok(worktrees)
    })
    .await?
}