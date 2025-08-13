import { useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ChevronRight, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsApi, tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types';

interface TaskWithProject extends TaskWithAttemptStatus {
  projectName?: string;
}

interface RecentTasksProps {
  limit?: number;
  className?: string;
}

export function RecentTasks({ limit = 10, className }: RecentTasksProps) {
  const navigate = useNavigate();
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

  const recentTasks = useMemo(() => {
    return [...allTasks]
      .sort((a, b) => {
        const dateA = new Date(a.updated_at).getTime();
        const dateB = new Date(b.updated_at).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);
  }, [allTasks, limit]);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'not_started':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'blocked':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'done':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'archived':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  if (loading && allTasks.length === 0) {
    return null;
  }

  if (recentTasks.length === 0) {
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
        <div className="space-y-2">
          {recentTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => handleTaskClick(task)}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium truncate">
                    {task.title}
                  </h4>
                  <Badge 
                    variant="secondary" 
                    className={cn("text-xs px-2 py-0", getStatusColor(task.status))}
                  >
                    {task.status.replace(/_/g, ' ')}
                  </Badge>
                  {task.has_in_progress_attempt && (
                    <Badge variant="outline" className="text-xs px-2 py-0">
                      Running
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {task.projectName && (
                    <div className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {task.projectName}
                      </span>
                    </div>
                  )}
                  {task.description && (
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimeAgo(task.updated_at)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}