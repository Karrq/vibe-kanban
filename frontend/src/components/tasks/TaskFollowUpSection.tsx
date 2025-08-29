import { AlertCircle, Send, RefreshCw, Info } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCompactState } from '@/hooks/useCompactState';

export function TaskFollowUpSection() {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { attemptData, fetchAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  
  const { compactedSummary, clearCompactedSummary } = useCompactState();

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

  // Track shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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

  const onSendFollowUp = async (forceRestartSession = false) => {
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      
      // Check if we have a compacted summary
      const shouldUseCompact = !!compactedSummary && !forceRestartSession;
      const shouldRestartSession = forceRestartSession || !!compactedSummary;
      
      await attemptsApi.followUp(
        projectId!,
        selectedAttempt.task_id,
        selectedAttempt.id,
        {
          prompt: followUpMessage.trim(),
          restart_session: shouldRestartSession,
          compact: shouldUseCompact,
        }
      );
      
      setFollowUpMessage('');
      
      // Clear the compacted summary after using it
      if (compactedSummary) {
        clearCompactedSummary();
      }
      
      // Clear the draft from localStorage after successful send
      const draftKey = getDraftKey();
      if (draftKey) {
        localStorage.removeItem(draftKey);
      }
      // Add a small delay to ensure the backend has created the process record
      setTimeout(() => {
        fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
      }, 500);
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
          {compactedSummary && (
            <Alert className="mb-2">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Conversation has been compacted. Your next message will start a fresh session with the summary.
              </AlertDescription>
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
                if (
                  e.key === 'Enter' &&
                  (e.metaKey || e.ctrlKey || e.shiftKey)
                ) {
                  e.preventDefault();
                  if (
                    canSendFollowUp &&
                    followUpMessage.trim() &&
                    !isSendingFollowUp
                  ) {
                    onSendFollowUp(e.shiftKey);
                  }
                }
              }}
              className="flex-1 min-h-[40px] resize-none"
              disabled={false}
              projectId={projectId}
              rows={1}
              maxRows={6}
            />
            <TooltipProvider>
              <Tooltip open={isButtonHovered && isShiftPressed}>
                <TooltipTrigger asChild>
                  <Button
                    onClick={(e) => onSendFollowUp(e.shiftKey)}
                    onMouseEnter={() => setIsButtonHovered(true)}
                    onMouseLeave={() => setIsButtonHovered(false)}
                    disabled={
                      !canSendFollowUp ||
                      !followUpMessage.trim() ||
                      isSendingFollowUp
                    }
                    size="sm"
                    variant={
                      isButtonHovered && isShiftPressed
                        ? 'secondary'
                        : 'default'
                    }
                  >
                    {isSendingFollowUp ? (
                      <Loader size={16} className="mr-2" />
                    ) : (
                      <>
                        {isButtonHovered && isShiftPressed ? (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Send
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start new session with given prompt</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    )
  );
}
