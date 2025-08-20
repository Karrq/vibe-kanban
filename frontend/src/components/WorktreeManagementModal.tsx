import React, { useState, useEffect } from 'react';
import { Trash2, GitBranch, FolderOpen, ExternalLink, GitCommit, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TaskStatus } from 'shared/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface WorktreeInfo {
  attempt_id: string;
  task_id: string;
  task_title: string;
  task_status: TaskStatus;
  branch: string;
  worktree_path: string;
  worktree_exists: boolean;
  worktree_deleted: boolean;
  pr_url?: string;
  pr_status?: string;
  pr_merged_at?: string;
  merge_commit?: string;
  created_at: string;
}

interface WorktreeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

export const WorktreeManagementModal: React.FC<WorktreeManagementModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    worktree?: WorktreeInfo;
    action: 'worktree' | 'branch' | 'both';
  } | null>(null);
  const navigate = useNavigate();

  // Group worktrees by task
  const groupedWorktrees = worktrees.reduce((acc, worktree) => {
    if (!acc[worktree.task_id]) {
      acc[worktree.task_id] = {
        task_title: worktree.task_title,
        task_status: worktree.task_status,
        attempts: [],
      };
    }
    acc[worktree.task_id].attempts.push(worktree);
    return acc;
  }, {} as Record<string, { task_title: string; task_status: TaskStatus; attempts: WorktreeInfo[] }>);

  useEffect(() => {
    if (isOpen) {
      fetchWorktrees();
    }
  }, [isOpen]);

  const fetchWorktrees = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/worktrees');
      if (!response.ok) throw new Error('Failed to fetch worktrees');
      const data = await response.json();
      setWorktrees(data.data || []);
    } catch (error) {
      console.error('Error fetching worktrees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAttemptClick = async (worktree: WorktreeInfo) => {
    // Check if this is an orphaned worktree (no task_id)
    if (!worktree.task_id || worktree.task_id === '00000000-0000-0000-0000-000000000000') {
      console.log('Cannot navigate to orphaned worktree');
      return;
    }
    
    try {
      // Fetch task details to get project ID
      const response = await fetch(`/api/tasks/${worktree.task_id}`);
      if (!response.ok) throw new Error('Failed to fetch task details');
      const data = await response.json();
      const task = data.data;
      
      // Navigate to the task with the attempt loaded
      navigate(`/projects/${task.project_id}/tasks/${worktree.task_id}`);
      onClose();
    } catch (error) {
      console.error('Error navigating to task:', error);
    }
  };

  const openCommitInGitHub = (worktree: WorktreeInfo) => {
    if (worktree.merge_commit && worktree.pr_url) {
      // Extract GitHub URL parts from PR URL
      const prUrlMatch = worktree.pr_url.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull/);
      if (prUrlMatch) {
        const [, owner, repo] = prUrlMatch;
        const commitUrl = `https://github.com/${owner}/${repo}/commit/${worktree.merge_commit}`;
        window.open(commitUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleDeleteWorktree = async (worktree: WorktreeInfo) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${worktree.task_id}/attempts/${worktree.attempt_id}/delete-worktree`,
        { method: 'POST' }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete worktree');
      }
      
      // Update local state
      setWorktrees(prev => 
        prev.map(w => 
          w.attempt_id === worktree.attempt_id 
            ? { ...w, worktree_exists: false, worktree_deleted: true }
            : w
        )
      );
    } catch (error) {
      console.error('Error deleting worktree:', error);
    }
  };

  const handleDeleteBranch = async (worktree: WorktreeInfo) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${worktree.task_id}/attempts/${worktree.attempt_id}/delete-branch`,
        { method: 'POST' }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete branch');
      }
      
      // Remove from local state
      setWorktrees(prev => prev.filter(w => w.attempt_id !== worktree.attempt_id));
    } catch (error) {
      console.error('Error deleting branch:', error);
    }
  };

  const handleDelete = async (worktree: WorktreeInfo, action: 'worktree' | 'branch' | 'both') => {
    setDeleteConfirm(null);
    
    if (action === 'worktree' || action === 'both') {
      await handleDeleteWorktree(worktree);
    }
    
    if (action === 'branch' || action === 'both') {
      // For 'both', wait a bit for worktree deletion to complete
      if (action === 'both') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await handleDeleteBranch(worktree);
    }
  };

  const getTaskStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'todo': return 'bg-gray-500';
      case 'inprogress': return 'bg-blue-500';
      case 'inreview': return 'bg-yellow-500';
      case 'done': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getPRStatusBadge = (worktree: WorktreeInfo) => {
    if (worktree.pr_merged_at) {
      return <Badge className="bg-purple-500">Merged</Badge>;
    }
    if (worktree.pr_status === 'open') {
      return <Badge className="bg-blue-500">PR Open</Badge>;
    }
    if (worktree.pr_status === 'closed') {
      return <Badge className="bg-gray-500">PR Closed</Badge>;
    }
    return null;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
    ];
    
    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
      }
    }
    
    return 'just now';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Worktree Management</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-8">Loading worktrees...</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedWorktrees).map(([taskId, taskData]) => (
                <div key={taskId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getTaskStatusColor(taskData.task_status)}`} />
                      <h3 className="font-semibold">{taskData.task_title}</h3>
                      <Badge variant="outline">{taskData.task_status}</Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {taskData.attempts.map((worktree) => {
                      const isGhost = worktree.worktree_deleted && !worktree.worktree_exists;
                      const isOrphaned = worktree.task_title.startsWith('[Orphaned]');
                      const canDelete = !worktree.pr_merged_at;
                      const canNavigate = !isGhost && !isOrphaned;
                      
                      return (
                        <div
                          key={worktree.attempt_id}
                          className={`group relative flex items-center justify-between p-3 rounded-lg border transition-all ${
                            isGhost 
                              ? 'bg-gray-50/50 border-dashed border-gray-300' 
                              : isOrphaned
                              ? 'bg-yellow-50 border-yellow-300'
                              : 'hover:bg-gray-50 cursor-pointer'
                          }`}
                          onClick={(e) => {
                            // Don't navigate if clicking on action buttons or links
                            if ((e.target as HTMLElement).closest('button, a')) return;
                            if (canNavigate) handleAttemptClick(worktree);
                          }}
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <GitBranch className={`w-4 h-4 ${isGhost ? 'text-gray-400' : ''}`} />
                              <code className={`text-sm ${isGhost ? 'text-gray-500' : ''}`}>
                                {worktree.branch}
                              </code>
                              {isOrphaned && (
                                <Badge className="bg-yellow-500">Orphaned</Badge>
                              )}
                              {getPRStatusBadge(worktree)}
                              {worktree.merge_commit && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge 
                                        className="bg-purple-500 hover:bg-purple-600 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openCommitInGitHub(worktree);
                                        }}
                                      >
                                        <GitCommit className="w-3 h-3 mr-1" />
                                        {worktree.merge_commit.substring(0, 7)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View merge commit on GitHub</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {canNavigate && (
                                <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <FolderOpen className={`w-3 h-3 ${isGhost ? 'text-gray-400' : ''}`} />
                                {worktree.worktree_exists ? (
                                  <span className="text-green-600">Worktree exists</span>
                                ) : worktree.worktree_deleted ? (
                                  <span className="text-gray-500">Worktree deleted</span>
                                ) : (
                                  <span className="text-orange-500">Worktree missing</span>
                                )}
                              </span>
                              <span className={isGhost ? 'text-gray-400' : ''}>
                                Created {formatTimeAgo(worktree.created_at)}
                              </span>
                              {worktree.pr_url && (
                                <a
                                  href={worktree.pr_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  View PR
                                </a>
                              )}
                            </div>
                          </div>
                        
                          <div className="flex items-center gap-1">
                            {canDelete && (
                              <>
                                {worktree.worktree_exists && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (e.shiftKey) {
                                              setDeleteConfirm({ worktree, action: 'both' });
                                            } else {
                                              setDeleteConfirm({ worktree, action: 'worktree' });
                                            }
                                          }}
                                          onMouseEnter={(e) => {
                                            if (e.shiftKey) {
                                              (e.currentTarget as HTMLElement).classList.add('text-red-600');
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLElement).classList.remove('text-red-600');
                                          }}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Delete worktree</p>
                                        <p className="text-xs text-gray-400">Shift+Click to delete both worktree and branch</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                
                                {isGhost && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm({ worktree, action: 'branch' });
                                          }}
                                        >
                                          <GitBranch className="w-4 h-4 text-gray-500" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Delete branch</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {Object.keys(groupedWorktrees).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No worktrees found
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteConfirm?.action === 'worktree' && 'Delete Worktree'}
              {deleteConfirm?.action === 'branch' && 'Delete Branch'}
              {deleteConfirm?.action === 'both' && 'Delete Worktree and Branch'}
            </DialogTitle>
            <DialogDescription>
              {deleteConfirm?.action === 'worktree' && (
                <>
                  This will delete the worktree directory at:
                  <br />
                  <code className="text-xs">{deleteConfirm.worktree?.worktree_path}</code>
                  <br />
                  The branch will be preserved for future use.
                </>
              )}
              {deleteConfirm?.action === 'branch' && (
                <>
                  This will permanently delete the branch:
                  <br />
                  <code className="text-xs">{deleteConfirm.worktree?.branch}</code>
                  <br />
                  This action cannot be undone.
                </>
              )}
              {deleteConfirm?.action === 'both' && (
                <>
                  This will delete both the worktree and the branch:
                  <br />
                  <code className="text-xs">{deleteConfirm.worktree?.branch}</code>
                  <br />
                  This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.worktree!, deleteConfirm.action)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};