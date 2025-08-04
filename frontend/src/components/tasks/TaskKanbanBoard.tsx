import { memo, useEffect, useMemo, useState } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useKeyboardShortcuts,
  useKanbanKeyboardNavigation,
} from '@/lib/keyboard-shortcuts.ts';
import { useArchive } from '@/hooks/useArchive';

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

const allTaskStatuses: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const statusBoardColors: Record<TaskStatus, string> = {
  todo: 'hsl(var(--neutral))',
  inprogress: 'hsl(var(--info))',
  inreview: 'hsl(var(--warning))',
  done: 'hsl(var(--success))',
  cancelled: 'hsl(var(--destructive))',
};

function TaskKanbanBoard({
  tasks,
  searchQuery = '',
  onDragEnd,
  onEditTask,
  onDeleteTask,
  onViewTaskDetails,
  isPanelOpen,
}: TaskKanbanBoardProps) {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const { filterTasks, toggleTaskArchive, isTaskArchived } = useArchive();

  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks${taskId ? `/${taskId}` : ''}`,
  });

  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(
    taskId || null
  );
  const [focusedStatus, setFocusedStatus] = useState<TaskStatus | null>(null);
  const [showArchivedIndicator, setShowArchivedIndicator] = useState(false);

  // Memoize filtered tasks with archive support
  const { filteredTasks, hasOnlyArchived } = useMemo(() => {
    // filterTasks already handles both archive filtering and search filtering
    const { visible, hasOnlyArchived } = filterTasks(tasks, searchQuery, projectId);
    return { filteredTasks: visible, hasOnlyArchived };
  }, [tasks, searchQuery, filterTasks, projectId]);

  // Update archived indicator
  useEffect(() => {
    setShowArchivedIndicator(hasOnlyArchived);
  }, [hasOnlyArchived]);

  // Memoize grouped tasks
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {} as Record<TaskStatus, Task[]>;
    allTaskStatuses.forEach((status) => {
      groups[status] = [];
    });
    filteredTasks.forEach((task) => {
      const normalizedStatus = task.status.toLowerCase() as TaskStatus;
      if (groups[normalizedStatus]) {
        groups[normalizedStatus].push(task);
      } else {
        groups['todo'].push(task);
      }
    });
    return groups;
  }, [filteredTasks]);

  // Sync focus state with taskId param
  useEffect(() => {
    if (taskId) {
      const found = filteredTasks.find((t) => t.id === taskId);
      if (found) {
        setFocusedTaskId(taskId);
        setFocusedStatus((found.status.toLowerCase() as TaskStatus) || null);
      }
    }
  }, [taskId, filteredTasks]);

  // If no taskId in params, keep last focused, or focus first available
  useEffect(() => {
    if (!taskId && !focusedTaskId) {
      for (const status of allTaskStatuses) {
        if (groupedTasks[status] && groupedTasks[status].length > 0) {
          setFocusedTaskId(groupedTasks[status][0].id);
          setFocusedStatus(status);
          break;
        }
      }
    }
  }, [taskId, focusedTaskId, groupedTasks]);

  // Keyboard navigation handler
  useKanbanKeyboardNavigation({
    focusedTaskId,
    setFocusedTaskId: (id) => {
      setFocusedTaskId(id as string | null);
      if (isPanelOpen) {
        const task = filteredTasks.find((t: any) => t.id === id);
        if (task) {
          onViewTaskDetails(task);
        }
      }
    },
    focusedStatus,
    setFocusedStatus: (status) => setFocusedStatus(status as TaskStatus | null),
    groupedTasks,
    filteredTasks,
    allTaskStatuses,
  });

  return (
    <>
      {showArchivedIndicator && searchQuery.trim() && (
        <div className="mb-4 p-3 bg-muted/50 border border-muted rounded-md">
          <p className="text-sm text-muted-foreground">
            Showing archived tasks because only archived items match your search
          </p>
        </div>
      )}
      <KanbanProvider onDragEnd={onDragEnd}>
        {Object.entries(groupedTasks).map(([status, statusTasks]) => (
        <KanbanBoard key={status} id={status as TaskStatus}>
          <KanbanHeader
            name={statusLabels[status as TaskStatus]}
            color={statusBoardColors[status as TaskStatus]}
          />
          <KanbanCards>
            {statusTasks.map((task, index) => (
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
                isFocused={focusedTaskId === task.id}
                tabIndex={focusedTaskId === task.id ? 0 : -1}
              />
            ))}
          </KanbanCards>
        </KanbanBoard>
        ))}
      </KanbanProvider>
    </>
  );
}

export default memo(TaskKanbanBoard);
