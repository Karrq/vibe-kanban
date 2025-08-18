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
  focusedTaskId,
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
      const normalizedStatus = task.status.toLowerCase() as TaskStatus;
      if (groups[normalizedStatus]) {
        groups[normalizedStatus].push(task);
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