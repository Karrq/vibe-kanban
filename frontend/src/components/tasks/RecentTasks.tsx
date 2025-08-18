import { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsApi, tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useArchive } from '@/hooks/useArchive';

interface TaskWithProject extends TaskWithAttemptStatus {
  projectName?: string;
}

interface RecentTasksProps {
  limit?: number;
  className?: string;
}

const TASK_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'inprogress', title: 'In Progress' },
  { id: 'inreview', title: 'In Review' },
  { id: 'done', title: 'Done' },
] as const;

export function RecentTasks({ limit = 20, className }: RecentTasksProps) {
  const navigate = useNavigate();
  const { isTaskArchived } = useArchive();
  const [allTasks, setAllTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllTasks = useCallback(async () => {
    try {
      setLoading(true);
      // First fetch all projects
      const projectsData = await projectsApi.getAll();
      
      // Then fetch tasks for each project
      const allTasksPromises = projectsData.map(project => 
        tasksApi.getAll(project.id).then(tasks => 
          tasks.map(task => ({
            ...task,
            projectName: project.name
          }))
        ).catch(() => []) // Return empty array if project fetch fails
      );
      
      const tasksArrays = await Promise.all(allTasksPromises);
      const combinedTasks = tasksArrays.flat();
      setAllTasks(combinedTasks);
    } catch (err) {
      console.error('Failed to fetch tasks for recent view:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllTasks();
    const interval = setInterval(fetchAllTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchAllTasks]);

  const tasksByStatus = useMemo(() => {
    // Filter out cancelled and archived tasks and get recent ones
    const recentTasks = [...allTasks]
      .filter(task => task.status !== 'cancelled' && !isTaskArchived(task.id))
      .sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);

    // Group by status
    const grouped: Record<string, TaskWithProject[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
    };

    recentTasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    return grouped;
  }, [allTasks, limit, isTaskArchived]);

  const handleTaskClick = useCallback((task: TaskWithProject) => {
    navigate(`/projects/${task.project_id}/tasks/${task.id}`);
  }, [navigate]);

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

  if (loading && allTasks.length === 0) {
    return null;
  }

  const hasAnyTasks = Object.values(tasksByStatus).some(tasks => tasks.length > 0);
  if (!hasAnyTasks) {
    return null;
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-4 gap-4">
          {TASK_COLUMNS.map(column => (
            <div key={column.id} className="flex flex-col">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {column.title}
              </h3>
              <div className="space-y-2">
                {tasksByStatus[column.id]?.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium line-clamp-2">
                        {task.title}
                      </h4>
                      {task.has_in_progress_attempt && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
                          Running
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {task.projectName && (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            {task.projectName}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(task.updated_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}