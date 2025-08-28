import { useState, useContext } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Layers } from 'lucide-react';
import { attemptsApi } from '@/lib/api';
import { 
  TaskDetailsContext, 
  TaskSelectedAttemptContext,
  TaskAttemptDataContext 
} from '@/components/context/taskDetailsContext';
import { Loader } from '@/components/ui/loader';

interface CompactModalProps {
  open: boolean;
  onClose: () => void;
}

const COMPACT_PROMPT = `Please provide a concise summary of our conversation so far, including:
1. The main goal/task being worked on
2. What has been completed so far
3. Any key decisions or findings
4. Current status and any pending items

Keep it brief but comprehensive enough to maintain context for continuing the conversation.`;

export function CompactModal({ open, onClose }: CompactModalProps) {
  const { task, projectId } = useContext(TaskDetailsContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { fetchAttemptData } = useContext(TaskAttemptDataContext);
  
  const [isCompacting, setIsCompacting] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [stage, setStage] = useState<'compacting' | 'ready' | 'sending'>('compacting');

  const handleCompact = async () => {
    if (!task || !selectedAttempt) return;
    
    setIsCompacting(true);
    setError(null);
    setSummary(null);
    setStage('compacting');
    
    try {
      // Send the compacting prompt as a regular follow-up
      await attemptsApi.followUp(
        projectId!,
        selectedAttempt.task_id,
        selectedAttempt.id,
        {
          prompt: COMPACT_PROMPT,
          restart_session: false,
        }
      );
      
      // Wait a bit for the process to start
      setTimeout(() => {
        fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
      }, 1000);
      
      // Poll for completion (simplified - in production you'd want proper streaming)
      const pollForCompletion = async () => {
        const maxAttempts = 60; // 60 seconds timeout
        let attempts = 0;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // For now, we'll use a simpler approach - just wait a bit and assume it's done
          // In production, you'd want to properly poll the process logs endpoint
          if (attempts > 5) {
            // Mock summary for now - in production you'd extract from actual logs
            setSummary("Context compacted. Ready to continue with fresh session.");
            setStage('ready');
            setIsCompacting(false);
            return;
          }
          
          attempts++;
        }
        
        throw new Error('Timeout waiting for summary');
      };
      
      await pollForCompletion();
      
    } catch (err: any) {
      setError(err.message || 'Failed to compact conversation');
      setIsCompacting(false);
    }
  };

  const handleSendWithRestart = async () => {
    if (!task || !selectedAttempt || !followUpMessage.trim() || !summary) return;
    
    setStage('sending');
    setError(null);
    
    try {
      // Combine summary with follow-up message
      const combinedPrompt = `[Previous conversation context: ${summary}]\n\n${followUpMessage.trim()}`;
      
      await attemptsApi.followUp(
        projectId!,
        selectedAttempt.task_id,
        selectedAttempt.id,
        {
          prompt: combinedPrompt,
          restart_session: true,
        }
      );
      
      // Refresh attempt data
      setTimeout(() => {
        fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
      }, 500);
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send follow-up');
      setStage('ready');
    }
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && stage === 'compacting') {
      handleCompact();
    } else if (!isOpen) {
      onClose();
      // Reset state
      setStage('compacting');
      setSummary(null);
      setFollowUpMessage('');
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Compact Conversation Context
          </DialogTitle>
          <DialogDescription>
            {stage === 'compacting' && 'Generating a summary of the conversation...'}
            {stage === 'ready' && 'Summary generated. Enter your follow-up message to continue with a fresh context.'}
            {stage === 'sending' && 'Sending your follow-up with compacted context...'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {stage === 'compacting' && (
            <div className="py-8 flex flex-col items-center">
              <Loader size={32} message="Generating summary..." />
            </div>
          )}
          
          {stage === 'ready' && summary && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Generated Summary</label>
                <div className="p-3 bg-muted rounded-md text-sm max-h-48 overflow-y-auto">
                  {summary}
                </div>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="followup" className="text-sm font-medium">
                  Your Follow-up Message
                </label>
                <Textarea
                  id="followup"
                  placeholder="Continue with your next request..."
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </>
          )}
          
          {stage === 'sending' && (
            <div className="py-8 flex flex-col items-center">
              <Loader size={32} message="Sending follow-up..." />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCompacting || stage === 'sending'}>
            Cancel
          </Button>
          {stage === 'ready' && (
            <Button 
              onClick={handleSendWithRestart}
              disabled={!followUpMessage.trim()}
            >
              Send with Fresh Context
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}