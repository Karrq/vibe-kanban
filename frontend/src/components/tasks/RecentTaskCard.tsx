import { Badge } from '@/components/ui/badge';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskWithProject } from 'shared/types';

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