import { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MergeModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  taskDescription: string | null;
  onMergeWithCustomMessage: (title: string, description: string) => Promise<void>;
  onMergeDirect: () => Promise<void>;
  isLoading?: boolean;
}

export function MergeModal({
  isOpen,
  onOpenChange,
  taskTitle,
  taskDescription,
  onMergeWithCustomMessage,
  onMergeDirect,
  isLoading = false,
}: MergeModalProps) {
  const [commitTitle, setCommitTitle] = useState('');
  const [commitDescription, setCommitDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirectMerging, setIsDirectMerging] = useState(false);

  // Initialize with task title and description when modal opens
  useEffect(() => {
    if (isOpen) {
      setCommitTitle(taskTitle);
      setCommitDescription(taskDescription || '');
    }
  }, [isOpen, taskTitle, taskDescription]);

  const handleMergeWithCustomMessage = useCallback(async () => {
    if (!commitTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await onMergeWithCustomMessage(commitTitle.trim(), commitDescription.trim());
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to merge with custom message:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [commitTitle, commitDescription, onMergeWithCustomMessage, onOpenChange]);

  const handleMergeDirect = useCallback(async () => {
    setIsDirectMerging(true);
    try {
      await onMergeDirect();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to merge directly:', error);
    } finally {
      setIsDirectMerging(false);
    }
  }, [onMergeDirect, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleMergeWithCustomMessage();
      }
    },
    [handleMergeWithCustomMessage]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Merge Changes</DialogTitle>
          <DialogDescription>
            Customize your commit message or merge directly with the auto-generated message.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="commit-title">Commit Title</Label>
            <Input
              id="commit-title"
              value={commitTitle}
              onChange={(e) => setCommitTitle(e.target.value)}
              placeholder="Enter commit title"
              className="col-span-3"
              autoFocus
              disabled={isLoading || isSubmitting || isDirectMerging}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="commit-description">Commit Description</Label>
            <Textarea
              id="commit-description"
              value={commitDescription}
              onChange={(e) => setCommitDescription(e.target.value)}
              placeholder="Enter commit description (optional)"
              className="col-span-3 min-h-[100px]"
              disabled={isLoading || isSubmitting || isDirectMerging}
            />
          </div>
        </div>
        
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading || isSubmitting || isDirectMerging}
          >
            Cancel
          </Button>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  onClick={handleMergeDirect}
                  disabled={isLoading || isSubmitting || isDirectMerging}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  {isDirectMerging ? 'Merging...' : 'Quick Merge'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Merge with auto-generated commit message from task title and description</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleMergeWithCustomMessage}
                  disabled={!commitTitle.trim() || isLoading || isSubmitting || isDirectMerging}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  {isSubmitting ? 'Merging...' : 'Custom Merge'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Merge with your custom commit message</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}