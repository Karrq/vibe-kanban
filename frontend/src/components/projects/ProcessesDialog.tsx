import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Square,
  AlertCircle,
  Server,
  Loader2,
  RefreshCw,
  Terminal,
  Code,
  Settings,
  Zap,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { processesApi } from '@/lib/api';
import type { ExecutionProcessStatus, ExecutionProcessWithTask } from 'shared/types';

interface ProcessesDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onProcessKilled?: () => void;
}

type ProcessCategory = 'devserver' | 'codingagent' | 'setupscript' | 'cleanupscript';

const categoryLabels: Record<ProcessCategory, string> = {
  devserver: 'Development Servers',
  codingagent: 'Coding Agents',
  setupscript: 'Setup Scripts',
  cleanupscript: 'Cleanup Scripts',
};

export function ProcessesDialog({ projectId, open, onClose, onProcessKilled }: ProcessesDialogProps) {
  const [processes, setProcesses] = useState<ExecutionProcessWithTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [killingProcessId, setKillingProcessId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<ProcessCategory>>(new Set(['devserver']));

  const getProcessIcon = (processType: string, executorType?: string | null) => {
    if (processType === 'devserver') {
      return <Server className="h-4 w-4" />;
    }
    if (processType === 'setupscript') {
      return <Settings className="h-4 w-4" />;
    }
    if (processType === 'cleanupscript') {
      return <Zap className="h-4 w-4" />;
    }
    if (processType === 'codingagent') {
      if (executorType?.includes('claude')) {
        return <Code className="h-4 w-4" />;
      }
      return <Terminal className="h-4 w-4" />;
    }
    return <Terminal className="h-4 w-4" />;
  };


  const getStatusVariant = (status: ExecutionProcessStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'running':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'killed':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // Return original string if invalid date
      }
      return date.toLocaleString();
    } catch {
      return dateString; // Return original string on error
    }
  };

  const fetchProcesses = useCallback(async () => {
    if (!open) return;
    
    setLoading(true);
    setError('');

    try {
      const result = await processesApi.listByProject(projectId);
      // Filter to only show running processes
      const runningProcesses = result.filter(p => p.status === 'running');
      setProcesses(runningProcesses);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
      setError(error instanceof Error ? error.message : 'Failed to load processes');
    } finally {
      setLoading(false);
    }
  }, [projectId, open]);

  const handleKillProcess = async (processId: string) => {
    setKillingProcessId(processId);
    try {
      await processesApi.kill(processId);
      await fetchProcesses();
      // Notify parent component that a process was killed
      if (onProcessKilled) {
        onProcessKilled();
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
      setError(error instanceof Error ? error.message : 'Failed to kill process');
    } finally {
      setKillingProcessId(null);
    }
  };

  const handleKillAllDevServers = async () => {
    const devServers = processes.filter(
      p => p.process_type === 'devserver' && 
           p.status === 'running'
    );
    
    if (devServers.length === 0) {
      setError('No running dev servers found');
      return;
    }

    // TODO: Replace with custom confirm modal to avoid alert text clipping issues
    if (!window.confirm(`Kill ${devServers.length} dev server(s)?`)) return;

    setLoading(true);
    try {
      await Promise.all(devServers.map(p => processesApi.kill(p.id)));
      await fetchProcesses();
      // Notify parent component that processes were killed
      if (onProcessKilled) {
        onProcessKilled();
      }
    } catch (error) {
      console.error('Failed to kill dev servers:', error);
      setError(error instanceof Error ? error.message : 'Failed to kill dev servers');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (category: ProcessCategory) => {
    const newOpenSections = new Set(openSections);
    if (newOpenSections.has(category)) {
      newOpenSections.delete(category);
    } else {
      newOpenSections.add(category);
    }
    setOpenSections(newOpenSections);
  };

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Group processes by category
  const processesByCategory = processes.reduce((acc, process) => {
    const category = process.process_type as ProcessCategory;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(process);
    return acc;
  }, {} as Record<ProcessCategory, ExecutionProcessWithTask[]>);

  const runningProcesses = processes.filter(p => p.status === 'running');
  const devServerCount = runningProcesses.filter(
    p => p.process_type === 'devserver'
  ).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Project Processes</span>
            <Badge variant="secondary">
              {runningProcesses.length} running
            </Badge>
          </DialogTitle>
          <DialogDescription>
            View and manage all running processes in this project
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 pb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProcesses}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {devServerCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleKillAllDevServers}
              disabled={loading}
            >
              <Square className="h-4 w-4 mr-2" />
              Kill All Dev Servers
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && processes.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : processes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No running processes found for this project</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.keys(processesByCategory) as ProcessCategory[]).map((category) => {
                const categoryProcesses = processesByCategory[category];
                if (!categoryProcesses || categoryProcesses.length === 0) return null;

                const isOpen = openSections.has(category);

                return (
                  <Collapsible
                    key={category}
                    open={isOpen}
                    onOpenChange={() => toggleSection(category)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted/50 rounded-lg transition-colors">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium text-sm">
                        {categoryLabels[category]} ({categoryProcesses.length})
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2">
                      {categoryProcesses.map((process) => (
                        <div
                          key={process.id}
                          className="border rounded-lg p-4 hover:bg-muted/30 transition-colors relative group"
                        >
                          {/* Kill button on hover */}
                          {process.status === 'running' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleKillProcess(process.id)}
                              disabled={killingProcessId === process.id}
                            >
                              {killingProcessId === process.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </Button>
                          )}

                          <div className="flex items-start gap-3 pr-10">
                            <div className="mt-1">
                              {getProcessIcon(process.process_type, process.executor_type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium text-sm">
                                  {process.task_title ? (
                                    <>{process.task_title}</>
                                  ) : (
                                    process.process_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                                  )}
                                </h3>
                                {process.executor_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {process.executor_type}
                                  </Badge>
                                )}
                                <Badge variant={getStatusVariant(process.status)} className="text-xs">
                                  {process.status}
                                </Badge>
                              </div>
                              {process.process_type !== 'devserver' && (
                                <>
                                  <p className="text-sm text-muted-foreground mt-1 font-mono">
                                    {process.command}
                                  </p>
                                  {process.args && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Args: {process.args}
                                    </p>
                                  )}
                                </>
                              )}
                              <div className="mt-2 text-xs text-muted-foreground">
                                <div className="flex gap-4">
                                  <span>Started: {formatDate(process.started_at)}</span>
                                  {process.completed_at && (
                                    <span>Completed: {formatDate(process.completed_at)}</span>
                                  )}
                                </div>
                              </div>
                              {process.exit_code !== null && process.exit_code !== undefined && (
                                <div className="mt-2">
                                  <Badge variant={process.exit_code === 0n ? 'secondary' : 'destructive'} className="text-xs">
                                    Exit code: {process.exit_code.toString()}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}