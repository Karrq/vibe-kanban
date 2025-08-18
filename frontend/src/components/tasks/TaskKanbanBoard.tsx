import { memo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BaseKanbanBoard from './BaseKanbanBoard';
import { TaskCard } from './TaskCard';
import { useArchive } from '@/hooks/useArchive';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
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
  const [_focusedStatus, setFocusedStatus] = useState<TaskStatus | null>(null);
  const [showArchivedIndicator, setShowArchivedIndicator] = useState(false);
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks${taskId ? `/${taskId}` : ''}`,
  });
  
  // Sync focus with URL taskId
  useEffect(() => {
    if (taskId) {
      setFocusedTaskId(taskId);
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        setFocusedStatus(task.status.toLowerCase() as TaskStatus);
      }
    }
  }, [taskId, tasks]);
  
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
        focusedTaskId={focusedTaskId}
        onFocusChange={handleFocusChange}
        columnConfig={{
          statuses: ['todo', 'inprogress', 'inreview', 'done', 'cancelled'],
        }}
      />
    </>
  );
}

export default memo(TaskKanbanBoard);
