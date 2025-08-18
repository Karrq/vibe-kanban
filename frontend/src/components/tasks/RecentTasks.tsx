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
    _index: number,
    _status: string,
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
            columnConfig={{
              statuses: ['todo', 'inprogress', 'inreview', 'done'],
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}