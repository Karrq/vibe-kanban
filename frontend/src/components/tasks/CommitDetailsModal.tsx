import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader } from '@/components/ui/loader';
import { attemptsApi } from '@/lib/api';
import { DiffCard } from '@/components/tasks/TaskDetails/DiffCard';
import type { CommitDetails, WorktreeDiff, FileDiff, DiffChunk } from 'shared/types';
import { GitCommit, Check } from 'lucide-react';

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
    
    const files: FileDiff[] = commitDetails.files.map(file => {
      const chunks: DiffChunk[] = [];
      
      if (file.patch) {
        // Check if this is a new file
        const isNewFile = file.status === 'added' || file.patch.includes('new file mode');
        
        // Parse the git patch format
        const lines = file.patch.split('\n');
        let inHunk = false;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Check for hunk header
          if (line.startsWith('@@')) {
            inHunk = true;
            // Parse the hunk header to understand if this is an addition-only hunk
            // Format: @@ -0,0 +1,3 @@ means adding 3 lines starting at line 1
            continue;
          }
          
          // Skip everything before the first hunk (git headers)
          if (!inHunk) {
            continue;
          }
          
          // Skip the "\ No newline at end of file" message
          if (line === '\\ No newline at end of file') {
            continue;
          }
          
          // For new files, the backend sometimes sends lines without + prefix
          // We need to detect this case
          const hasPrefix = line.startsWith('+') || line.startsWith('-') || line.startsWith(' ');
          
          if (!hasPrefix && isNewFile) {
            // New file content without prefix - treat as addition
            // Skip empty last line from split
            if (i === lines.length - 1 && line === '') {
              continue;
            }
            chunks.push({ 
              chunk_type: 'Insert', 
              content: line 
            });
          } else if (line.startsWith('+')) {
            // Addition line - strip the + and add as Insert
            chunks.push({ 
              chunk_type: 'Insert', 
              content: line.substring(1) 
            });
          } else if (line.startsWith('-')) {
            // Deletion line - strip the - and add as Delete
            chunks.push({ 
              chunk_type: 'Delete', 
              content: line.substring(1) 
            });
          } else if (line.startsWith(' ')) {
            // Context line - strip the space and add as Equal
            chunks.push({ 
              chunk_type: 'Equal', 
              content: line.substring(1) 
            });
          } else if (line === '') {
            // Empty line
            if (i === lines.length - 1) {
              // Skip empty last line from split
              continue;
            }
            // Real empty line in content
            if (isNewFile) {
              chunks.push({ 
                chunk_type: 'Insert', 
                content: '' 
              });
            } else {
              chunks.push({ 
                chunk_type: 'Equal', 
                content: '' 
              });
            }
          }
        }
      }
      
      return {
        path: file.filename,
        chunks
      };
    });
    
    return { files };
  }, [commitDetails]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
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
          </DialogTitle>
        </DialogHeader>

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
          <div className="flex flex-col gap-4 flex-1 min-h-0">
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
              <div className="flex-1 min-h-0 flex flex-col">
                <h4 className="text-sm font-medium mb-2 text-foreground">
                  Files Changed
                </h4>
                <div className="flex-1 overflow-y-auto">
                  <DiffCard 
                    diff={diffData}
                    deletable={false}
                    compact={false}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}