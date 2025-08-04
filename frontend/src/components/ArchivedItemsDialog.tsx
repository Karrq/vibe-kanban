import { Archive, RotateCcw } from 'lucide-react';
import type { TaskWithAttemptStatus, Project } from 'shared/types';
import { useArchive } from '@/hooks/useArchive';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ArchivedItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'tasks' | 'projects';
  tasks?: TaskWithAttemptStatus[];
  projects?: Project[];
  projectId?: string; // Optional project ID for filtering tasks
}

export function ArchivedItemsDialog({
  open,
  onOpenChange,
  mode,
  tasks = [],
  projects = [],
  projectId,
}: ArchivedItemsDialogProps) {
  const { getArchivedTasks, isProjectArchived, unarchiveTask, unarchiveProject } = useArchive();

  const archivedTasks = getArchivedTasks(tasks, projectId);
  const archivedProjects = projects.filter(project => isProjectArchived(project.id));

  const handleUnarchiveTask = (taskId: string) => {
    unarchiveTask(taskId);
  };

  const handleUnarchiveProject = (projectId: string) => {
    unarchiveProject(projectId);
  };

  const title = mode === 'tasks' ? 'Archived Tasks' : 'Archived Projects';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto pr-4">
          {mode === 'tasks' ? (
            archivedTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No archived tasks
              </div>
            ) : (
              <div className="space-y-2">
                {archivedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium">{task.title}</h4>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnarchiveTask(task.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Unarchive
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : (
            archivedProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No archived projects
              </div>
            ) : (
              <div className="space-y-2">
                {archivedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium">{project.name}</h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnarchiveProject(project.id)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Unarchive
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}