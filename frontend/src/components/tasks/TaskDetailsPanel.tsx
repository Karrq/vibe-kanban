import { useEffect, useState } from 'react';
import TaskDetailsHeader from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import {
  getBackdropClasses,
  getTaskPanelClasses,
} from '@/lib/responsive-config';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import type { TaskWithAttemptStatus } from 'shared/types';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import RelatedTasksTab from '@/components/tasks/TaskDetails/RelatedTasksTab.tsx';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab.tsx';
import PlanTab from '@/components/tasks/TaskDetails/PlanTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import CollapsibleToolbar from '@/components/tasks/TaskDetails/CollapsibleToolbar.tsx';
import TaskDetailsProvider from '../context/TaskDetailsContextProvider.tsx';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
  projectId: string;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
}

export function TaskDetailsPanel({
  task,
  projectHasDevScript,
  projectId,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const { width, isResizing, handleMouseDown } = useResizablePanel();
  
  // Initialize with correct side-by-side state
  const [isSideBySide, setIsSideBySide] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280; // xl breakpoint
    }
    return false;
  });

  // Check if we're in side-by-side mode
  useEffect(() => {
    const checkMode = () => {
      setIsSideBySide(window.innerWidth >= 1280); // xl breakpoint
    };
    
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<
    'logs' | 'diffs' | 'related' | 'processes' | 'plan'
  >('logs');

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task?.id) {
      setActiveTab('logs');
    }
  }, [task?.id]);

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isDialogOpen]);

  return (
    <>
      {!task ? null : (
        <TaskDetailsProvider
          key={task.id}
          task={task}
          projectId={projectId}
          setShowEditorDialog={setShowEditorDialog}
          projectHasDevScript={projectHasDevScript}
        >
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div 
            className={getTaskPanelClasses(isSideBySide)}
            style={isSideBySide ? { width: `${width}px` } : undefined}
          >
            {/* Resize Handle - only visible in side-by-side mode */}
            {isSideBySide && (
              <div
                className={`absolute left-0 top-0 bottom-0 w-4 -ml-2 cursor-col-resize hover:bg-primary/5 transition-colors ${
                  isResizing ? 'bg-primary/10' : ''
                }`}
                onMouseDown={handleMouseDown}
              >
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-16 bg-border/50 rounded-full" />
                {isResizing && (
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-primary" />
                )}
              </div>
            )}
            
            <div className="flex flex-col h-full">
              <TaskDetailsHeader
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              <CollapsibleToolbar />

              <TabNavigation
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />

              {/* Tab Content */}
              <div
                className={`flex-1 flex flex-col min-h-0 ${activeTab === 'logs' ? 'p-4' : 'pt-4'}`}
              >
                {activeTab === 'diffs' ? (
                  <DiffTab />
                ) : activeTab === 'related' ? (
                  <RelatedTasksTab />
                ) : activeTab === 'processes' ? (
                  <ProcessesTab />
                ) : activeTab === 'plan' ? (
                  <PlanTab />
                ) : (
                  <LogsTab />
                )}
              </div>

              <TaskFollowUpSection />
            </div>
          </div>

          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
          />

          <DeleteFileConfirmationDialog />
        </TaskDetailsProvider>
      )}
    </>
  );
}
