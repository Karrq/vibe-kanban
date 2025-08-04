import { AlertCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import { useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext.ts';
import { Loader } from '@/components/ui/loader';

export function TaskFollowUpSection() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { attemptData, fetchAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // Generate a unique key for localStorage based on task and attempt
  const getDraftKey = useCallback(() => {
    if (!task || !selectedAttempt) return null;
    return `vibe-kanban-followup-draft-${task.id}-${selectedAttempt.id}`;
  }, [task, selectedAttempt]);

  // Load draft from localStorage when component mounts or task/attempt changes
  useEffect(() => {
    const draftKey = getDraftKey();
    if (draftKey) {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        setFollowUpMessage(savedDraft);
      }
    }
  }, [getDraftKey]);

  // Save draft to localStorage whenever message changes
  useEffect(() => {
    const draftKey = getDraftKey();
    if (draftKey) {
      if (followUpMessage.trim()) {
        localStorage.setItem(draftKey, followUpMessage);
      } else {
        localStorage.removeItem(draftKey);
      }
    }
  }, [followUpMessage, getDraftKey]);

  const canSendFollowUp = useMemo(() => {
    if (
      !selectedAttempt ||
      attemptData.processes.length === 0 ||
      isAttemptRunning ||
      isSendingFollowUp
    ) {
      return false;
    }

    const resumableCodingAgentProcesses = attemptData.processes.filter(
      (process) =>
        process.process_type === 'codingagent' &&
        (process.status === 'completed' || 
         process.status === 'killed' || 
         process.status === 'failed')
    );

    return resumableCodingAgentProcesses.length > 0;
  }, [
    selectedAttempt,
    attemptData.processes,
    isAttemptRunning,
    isSendingFollowUp,
  ]);

  const onSendFollowUp = async () => {
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      await attemptsApi.followUp(
        projectId!,
        selectedAttempt.task_id,
        selectedAttempt.id,
        {
          prompt: followUpMessage.trim(),
        }
      );
      setFollowUpMessage('');
      // Clear the draft from localStorage after successful send
      const draftKey = getDraftKey();
      if (draftKey) {
        localStorage.removeItem(draftKey);
      }
      fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
    } catch (error: unknown) {
      // @ts-expect-error it is type ApiError
      setFollowUpError(`Failed to start follow-up execution: ${error.message}`);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  return (
    selectedAttempt && (
      <div className="border-t p-4">
        <div className="space-y-2">
          {followUpError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{followUpError}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2 items-start">
            <FileSearchTextarea
              placeholder="Continue working on this task... Type @ to search files."
              value={followUpMessage}
              onChange={(value) => {
                setFollowUpMessage(value);
                if (followUpError) setFollowUpError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (
                    canSendFollowUp &&
                    followUpMessage.trim() &&
                    !isSendingFollowUp
                  ) {
                    onSendFollowUp();
                  }
                }
              }}
              className="flex-1 min-h-[40px] resize-none"
              disabled={!canSendFollowUp}
              projectId={projectId}
              rows={1}
              maxRows={6}
            />
            <Button
              onClick={onSendFollowUp}
              disabled={
                !canSendFollowUp || !followUpMessage.trim() || isSendingFollowUp
              }
              size="sm"
            >
              {isSendingFollowUp ? (
                <Loader size={16} className="mr-2" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  );
}
