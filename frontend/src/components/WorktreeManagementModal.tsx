import React, { useState, useEffect } from 'react';
import { Trash2, GitBranch, FolderOpen, ExternalLink, GitCommit, ChevronRight, AlertTriangle, CheckSquare, Square } from 'lucide-react';
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
import { CommitDetailsModal } from '@/components/tasks/CommitDetailsModal';
import { Checkbox } from '@/components/ui/checkbox';

interface BranchInfo {
  branch_name: string;
  project_id: string;
  project_name: string;

  // Worktree information (if exists)
  worktree_path?: string;
  worktree_exists: boolean;

  // Task/attempt information (if branch is associated with a task)
  task_id?: string;
  task_title?: string;
  task_status?: TaskStatus;
  attempt_id?: string;
  attempt_deleted: boolean;

  // PR information
  pr_url?: string;
  pr_status?: string;
  pr_merged_at?: string;
  merge_commit?: string;
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
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    branch?: BranchInfo;
    action: 'worktree' | 'branch' | 'both';
  } | null>(null);
  const [showCommitDetailsModal, setShowCommitDetailsModal] = useState(false);
  const [selectedCommitBranch, setSelectedCommitBranch] = useState<BranchInfo | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{
    branches: BranchInfo[];
    action: 'worktree' | 'branch' | 'both';
  } | null>(null);
  const [isShiftHovering, setIsShiftHovering] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const navigate = useNavigate();

  // Group branches by task, but put orphaned ones in a separate group
  const groupedBranches = branches.reduce((acc, branch) => {
    const isOrphaned = !branch.task_id;
    const groupKey = isOrphaned ? 'orphaned' : branch.task_id!;

    if (!acc[groupKey]) {
      acc[groupKey] = {
        task_title: isOrphaned ? 'Orphaned Branches' : branch.task_title || 'Unknown Task',
        task_status: isOrphaned ? 'todo' as TaskStatus : branch.task_status || 'todo' as TaskStatus,
        task_id: isOrphaned ? undefined : branch.task_id,
        branches: [],
      };
    }
    acc[groupKey].branches.push(branch);
    return acc;
  }, {} as Record<string, { task_title: string; task_status: TaskStatus; task_id?: string; branches: BranchInfo[] }>);

  // Sort groups to put orphaned at the end
  const sortedGroups = Object.entries(groupedBranches).sort(([a], [b]) => {
    if (a === 'orphaned') return 1;
    if (b === 'orphaned') return -1;
    return 0;
  });

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
    } else {
      // Clear selections when modal closes
      setSelectedBranches(new Set());
      setIsSelectionMode(false);
    }
  }, [isOpen]);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      // Use project-specific endpoint when projectId is available
      const url = projectId 
        ? `/api/branches?project_id=${projectId}`
        : '/api/branches';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch branches');
      const data = await response.json();
      
      // Filter to only show Vibe Kanban branches (those starting with "vk-")
      const vibeKanbanBranches = (data.data || []).filter((branch: BranchInfo) => 
        branch.branch_name.startsWith('vk-')
      );
      
      setBranches(vibeKanbanBranches);
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleBranchSelection = (branchName: string) => {
    const newSelected = new Set(selectedBranches);
    if (newSelected.has(branchName)) {
      newSelected.delete(branchName);
    } else {
      newSelected.add(branchName);
    }
    setSelectedBranches(newSelected);
  };

  const selectAllInGroup = (branchesInGroup: BranchInfo[]) => {
    const newSelected = new Set(selectedBranches);
    const deletableBranches = branchesInGroup.filter(b => !b.pr_merged_at);
    deletableBranches.forEach(b => newSelected.add(b.branch_name));
    setSelectedBranches(newSelected);
  };

  const deselectAllInGroup = (branchesInGroup: BranchInfo[]) => {
    const newSelected = new Set(selectedBranches);
    branchesInGroup.forEach(b => newSelected.delete(b.branch_name));
    setSelectedBranches(newSelected);
  };

  const getSelectedBranchesData = (): BranchInfo[] => {
    return branches.filter(b => selectedBranches.has(b.branch_name));
  };

  const handleBatchDelete = () => {
    const selectedBranchesData = getSelectedBranchesData();
    if (selectedBranchesData.length === 0) return;

    // Determine default action based on what exists
    const hasWorktrees = selectedBranchesData.some(b => b.worktree_exists && b.worktree_path);
    const hasBranchOnly = selectedBranchesData.some(b => !b.worktree_path || !b.worktree_exists);

    let action: 'worktree' | 'branch' | 'both' = 'worktree';
    if (hasWorktrees && !hasBranchOnly) {
      action = 'worktree';
    } else if (!hasWorktrees && hasBranchOnly) {
      action = 'branch';
    } else {
      // Mixed - default to worktree only for safety
      action = 'worktree';
    }

    setBulkDeleteConfirm({ branches: selectedBranchesData, action });
  };


  const handleTaskNavigation = async (taskId: string) => {
    try {
      // Fetch task details to get project ID
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) throw new Error('Failed to fetch task details');
      const data = await response.json();
      const task = data.data;

      // Navigate to the task
      navigate(`/projects/${task.project_id}/tasks/${taskId}`);
      onClose();
    } catch (error) {
      console.error('Error navigating to task:', error);
    }
  };

  const openCommitModal = (branch: BranchInfo) => {
    if (branch.merge_commit && branch.task_id && branch.attempt_id) {
      setSelectedCommitBranch(branch);
      setShowCommitDetailsModal(true);
    }
  };

  // Removed handleDeleteWorktree and handleDeleteBranch - now using unified handleDelete

  const handleDelete = async (branch: BranchInfo, action: 'worktree' | 'branch' | 'both') => {
    setDeleteConfirm(null);

    try {
      const response = await fetch('/api/branches/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_name: branch.branch_name,
          project_id: branch.project_id,
          delete_worktree: action === 'worktree' || action === 'both',
          delete_branch: action === 'branch' || action === 'both',
          force: true, // Always use force deletion to handle unmerged branches
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Delete operation failed:', error);
        alert(`Failed to delete: ${error.error || 'Unknown error'}`);
        return;
      }

      // Refresh the list after successful deletion
      await fetchBranches();
    } catch (error) {
      console.error('Error during delete operation:', error);
      alert(`Error during delete: ${error}`);
    }
  };

  const handleBulkDelete = async (branchesToDelete: BranchInfo[], action: 'worktree' | 'branch' | 'both') => {
    setBulkDeleteConfirm(null);

    const errors: string[] = [];
    let successCount = 0;

    for (const branch of branchesToDelete) {
      try {
        const response = await fetch('/api/branches/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_name: branch.branch_name,
            project_id: branch.project_id,
            delete_worktree: action === 'worktree' || action === 'both',
            delete_branch: action === 'branch' || action === 'both',
            force: true,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          errors.push(`${branch.branch_name}: ${error.error || 'Unknown error'}`);
        } else {
          successCount++;
        }
      } catch (error) {
        errors.push(`${branch.branch_name}: ${error}`);
      }
    }

    // Show summary
    if (errors.length > 0) {
      alert(`Deleted ${successCount} of ${branchesToDelete.length} items.\n\nErrors:\n${errors.join('\n')}`);
    } else {
      console.log(`Successfully deleted ${successCount} items`);
    }

    // Clear selections after deletion
    setSelectedBranches(new Set());
    setIsSelectionMode(false);

    // Refresh the list after operations
    await fetchBranches();
  };


  const getPRStatusBadge = (branch: BranchInfo) => {
    if (branch.pr_merged_at) {
      return <Badge className="bg-purple-500">Merged</Badge>;
    }
    if (branch.pr_status === 'open') {
      return <Badge className="bg-blue-500">PR Open</Badge>;
    }
    if (branch.pr_status === 'closed') {
      return <Badge className="bg-gray-500">PR Closed</Badge>;
    }
    return null;
  };

  // Removing formatTimeAgo since we don't have created_at in BranchInfo
  // and orphaned branches shouldn't show timestamps anyway

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose} className="max-w-none w-[35vw]">
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between mb-2">
              <DialogTitle>
                {projectId ? 'Project Worktree Management' : 'All Worktrees'}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {isSelectionMode && selectedBranches.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBatchDelete}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Selected ({selectedBranches.size})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={isSelectionMode ? "default" : "outline"}
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    if (isSelectionMode) {
                      setSelectedBranches(new Set());
                    }
                  }}
                >
                  {isSelectionMode ? (
                    <>
                      <CheckSquare className="w-4 h-4 mr-1" />
                      Exit Selection
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 mr-1" />
                      Select Items
                    </>
                  )}
                </Button>
              </div>
            </div>
            <DialogDescription>
              Manage worktrees and branches created by Vibe Kanban (branches starting with "vk-")
              {isSelectionMode && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  • Selection mode active - click checkboxes to select items for batch deletion
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-8">Loading branches...</div>
          ) : (
            <div className="space-y-6">
              {sortedGroups.map(([taskId, taskData]) => {
                const isOrphanedGroup = taskId === 'orphaned';
                const deletableBranchesInGroup = taskData.branches.filter(b => !b.pr_merged_at);
                const selectedInGroup = deletableBranchesInGroup.filter(b => selectedBranches.has(b.branch_name));
                const allSelectedInGroup = deletableBranchesInGroup.length > 0 && 
                  deletableBranchesInGroup.every(b => selectedBranches.has(b.branch_name));
                const someSelectedInGroup = selectedInGroup.length > 0 && !allSelectedInGroup;

                return (
                  <div key={taskId} className={`border rounded-lg p-4 flex flex-col ${isOrphanedGroup ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isSelectionMode && deletableBranchesInGroup.length > 0 && (
                          <Checkbox
                            checked={allSelectedInGroup}
                            onCheckedChange={(checked) => {
                              if (checked || someSelectedInGroup) {
                                selectAllInGroup(taskData.branches);
                              } else {
                                deselectAllInGroup(taskData.branches);
                              }
                            }}
                            className={someSelectedInGroup ? 'data-[state=checked]:bg-blue-400' : ''}
                          />
                        )}
                        {isOrphanedGroup ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 cursor-help underline decoration-dotted">
                                  {taskData.task_title}
                                  {isSelectionMode && selectedInGroup.length > 0 && (
                                    <span className="ml-2 text-sm font-normal">
                                      ({selectedInGroup.length} selected)
                                    </span>
                                  )}
                                </h3>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>Orphaned branches are Vibe Kanban branches (vk-*) that don't match any task in the database.</p>
                                <p className="mt-1 text-xs text-gray-400">They may be from deleted tasks or tasks that were removed from the database.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <h3 className="font-semibold">
                            {taskData.task_title}
                            {isSelectionMode && selectedInGroup.length > 0 && (
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                ({selectedInGroup.length} selected)
                              </span>
                            )}
                          </h3>
                        )}
                      </div>
                      {isOrphanedGroup && !isSelectionMode ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={isShiftHovering ? "destructive" : "outline"}
                                className={isShiftHovering 
                                  ? "h-8 px-2" 
                                  : "h-8 px-2 text-yellow-700 dark:text-yellow-300 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Filter branches that can be deleted (not merged)
                                  const deletableBranches = taskData.branches.filter(b => !b.pr_merged_at);
                                  if (deletableBranches.length === 0) {
                                    alert('No orphaned branches to delete (all are merged)');
                                    return;
                                  }

                                  if (e.shiftKey) {
                                    setBulkDeleteConfirm({ branches: deletableBranches, action: 'both' });
                                  } else {
                                    // Determine default action based on what exists
                                    const hasWorktrees = deletableBranches.some(b => b.worktree_exists && b.worktree_path);
                                    const hasBranchOnly = deletableBranches.some(b => !b.worktree_path || !b.worktree_exists);

                                    if (hasWorktrees && !hasBranchOnly) {
                                      setBulkDeleteConfirm({ branches: deletableBranches, action: 'worktree' });
                                    } else if (!hasWorktrees && hasBranchOnly) {
                                      setBulkDeleteConfirm({ branches: deletableBranches, action: 'branch' });
                                    } else {
                                      // Mixed - default to worktree only for safety
                                      setBulkDeleteConfirm({ branches: deletableBranches, action: 'worktree' });
                                    }
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (e.shiftKey) {
                                    setIsShiftHovering(true);
                                  }
                                }}
                                onMouseLeave={() => {
                                  setIsShiftHovering(false);
                                }}
                                onMouseMove={(e) => {
                                  setIsShiftHovering(e.shiftKey);
                                }}
                              >
                                {isShiftHovering ? (
                                  <AlertTriangle className="w-4 h-4 mr-1" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mr-1" />
                                )}
                                Delete All
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete all orphaned worktrees</p>
                              <p className="text-xs text-gray-400">Shift+Click to delete both worktrees and branches</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        taskData.task_id && !isSelectionMode && (
                          <button
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                            onClick={() => handleTaskNavigation(taskData.task_id!)}
                            title="View Task"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        )
                      )}
                    </div>

                  <div className="space-y-2 overflow-y-auto max-h-48">
                    {taskData.branches.map((branch) => {
                      const isOrphaned = !branch.task_id;
                      const isGhost = !branch.worktree_exists || !branch.worktree_path;
                      const canDelete = !branch.pr_merged_at;

                      return (
                        <div
                          key={branch.attempt_id || branch.branch_name}
                          className={`group relative flex items-center justify-between p-3 rounded-lg border transition-all ${
                            isGhost
                              ? 'bg-gray-50/50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-600'
                              : isOrphaned
                              ? 'bg-transparent border-yellow-400 dark:border-yellow-600'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                          } ${selectedBranches.has(branch.branch_name) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {isSelectionMode && canDelete && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedBranches.has(branch.branch_name)}
                                  onCheckedChange={() => toggleBranchSelection(branch.branch_name)}
                                />
                              </div>
                            )}
                            <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <GitBranch className={`w-4 h-4 ${isGhost ? 'text-gray-400 dark:text-gray-500' : isOrphaned ? 'text-yellow-600 dark:text-yellow-400' : ''}`} />
                              <code className={`text-sm ${isGhost ? 'text-gray-500 dark:text-gray-400' : isOrphaned ? 'text-yellow-900 dark:text-yellow-200' : ''}`}>
                                {branch.branch_name}
                              </code>
                              {getPRStatusBadge(branch)}
                              {branch.merge_commit && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        className="bg-purple-500 hover:bg-purple-600 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openCommitModal(branch);
                                        }}
                                      >
                                        <GitCommit className="w-3 h-3 mr-1" />
                                        {branch.merge_commit.substring(0, 7)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View merge commit on GitHub</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                              {branch.worktree_path && (
                                <span className="flex items-center gap-1">
                                  <FolderOpen className={`w-3 h-3 ${isGhost ? 'text-gray-400 dark:text-gray-500' : isOrphaned ? 'text-yellow-600 dark:text-yellow-400' : ''}`} />
                                  {branch.worktree_exists ? (
                                    <span className="text-green-600 dark:text-green-400">Worktree exists</span>
                                  ) : (
                                    <span className="text-orange-500 dark:text-orange-400">Worktree missing</span>
                                  )}
                                </span>
                              )}
                              {!branch.worktree_path && (
                                <span className="flex items-center gap-1">
                                  <GitBranch className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                  <span className="text-gray-500 dark:text-gray-400">Branch only</span>
                                </span>
                              )}
                              {branch.pr_url && (
                                <a
                                  href={branch.pr_url}
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
                          </div>

                          <div className="flex items-center gap-1">
                            {canDelete && !isSelectionMode && (
                              <>
                                {branch.worktree_exists && branch.worktree_path && (
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
                                              setDeleteConfirm({ branch, action: 'both' });
                                            } else {
                                              setDeleteConfirm({ branch, action: 'worktree' });
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

                                {(isGhost || !branch.worktree_path) && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 text-gray-500"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm({ branch, action: 'branch' });
                                          }}
                                        >
                                          <Trash2 className="w-4 h-4" />
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
                );
              })}

              {Object.keys(groupedBranches).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No branches found
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Commit Details Modal */}
      {selectedCommitBranch && selectedCommitBranch.merge_commit && selectedCommitBranch.task_id && selectedCommitBranch.attempt_id && (
        <CommitDetailsModal
          isOpen={showCommitDetailsModal}
          onOpenChange={setShowCommitDetailsModal}
          commitSha={selectedCommitBranch.merge_commit}
          projectId={selectedCommitBranch.project_id}
          taskId={selectedCommitBranch.task_id}
          attemptId={selectedCommitBranch.attempt_id}
        />
      )}

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
                  <code className="text-xs">{deleteConfirm.branch?.worktree_path}</code>
                  <br />
                  The branch will be preserved for future use.
                </>
              )}
              {deleteConfirm?.action === 'branch' && (
                <>
                  This will permanently delete the branch:
                  <br />
                  <code className="text-xs">{deleteConfirm.branch?.branch_name}</code>
                  <br />
                  This action cannot be undone.
                </>
              )}
              {deleteConfirm?.action === 'both' && (
                <>
                  This will delete both the worktree and the branch:
                  <br />
                  <code className="text-xs">{deleteConfirm.branch?.branch_name}</code>
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
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.branch!, deleteConfirm.action)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={!!bulkDeleteConfirm} onOpenChange={() => setBulkDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Batch Delete Confirmation
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>
                You have selected {bulkDeleteConfirm?.branches.length} item(s) for deletion:
              </p>
              <div className="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50 dark:bg-gray-900">
                {bulkDeleteConfirm?.branches.map((branch) => (
                  <div key={branch.branch_name} className="text-xs font-mono py-0.5 flex items-center gap-2">
                    <GitBranch className="w-3 h-3" />
                    {branch.branch_name}
                    {branch.worktree_exists && (
                      <Badge className="text-[10px] py-0 px-1">worktree</Badge>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="font-medium">What would you like to delete?</p>
                <div className="flex gap-2">
                  {bulkDeleteConfirm?.branches.some(b => b.worktree_exists && b.worktree_path) && (
                    <Button
                      size="sm"
                      variant={bulkDeleteConfirm?.action === 'worktree' ? 'default' : 'outline'}
                      onClick={() => setBulkDeleteConfirm({
                        ...bulkDeleteConfirm,
                        action: 'worktree'
                      })}
                    >
                      Worktrees Only
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={bulkDeleteConfirm?.action === 'branch' ? 'default' : 'outline'}
                    onClick={() => setBulkDeleteConfirm({
                      ...bulkDeleteConfirm!,
                      action: 'branch'
                    })}
                  >
                    Branches Only
                  </Button>
                  {bulkDeleteConfirm?.branches.some(b => b.worktree_exists && b.worktree_path) && (
                    <Button
                      size="sm"
                      variant={bulkDeleteConfirm?.action === 'both' ? 'destructive' : 'outline'}
                      onClick={() => setBulkDeleteConfirm({
                        ...bulkDeleteConfirm,
                        action: 'both'
                      })}
                    >
                      Both Worktrees & Branches
                    </Button>
                  )}
                </div>
              </div>
              {bulkDeleteConfirm?.action === 'worktree' && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ℹ️ The branches will be preserved for future use.
                </p>
              )}
              {(bulkDeleteConfirm?.action === 'branch' || bulkDeleteConfirm?.action === 'both') && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  ⚠️ This action cannot be undone. Branches will be permanently deleted.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteConfirm && handleBulkDelete(bulkDeleteConfirm.branches, bulkDeleteConfirm.action)}
              disabled={!bulkDeleteConfirm?.action}
            >
              Delete Selected ({bulkDeleteConfirm?.branches.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
