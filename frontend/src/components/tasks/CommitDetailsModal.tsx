import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader } from '@/components/ui/loader';
import { attemptsApi } from '@/lib/api';
import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard';
import type { CommitDetails, WorktreeDiff, FileDiff } from 'shared/types';
import { GitCommit, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommitDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  commitSha: string;
  projectId: string;
  taskId: string;
  attemptId: string;
}

export function CommitDetailsModal({
  isOpen,
  onOpenChange,
  commitSha,
  projectId,
  taskId,
  attemptId,
}: CommitDetailsModalProps) {
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [modalWidth, setModalWidth] = useState(896); // Default to original max-w-4xl (896px)
  const [isResizing, setIsResizing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Handle ESC key locally to prevent propagation to parent components
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
      }
    };

    // Use capture phase to intercept the event before it bubbles
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (isOpen && commitSha) {
      fetchCommitDetails();
    }
  }, [isOpen, commitSha]);

  const fetchCommitDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const details = await attemptsApi.getCommitDetails(
        projectId,
        taskId,
        attemptId,
        commitSha
      );
      setCommitDetails(details);
    } catch (err) {
      console.error('Failed to fetch commit details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch commit details');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySha = useCallback(async () => {
    if (!commitDetails) return;
    try {
      await navigator.clipboard.writeText(commitDetails.sha);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SHA:', err);
    }
  }, [commitDetails]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = modalWidth;
  }, [modalWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = (e.clientX - startXRef.current) * 2; // Multiply by 2 since we're resizing from the center
    const newWidth = Math.max(896, Math.min(window.innerWidth - 100, startWidthRef.current + deltaX));
    setModalWidth(newWidth);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Split commit message into title and body
  const { commitTitle, commitBody } = useMemo(() => {
    if (!commitDetails?.message) return { commitTitle: '', commitBody: '' };
    
    const lines = commitDetails.message.split('\n');
    const title = lines[0] || '';
    const body = lines.slice(1).join('\n').trim();
    
    return { commitTitle: title, commitBody: body };
  }, [commitDetails]);

  // Convert FileChange array to WorktreeDiff format for DiffCard
  const diffData = useMemo<WorktreeDiff | null>(() => {
    if (!commitDetails?.files) return null;
    
    const files: FileDiff[] = commitDetails.files.map(file => ({
      path: file.filename,
      chunks: file.chunks || []
    }));
    
    return { files };
  }, [commitDetails]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Modal */}
      <div
        ref={modalRef}
        className={cn(
          "relative z-[9999] bg-background shadow-lg rounded-lg flex flex-col max-h-[85vh] my-8",
          isResizing && "transition-none"
        )}
        style={{ 
          width: `${modalWidth}px`,
          maxWidth: '90vw'
        }}
      >
        {/* Close button */}
        <button
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Left resize handle - matching chat side view styling */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-4 -ml-2 cursor-col-resize hover:bg-primary/5 transition-colors ${
            isResizing ? 'bg-primary/10' : ''
          }`}
          onMouseDown={handleResizeStart}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-16 bg-border/50 rounded-full" />
          {isResizing && (
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-primary" />
          )}
        </div>
        
        {/* Right resize handle - matching chat side view styling */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-4 -mr-2 cursor-col-resize hover:bg-primary/5 transition-colors ${
            isResizing ? 'bg-primary/10' : ''
          }`}
          onMouseDown={handleResizeStart}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-16 bg-border/50 rounded-full" />
          {isResizing && (
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-primary" />
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col space-y-1.5 p-6 pb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <GitCommit className="h-5 w-5" />
            Commit Details
            {commitDetails && (
              <button
                onClick={handleCopySha}
                className={`ml-2 text-xs font-mono px-2 py-0.5 rounded transition-all duration-300 ${
                  copied
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'text-muted-foreground bg-muted/50 hover:bg-muted/80'
                }`}
                title={copied ? 'Copied!' : 'Click to copy full SHA'}
              >
                {copied && <Check className="inline h-3 w-3 mr-1" />}
                {commitDetails.sha.slice(0, 8)}
                {copied && <span className="ml-1 text-green-700">Copied!</span>}
              </button>
            )}
          </h3>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader message="Loading commit details..." size={32} />
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-destructive">
              <p>{error}</p>
            </div>
          )}

          {commitDetails && !loading && (
            <div className="flex flex-col gap-4">
            {/* Commit Message - single card with two sections like merge modal */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Commit Title
                  </label>
                  <div className="bg-background/50 rounded border border-border/50 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {commitTitle || '(No title)'}
                    </p>
                  </div>
                </div>
                
                {commitBody && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      Commit Description
                    </label>
                    <div className="bg-background/50 rounded border border-border/50 px-3 py-2 min-h-[80px]">
                      <pre className="text-sm whitespace-pre-wrap text-foreground/90">
                        {commitBody}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

              {/* File Changes using DiffCard */}
              {diffData && diffData.files.length > 0 && (
                <div className="flex flex-col">
                  <h4 className="text-sm font-medium mb-2 text-foreground">
                    Files Changed
                  </h4>
                  <DiffCard 
                    diff={diffData}
                    deletable={false}
                    compact={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}