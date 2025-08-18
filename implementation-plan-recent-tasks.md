# Implementation Plan: Efficient Recent Tasks with Shared Kanban Architecture

## Overview

Refactor the kanban board components to create a flexible, reusable architecture that supports both project-specific and cross-project task views, with an efficient backend endpoint for fetching recent tasks across all projects.

## Goals

1. Create an efficient backend endpoint for recent tasks (no fetching all projects/tasks)
2. Build a shared `BaseKanbanBoard` component for consistent UX
3. Support parametrized card components (project cards vs recent task cards)
4. Maintain archive filtering without passing large ID lists to backend
5. Enable read-only mode for recent tasks view

## Architecture Design

```
BaseKanbanBoard (shared layout, archive filtering, drag-drop support)
    ├── TaskKanbanBoard (project-specific, full interactivity)
    │   └── TaskCard (shows description, edit/delete/archive actions)
    └── RecentTasks (multi-project, read-only)
        └── RecentTaskCard (shows project name, time ago, no actions)
```

## Prerequisites

- [ ] Backend: Rust with Axum, SQLite + SQLX
- [ ] Frontend: React 18+, TypeScript 5.0+
- [ ] Existing @dnd-kit/core for drag-and-drop
- [ ] Existing archive context for client-side filtering

## Phase 1: Backend - Efficient Recent Tasks Endpoint

### Step 1: Create TaskWithProject Type

**File:** `backend/src/models/task.rs` (or appropriate models file)  
**Operation:** Add new type for tasks with project information  
**Details:**
```rust
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct TaskWithProject {
    // Core task fields
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    
    // Project info
    pub project_name: String,
    
    // Simplified attempt status (only what's needed for UI)
    pub has_running_attempt: bool,
}
```
**Success Criteria:** Type compiles and exports to TypeScript

### Step 2: Add Database Query for Recent Tasks

**File:** `backend/src/db/tasks.rs` (create if doesn't exist)  
**Operation:** Add paginated query function  
**Details:**
```rust
pub async fn get_recent_tasks(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
    exclude_cancelled: bool,
) -> Result<Vec<TaskWithProject>, sqlx::Error> {
    let mut query = r#"
        SELECT 
            t.id,
            t.project_id,
            t.title,
            t.description,
            t.status,
            t.created_at,
            t.updated_at,
            p.name as project_name,
            EXISTS(
                SELECT 1 FROM task_attempts ta 
                WHERE ta.task_id = t.id 
                AND ta.status = 'running'
            ) as has_running_attempt
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE 1=1
    "#.to_string();
    
    if exclude_cancelled {
        query.push_str(" AND t.status != 'cancelled'");
    }
    
    query.push_str(" ORDER BY t.updated_at DESC LIMIT ? OFFSET ?");
    
    sqlx::query_as(&query)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
}
```
**Success Criteria:** Query executes successfully with pagination

### Step 3: Create API Endpoint

**File:** `backend/src/routes/tasks.rs`  
**Operation:** Add `/api/tasks/recent` endpoint  
**Details:**
```rust
#[derive(Deserialize)]
pub struct RecentTasksQuery {
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
    #[serde(default = "default_exclude_cancelled")]
    exclude_cancelled: bool,
}

fn default_limit() -> i64 { 50 }
fn default_exclude_cancelled() -> bool { true }

#[derive(Serialize)]
pub struct RecentTasksResponse {
    tasks: Vec<TaskWithProject>,
    has_more: bool,
}

pub async fn get_recent_tasks_handler(
    State(state): State<AppState>,
    Query(params): Query<RecentTasksQuery>,
) -> Result<Json<RecentTasksResponse>, ApiError> {
    let limit = params.limit.min(100);
    
    // Fetch one extra to determine if there are more
    let tasks = db::tasks::get_recent_tasks(
        &state.pool,
        limit + 1,
        params.offset,
        params.exclude_cancelled,
    ).await?;
    
    let has_more = tasks.len() > limit as usize;
    let tasks = if has_more {
        tasks[..limit as usize].to_vec()
    } else {
        tasks
    };
    
    Ok(Json(RecentTasksResponse { tasks, has_more }))
}
```
**Success Criteria:** Endpoint returns paginated results at `/api/tasks/recent`

### Step 4: Register Route

**File:** `backend/src/routes/mod.rs` or `backend/src/main.rs`  
**Operation:** Add route to router  
**Details:**
```rust
.route("/api/tasks/recent", get(tasks::get_recent_tasks_handler))
```
**Success Criteria:** Endpoint accessible via HTTP GET

### Step 5: Add Database Index

**File:** `backend/migrations/XXXXXX_add_tasks_updated_index.sql` (new migration)  
**Operation:** Create index for performance  
**Details:**
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
```
**Success Criteria:** Query performance < 100ms for 10k+ tasks

## Phase 2: Frontend - Shared Kanban Architecture

### Step 6: Create BaseKanbanBoard Component

**File:** `frontend/src/components/tasks/BaseKanbanBoard.tsx` (create new)  
**Operation:** Create generic base component with shared functionality  
**Details:**
```typescript
import { memo, useMemo, ReactNode, useEffect } from 'react';
import { useArchive } from '@/hooks/useArchive';
import {
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskStatus } from 'shared/types';

interface BaseTask {
  id: string;
  status: TaskStatus;
  updated_at: string;
  title?: string;
}

interface BaseKanbanBoardProps<T extends BaseTask> {
  tasks: T[];
  renderCard: (task: T, index: number, status: string, isFocused: boolean) => ReactNode;
  
  // Archive filtering (always enabled, but actions optional)
  projectId?: string;
  searchQuery?: string;
  onArchivedOnlyDetected?: (isArchivedOnly: boolean) => void;
  
  // Optional drag and drop
  onDragEnd?: (event: DragEndEvent) => void;
  enableDragDrop?: boolean;
  
  // Optional keyboard navigation
  enableKeyboardNavigation?: boolean;
  focusedTaskId?: string | null;
  onFocusChange?: (taskId: string | null, status: TaskStatus | null) => void;
  
  // Layout customization
  className?: string;
  columnConfig?: {
    statuses?: TaskStatus[];
    labels?: Record<TaskStatus, string>;
    colors?: Record<TaskStatus, string>;
  };
}

const DEFAULT_STATUSES: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done'];

const DEFAULT_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const DEFAULT_COLORS: Record<TaskStatus, string> = {
  todo: 'hsl(var(--neutral))',
  inprogress: 'hsl(var(--info))',
  inreview: 'hsl(var(--warning))',
  done: 'hsl(var(--success))',
  cancelled: 'hsl(var(--destructive))',
};

function BaseKanbanBoard<T extends BaseTask>({
  tasks,
  renderCard,
  projectId,
  searchQuery = '',
  onArchivedOnlyDetected,
  onDragEnd,
  enableDragDrop = false,
  enableKeyboardNavigation = false,
  focusedTaskId,
  onFocusChange,
  className,
  columnConfig,
}: BaseKanbanBoardProps<T>) {
  const { filterTasks } = useArchive();
  const statuses = columnConfig?.statuses || DEFAULT_STATUSES;
  const labels = columnConfig?.labels || DEFAULT_LABELS;
  const colors = columnConfig?.colors || DEFAULT_COLORS;
  
  // Always apply archive filtering
  const { filteredTasks, hasOnlyArchived } = useMemo(() => {
    const result = filterTasks(tasks, searchQuery, projectId);
    return { 
      filteredTasks: result.visible as T[], 
      hasOnlyArchived: result.hasOnlyArchived 
    };
  }, [tasks, searchQuery, projectId, filterTasks]);
  
  // Notify parent about archived-only state
  useEffect(() => {
    onArchivedOnlyDetected?.(hasOnlyArchived);
  }, [hasOnlyArchived, onArchivedOnlyDetected]);
  
  // Group tasks by status
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, T[]> = {} as Record<TaskStatus, T[]>;
    statuses.forEach(status => {
      groups[status] = [];
    });
    
    filteredTasks.forEach(task => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });
    
    return groups;
  }, [filteredTasks, statuses]);
  
  // Render kanban boards
  const renderBoards = () => (
    <>
      {statuses.map(status => (
        <KanbanBoard key={status} id={status}>
          <KanbanHeader name={labels[status]} color={colors[status]} />
          <KanbanCards>
            {groupedTasks[status].map((task, index) => 
              renderCard(task, index, status, focusedTaskId === task.id)
            )}
          </KanbanCards>
        </KanbanBoard>
      ))}
    </>
  );
  
  // Wrap with drag provider if needed
  if (enableDragDrop && onDragEnd) {
    return <KanbanProvider onDragEnd={onDragEnd}>{renderBoards()}</KanbanProvider>;
  }
  
  return (
    <div className={`grid w-full h-full auto-cols-fr grid-flow-col gap-4 ${className || ''}`}>
      {renderBoards()}
    </div>
  );
}

export default memo(BaseKanbanBoard) as typeof BaseKanbanBoard;
```
**Success Criteria:** Component renders and handles both drag-drop and static modes

### Step 7: Create RecentTaskCard Component

**File:** `frontend/src/components/tasks/RecentTaskCard.tsx` (create new)  
**Operation:** Create card component for recent tasks display  
**Details:**
```typescript
import { Badge } from '@/components/ui/badge';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskWithProject {
  id: string;
  title: string;
  status: string;
  project_id: string;
  project_name: string;
  updated_at: string;
  has_running_attempt?: boolean;
}

interface RecentTaskCardProps {
  task: TaskWithProject;
  onClick?: (task: TaskWithProject) => void;
  isFocused?: boolean;
  className?: string;
}

export function RecentTaskCard({ task, onClick, isFocused, className }: RecentTaskCardProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };
  
  return (
    <div
      onClick={() => onClick?.(task)}
      className={cn(
        "p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer",
        isFocused && "ring-2 ring-primary",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium line-clamp-2">{task.title}</h4>
        {task.has_running_attempt && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
            Running
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {task.project_name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatTimeAgo(task.updated_at)}
        </span>
      </div>
    </div>
  );
}
```
**Success Criteria:** Card displays project name and time, no edit actions

### Step 8: Update API Client

**File:** `frontend/src/lib/api.ts`  
**Operation:** Add method for fetching recent tasks  
**Details:**
```typescript
export interface RecentTasksResponse {
  tasks: TaskWithProject[];
  has_more: boolean;
}

export const tasksApi = {
  // ... existing methods
  
  getRecent: async (
    limit: number = 50,
    offset: number = 0,
    excludeCancelled: boolean = true
  ): Promise<RecentTasksResponse> => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      exclude_cancelled: excludeCancelled.toString(),
    });
    
    const response = await fetch(`/api/tasks/recent?${params}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch recent tasks');
    }
    
    return response.json();
  },
};
```
**Success Criteria:** API client can fetch paginated recent tasks

### Step 9: Refactor RecentTasks Component

**File:** `frontend/src/components/tasks/RecentTasks.tsx`  
**Operation:** Use BaseKanbanBoard with efficient fetching  
**Details:**
```typescript
import { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tasksApi } from '@/lib/api';
import { useArchive } from '@/hooks/useArchive';
import BaseKanbanBoard from './BaseKanbanBoard';
import { RecentTaskCard } from './RecentTaskCard';
import type { TaskWithProject } from 'shared/types';

interface RecentTasksProps {
  limit?: number;
  className?: string;
}

export function RecentTasks({ limit = 20, className }: RecentTasksProps) {
  const navigate = useNavigate();
  const { isTaskArchived } = useArchive();
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  
  const fetchRecentTasks = useCallback(async () => {
    try {
      // Fetch 3x limit to account for archived tasks
      const response = await tasksApi.getRecent(limit * 3, 0, true);
      setTasks(response.tasks);
    } catch (err) {
      console.error('Failed to fetch recent tasks:', err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);
  
  useEffect(() => {
    fetchRecentTasks();
    const interval = setInterval(fetchRecentTasks, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [fetchRecentTasks]);
  
  // Filter archived tasks client-side (archive IDs stay on frontend)
  const visibleTasks = useMemo(() => {
    return tasks
      .filter(task => !isTaskArchived(task.id))
      .slice(0, limit);
  }, [tasks, limit, isTaskArchived]);
  
  const handleTaskClick = useCallback((task: TaskWithProject) => {
    navigate(`/projects/${task.project_id}/tasks/${task.id}`);
  }, [navigate]);
  
  const renderCard = useCallback((
    task: TaskWithProject,
    index: number,
    status: string,
    isFocused: boolean
  ) => (
    <RecentTaskCard
      key={task.id}
      task={task}
      onClick={handleTaskClick}
      isFocused={isFocused}
    />
  ), [handleTaskClick]);
  
  if (loading && tasks.length === 0) return null;
  if (visibleTasks.length === 0) return null;
  
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[400px] overflow-hidden">
          <BaseKanbanBoard
            tasks={visibleTasks}
            renderCard={renderCard}
            enableDragDrop={false}
            enableKeyboardNavigation={false}
            columnConfig={{
              statuses: ['todo', 'inprogress', 'inreview', 'done'],
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```
**Success Criteria:** Recent tasks display efficiently without fetching all projects

### Step 10: Refactor TaskKanbanBoard to Use BaseKanbanBoard

**File:** `frontend/src/components/tasks/TaskKanbanBoard.tsx`  
**Operation:** Refactor to use shared base component  
**Details:**
```typescript
import { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BaseKanbanBoard from './BaseKanbanBoard';
import { TaskCard } from './TaskCard';
import { useArchive } from '@/hooks/useArchive';
import { useKeyboardShortcuts, useKanbanKeyboardNavigation } from '@/lib/keyboard-shortcuts';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';

type Task = TaskWithAttemptStatus;

interface TaskKanbanBoardProps {
  tasks: Task[];
  searchQuery?: string;
  onDragEnd: (event: DragEndEvent) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onViewTaskDetails: (task: Task) => void;
  isPanelOpen: boolean;
}

function TaskKanbanBoard({
  tasks,
  searchQuery = '',
  onDragEnd,
  onEditTask,
  onDeleteTask,
  onViewTaskDetails,
  isPanelOpen,
}: TaskKanbanBoardProps) {
  const { projectId, taskId } = useParams<{ projectId: string; taskId?: string }>();
  const navigate = useNavigate();
  const { toggleTaskArchive, isTaskArchived } = useArchive();
  
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(taskId || null);
  const [focusedStatus, setFocusedStatus] = useState<TaskStatus | null>(null);
  const [showArchivedIndicator, setShowArchivedIndicator] = useState(false);
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks${taskId ? `/${taskId}` : ''}`,
  });
  
  const handleFocusChange = useCallback((taskId: string | null, status: TaskStatus | null) => {
    setFocusedTaskId(taskId);
    setFocusedStatus(status);
    if (isPanelOpen && taskId) {
      const task = tasks.find(t => t.id === taskId);
      if (task) onViewTaskDetails(task);
    }
  }, [tasks, isPanelOpen, onViewTaskDetails]);
  
  const renderCard = useCallback((
    task: Task,
    index: number,
    status: string,
    isFocused: boolean
  ) => (
    <TaskCard
      key={task.id}
      task={task}
      index={index}
      status={status}
      onEdit={onEditTask}
      onDelete={onDeleteTask}
      onArchive={toggleTaskArchive}
      isArchived={isTaskArchived(task.id)}
      onViewDetails={onViewTaskDetails}
      isFocused={isFocused}
      tabIndex={0}
    />
  ), [onEditTask, onDeleteTask, toggleTaskArchive, isTaskArchived, onViewTaskDetails]);
  
  return (
    <>
      {showArchivedIndicator && searchQuery.trim() && (
        <div className="mb-4 p-3 bg-muted/50 border border-muted rounded-md">
          <p className="text-sm text-muted-foreground">
            Showing archived tasks because only archived items match your search
          </p>
        </div>
      )}
      <BaseKanbanBoard
        tasks={tasks}
        renderCard={renderCard}
        projectId={projectId}
        searchQuery={searchQuery}
        onArchivedOnlyDetected={setShowArchivedIndicator}
        onDragEnd={onDragEnd}
        enableDragDrop={true}
        enableKeyboardNavigation={true}
        focusedTaskId={focusedTaskId}
        onFocusChange={handleFocusChange}
      />
    </>
  );
}

export default memo(TaskKanbanBoard);
```
**Success Criteria:** TaskKanbanBoard maintains all existing functionality

## Phase 3: Testing & Optimization

### Step 11: Generate TypeScript Types

**File:** Run command  
**Operation:** `pnpm run generate-types`  
**Success Criteria:** TaskWithProject type available in shared/types.ts

### Step 12: Performance Testing

**Tests to Run:**
- [ ] Load test with 10,000+ tasks in database
- [ ] Test with 50% of recent tasks archived
- [ ] Verify SQL query performance < 100ms
- [ ] Network payload < 50KB for recent tasks
- [ ] UI renders 100 tasks smoothly
- [ ] Memory usage stable with periodic refresh

### Step 13: Integration Testing

**Tests to Run:**
- [ ] TaskKanbanBoard drag-and-drop works
- [ ] RecentTasks displays cross-project tasks
- [ ] Archive filtering works in both views
- [ ] Keyboard navigation works in project view
- [ ] Click navigation works in recent tasks
- [ ] Periodic refresh doesn't cause flicker

## Rollback Plan

If issues arise:

1. **Backend Rollback:**
   - Remove `/api/tasks/recent` endpoint
   - Remove `TaskWithProject` type
   - Remove database query function

2. **Frontend Rollback:**
   - Delete `BaseKanbanBoard.tsx`
   - Delete `RecentTaskCard.tsx`
   - Restore original `TaskKanbanBoard.tsx`
   - Restore original `RecentTasks.tsx`

3. **Verification:**
   - Run `cargo check`
   - Run `pnpm run check`
   - Test existing functionality

## Success Metrics

- **Performance:** Recent tasks load in < 500ms
- **Efficiency:** Network transfer reduced by 90%
- **Scalability:** Works with 10,000+ tasks
- **UX Consistency:** Same kanban layout across views
- **Code Reuse:** 50% reduction in kanban-related code
- **Maintainability:** Single source of truth for kanban layout

## Implementation Notes

1. **Archive Filtering:** Stays client-side to avoid large SQL IN clauses
2. **Pagination:** Backend supports it, frontend can implement smart fetching if needed
3. **Refresh Rate:** 10 seconds for recent tasks (configurable)
4. **Card Components:** Parametrized for different use cases
5. **Backward Compatibility:** Existing TaskKanbanBoard API unchanged

## Future Enhancements

- Add virtual scrolling for very large task lists
- Implement WebSocket updates instead of polling
- Add task preview on hover
- Support custom status columns per project
- Add bulk operations for task management