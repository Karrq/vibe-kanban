import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GitBranch, Clock, Hash } from 'lucide-react';
import { CheckpointResponse } from 'shared/types';
import { formatDistanceToNow } from 'date-fns';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageIndex: number;
  checkpoint: CheckpointResponse | null;
  onConfirm: () => void;
  isLoading?: boolean;
};

export function ForkDialog({
  open,
  onOpenChange,
  messageIndex,
  checkpoint,
  onConfirm,
  isLoading = false,
}: Props) {
  const handleConfirm = () => {
    console.log('ForkDialog handleConfirm clicked', { messageIndex, checkpoint });
    onConfirm();
  };

  console.log('ForkDialog rendered', { open, messageIndex, checkpoint, isLoading });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Fork from Checkpoint
          </DialogTitle>
          <DialogDescription>
            Create a new independent branch from this checkpoint to explore an alternative approach.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <Label className="text-muted-foreground">Message Index:</Label>
              <span className="font-mono">{messageIndex}</span>
            </div>

            {checkpoint && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-muted-foreground">Checkpoint Time:</Label>
                  <span>
                    {formatDistanceToNow(new Date(Number(checkpoint.timestamp) * 1000), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-sm">
                  <GitBranch className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <Label className="text-muted-foreground">Commit:</Label>
                  <span className="font-mono text-xs break-all">
                    {checkpoint.commit_sha.substring(0, 8)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 text-sm">
            <p className="text-blue-900 dark:text-blue-200">
              <strong>What will happen:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-300 list-disc ml-4">
              <li>A new task attempt will be created with its own branch</li>
              {checkpoint ? (
                <li>The code will be restored to the exact state at message {checkpoint.message_index}</li>
              ) : (
                <li>The conversation history up to message {messageIndex} will be preserved</li>
              )}
              <li>You can continue with a different approach or prompt</li>
            </ul>
          </div>

          {!checkpoint && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm">
              <p className="text-yellow-900 dark:text-yellow-200">
                <strong>Note:</strong> No checkpoint exists at message {messageIndex}. 
                The fork will preserve the conversation history but won't restore file changes.
                Start with your current code state and the truncated conversation.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="gap-2"
          >
            <GitBranch className="h-4 w-4" />
            {isLoading ? 'Creating Fork...' : 'Create Fork'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}