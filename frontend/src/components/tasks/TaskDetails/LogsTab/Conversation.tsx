import { NormalizedConversationViewer } from '@/components/tasks/TaskDetails/LogsTab/NormalizedConversationViewer.tsx';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext.ts';
import { useTaskPlan } from '@/components/context/TaskPlanContext.ts';
import { Loader } from '@/components/ui/loader.tsx';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Prompt from './Prompt';
import ConversationEntry from './ConversationEntry';
import SessionRestartBanner from './SessionRestartBanner';
import { ConversationEntryDisplayType } from '@/lib/types';

function Conversation() {
  const { attemptData, isAttemptRunning } = useContext(TaskAttemptDataContext);
  const { isPlanningMode, latestProcessHasNoPlan } = useTaskPlan();
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [visibleRunningEntriesCount, setVisibleRunningEntriesCount] =
    useState(0);
  
  // Check if we're in side-by-side mode (desktop)
  const [isSideBySide, setIsSideBySide] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280; // xl breakpoint
    }
    return false;
  });

  useEffect(() => {
    const checkMode = () => {
      setIsSideBySide(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Callback to trigger auto-scroll when conversation updates
  const handleConversationUpdate = useCallback(() => {
    setConversationUpdateTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (shouldAutoScrollLogs && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [attemptData.allLogs, conversationUpdateTrigger, shouldAutoScrollLogs]);

  const handleLogsScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

      if (isAtBottom && !shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(true);
      } else if (!isAtBottom && shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(false);
      }
    }
  }, [shouldAutoScrollLogs]);

  // Get all coding agent processes (both executor and follow-up) in chronological order
  // Note: There can be multiple executor processes if the task was restarted
  const allProcessLogs = useMemo(
    () => {
      // Filter for all coding agent processes
      const codingAgentLogs = attemptData.allLogs.filter(
        (log) =>
          log.process_type.toLowerCase() === 'codingagent' &&
          (log.command === 'executor' || log.command === 'followup_executor')
      );
      
      // The logs from the backend should already be in chronological order
      // (sorted by created_at), but we'll keep them as-is
      // This ensures proper ordering: executor1 -> followups -> executor2 -> more followups
      return codingAgentLogs;
    },
    [attemptData.allLogs]
  );

  // Check for session restarts - identifies processes that start new sessions
  // This includes:
  // 1. New executor processes (not follow-ups) after the first one
  // 2. Follow-up processes with restart_session=true
  const sessionRestarts = useMemo(() => {
    const restarts = new Set<string>();
    
    // For each process, check if it should show a restart banner
    allProcessLogs.forEach((log, index) => {
      // Skip the very first process - it doesn't restart anything
      if (index === 0) return;
      
      // Check if this is a new executor (not a follow-up)
      // Any executor after the first one indicates a task restart
      if (log.command === 'executor') {
        restarts.add(String(log.id));
        return;
      }
      
      // For follow-ups, check the restart_session flag in args
      if (log.command === 'followup_executor') {
        // Try to get the process details from attemptData.processes
        // which includes the args field with restart_session flag
        const processDetails = attemptData.processes.find(p => p.id === String(log.id));
        if (processDetails && processDetails.args) {
          try {
            const args = JSON.parse(processDetails.args);
            // The args contains the operation_params which has restart_session
            if (args && args.restart_session === true) {
              restarts.add(String(log.id));
            }
          } catch (e) {
            // If we can't parse args, don't show restart banner
            console.debug('Could not parse process args:', e);
          }
        }
      }
    });
    
    return restarts;
  }, [allProcessLogs, attemptData.processes]);

  // Flatten all entries, keeping process info for each entry
  const allEntries = useMemo(() => {
    const entries: Array<ConversationEntryDisplayType> = [];
    allProcessLogs.forEach((log, processIndex) => {
      if (!log) return;
      if (log.status === 'running') return; // Skip static entries for running processes
      const processId = String(log.id); // Ensure string
      const entriesArr = log.normalized_conversation.entries || [];
      
      entriesArr.forEach((entry, entryIndex) => {
        entries.push({
          entry,
          processId,
          processPrompt: undefined, // Don't attach prompt to every entry
          processStatus: log.status,
          processIsRunning: false, // Only completed processes here
          process: log,
          isFirstInProcess: false, // Will be set correctly after sorting
          processIndex,
          entryIndex,
        });
      });
    });
    // Sort by timestamp (entries without timestamp go last)
    entries.sort((a, b) => {
      if (a.entry.timestamp && b.entry.timestamp) {
        return a.entry.timestamp.localeCompare(b.entry.timestamp);
      }
      if (a.entry.timestamp) return -1;
      if (b.entry.timestamp) return 1;
      return 0;
    });
    
    // After sorting, mark the actual first entry of each process and attach prompt
    const seenProcessIds = new Set<string>();
    const processPrompts = new Map<string, string | undefined>();
    
    // First, collect prompts for each process
    allProcessLogs.forEach(log => {
      if (log && log.normalized_conversation.prompt) {
        processPrompts.set(String(log.id), log.normalized_conversation.prompt);
      }
    });
    
    // Then mark first entries and attach prompts only to them
    entries.forEach(entry => {
      if (!seenProcessIds.has(entry.processId)) {
        entry.isFirstInProcess = true;
        entry.processPrompt = processPrompts.get(entry.processId);
        seenProcessIds.add(entry.processId);
      }
    });
    
    return entries;
  }, [allProcessLogs]);

  // Identify running processes (main + follow-ups)
  const runningProcessLogs = useMemo(
    () => allProcessLogs.filter((log) => log.status === 'running'),
    [allProcessLogs]
  );

  // Build a mapping of shell session IDs to their original commands
  const sessionIdToCommand = useMemo(() => {
    const mapping: Record<string, string> = {};
    
    // Check all entries from allEntries (not just visible ones)
    allEntries.forEach((item) => {
      const entry = item.entry;
      // Check any tool use that has a result containing a background session ID
      if (entry.entry_type?.type === 'tool_use' && entry.tool_result?.content) {
        // Look for the background session ID pattern in the output
        const sessionIdMatch = entry.tool_result.content.match(/Command running in background with ID:\s*([a-zA-Z0-9_-]+)/i);
        
        if (sessionIdMatch && sessionIdMatch[1]) {
          const sessionId = sessionIdMatch[1];
          let command: string | null = null;
          
          // Try to get the command from various sources
          // 1. From tool_args.command (for Bash tool)
          if (entry.tool_args?.command) {
            command = entry.tool_args.command;
          }
          // 2. From action_type if it's command_run
          else if (entry.entry_type.action_type?.action === 'command_run') {
            command = entry.entry_type.action_type.command;
          }
          
          if (command) {
            mapping[sessionId] = command;
          }
        }
      }
    });
    
    return mapping;
  }, [allEntries]);

  // Paginate: show only the last visibleCount entries
  const visibleEntries = useMemo(
    () => allEntries.slice(-(visibleCount - visibleRunningEntriesCount)),
    [allEntries, visibleCount, visibleRunningEntriesCount]
  );

  const renderedVisibleEntries = useMemo(
    () =>
      visibleEntries.map((entry, index) => {
        const showRestartBanner = entry.isFirstInProcess && sessionRestarts.has(entry.processId);
        return (
          <div key={entry.entry.timestamp || index}>
            {showRestartBanner && <SessionRestartBanner />}
            <ConversationEntry
              idx={index}
              item={entry}
              handleConversationUpdate={handleConversationUpdate}
              visibleEntriesLength={visibleEntries.length}
              runningProcessDetails={attemptData.runningProcessDetails}
              sessionIdToCommand={sessionIdToCommand}
            />
          </div>
        );
      }),
    [
      visibleEntries,
      handleConversationUpdate,
      attemptData.runningProcessDetails,
      sessionIdToCommand,
      sessionRestarts,
    ]
  );

  const renderedRunningProcessLogs = useMemo(() => {
    return runningProcessLogs.map((log, i) => {
      const runningProcess = attemptData.runningProcessDetails[String(log.id)];
      if (!runningProcess) return null;
      // For follow-up processes, always show the prompt (it's the user's follow-up message)
      // For the main process, only show if no completed entries exist
      const isFollowUp = log.command === 'followup_executor';
      const showPrompt =
        log.normalized_conversation.prompt &&
        (isFollowUp || !allEntries.some((e) => e.processId === String(log.id)));
      const showRestartBanner = sessionRestarts.has(String(log.id));
      return (
        <div key={String(log.id)} className={i > 0 ? 'mt-8' : ''}>
          {showRestartBanner && <SessionRestartBanner />}
          {showPrompt && (
            <Prompt prompt={log.normalized_conversation.prompt || ''} />
          )}
          <NormalizedConversationViewer
            executionProcess={runningProcess}
            onConversationUpdate={handleConversationUpdate}
            diffDeletable
            visibleEntriesNum={visibleCount}
            onDisplayEntriesChange={setVisibleRunningEntriesCount}
          />
        </div>
      );
    });
  }, [
    runningProcessLogs,
    attemptData.runningProcessDetails,
    handleConversationUpdate,
    allEntries,
    visibleCount,
    sessionRestarts,
  ]);

  // Check if we should show the status banner - only if the most recent process failed/stopped
  const getMostRecentProcess = () => {
    // Get the last process from allProcessLogs (which includes all executors and follow-ups)
    if (allProcessLogs.length > 0) {
      return allProcessLogs[allProcessLogs.length - 1];
    }
    return null;
  };

  const mostRecentProcess = getMostRecentProcess();
  const showStatusBanner =
    mostRecentProcess &&
    (mostRecentProcess.status === 'failed' ||
      mostRecentProcess.status === 'killed');

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleLogsScroll}
      className={isSideBySide ? "h-full overflow-y-auto overscroll-contain" : ""}
    >
      {visibleCount - visibleRunningEntriesCount < allEntries.length && (
        <div className="flex justify-center mb-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setVisibleCount((c) => c + 100)}
          >
            Load previous logs
          </Button>
        </div>
      )}
      {visibleEntries.length > 0 && (
        <div className="space-y-2">{renderedVisibleEntries}</div>
      )}
      {/* Render live viewers for running processes (after paginated list) */}
      {renderedRunningProcessLogs}
      {/* If nothing to show at all, show loader */}
      {visibleEntries.length === 0 && runningProcessLogs.length === 0 && (
        <Loader
          message={
            <>
              Coding Agent Starting
              <br />
              Initializing conversation...
            </>
          }
          size={48}
          className="py-8"
        />
      )}

      {/* Status banner for failed/stopped states - shown at bottom */}
      {showStatusBanner && mostRecentProcess && (
        <div className="mt-4 p-4 rounded-lg border">
          <p
            className={`text-lg font-semibold mb-2 ${
              mostRecentProcess.status === 'failed'
                ? 'text-destructive'
                : 'text-orange-600'
            }`}
          >
            {mostRecentProcess.status === 'failed'
              ? 'Coding Agent Failed'
              : 'Coding Agent Stopped'}
          </p>
          <p className="text-muted-foreground">
            {mostRecentProcess.status === 'failed'
              ? 'The coding agent encountered an error.'
              : 'The coding agent was stopped.'}
          </p>
        </div>
      )}

      {/* Warning banner for planning mode without plan */}
      {isPlanningMode && latestProcessHasNoPlan && !isAttemptRunning && (
        <div className="mt-4 p-4 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <p className="text-lg font-semibold text-orange-800 dark:text-orange-300">
              No Plan Generated
            </p>
          </div>
          <p className="text-orange-700 dark:text-orange-400">
            The last execution attempt did not produce a plan. Task creation is
            disabled until a plan is available. Try providing more specific
            instructions or check the conversation for any errors.
          </p>
        </div>
      )}
    </div>
  );
}

export default Conversation;
