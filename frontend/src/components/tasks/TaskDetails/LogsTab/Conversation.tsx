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
import { AlertTriangle, ChevronDown } from 'lucide-react';
import ConversationEntry from './ConversationEntry';
import { ConversationEntryDisplayType } from '@/lib/types';

function Conversation() {
  const { attemptData, isAttemptRunning, loadAllLogs, allLogsLoaded } = useContext(TaskAttemptDataContext);
  const { isPlanningMode, latestProcessHasNoPlan } = useTaskPlan();
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [visibleRunningEntriesCount, setVisibleRunningEntriesCount] =
    useState(0);
  const [isLoadingAllLogs, setIsLoadingAllLogs] = useState(false);

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
  
  const handleLoadAllLogs = useCallback(async () => {
    setIsLoadingAllLogs(true);
    try {
      await loadAllLogs();
    } finally {
      setIsLoadingAllLogs(false);
    }
  }, [loadAllLogs]);

  // Find main and follow-up processes from allLogs
  const mainCodingAgentLog = useMemo(
    () =>
      attemptData.allLogs.find(
        (log) =>
          log.process_type.toLowerCase() === 'codingagent' &&
          log.command === 'executor'
      ),
    [attemptData.allLogs]
  );
  const followUpLogs = useMemo(
    () =>
      attemptData.allLogs.filter(
        (log) =>
          log.process_type.toLowerCase() === 'codingagent' &&
          log.command === 'followup_executor'
      ),
    [attemptData.allLogs]
  );
  
  // Check if there are more processes available to load
  const hasMoreProcesses = useMemo(() => {
    const totalProcesses = attemptData.processes.filter(
      p => p.process_type === 'codingagent'
    ).length;
    const loadedProcesses = attemptData.allLogs.filter(
      log => log.process_type.toLowerCase() === 'codingagent'
    ).length;
    return totalProcesses > loadedProcesses && !allLogsLoaded;
  }, [attemptData.processes, attemptData.allLogs, allLogsLoaded]);

  // Combine all logs in order (main first, then follow-ups)
  const allProcessLogs = useMemo(
    () =>
      [mainCodingAgentLog, ...followUpLogs].filter(Boolean) as Array<
        NonNullable<typeof mainCodingAgentLog>
      >,
    [mainCodingAgentLog, followUpLogs]
  );

  // Flatten all entries, keeping process info for each entry
  const allEntries = useMemo(() => {
    const entries: Array<ConversationEntryDisplayType> = [];
    allProcessLogs.forEach((log, processIndex) => {
      if (!log) return;
      if (log.status === 'running') return; // Skip static entries for running processes
      const processId = String(log.id); // Ensure string
      const processPrompt = log.normalized_conversation.prompt || undefined; // Ensure undefined, not null
      const entriesArr = log.normalized_conversation.entries || [];
      entriesArr.forEach((entry, entryIndex) => {
        entries.push({
          entry,
          processId,
          processPrompt,
          processStatus: log.status,
          processIsRunning: false, // Only completed processes here
          process: log,
          isFirstInProcess: entryIndex === 0,
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
    return entries;
  }, [allProcessLogs]);

  // Identify running processes (main + follow-ups)
  const runningProcessLogs = useMemo(
    () => allProcessLogs.filter((log) => log.status === 'running'),
    [allProcessLogs]
  );

  // Paginate: show only the last visibleCount entries
  const visibleEntries = useMemo(
    () => allEntries.slice(-(visibleCount - visibleRunningEntriesCount)),
    [allEntries, visibleCount, visibleRunningEntriesCount]
  );

  const renderedVisibleEntries = useMemo(
    () =>
      visibleEntries.map((entry, index) => (
        <ConversationEntry
          key={entry.entry.timestamp || index}
          idx={index}
          item={entry}
          handleConversationUpdate={handleConversationUpdate}
          visibleEntriesLength={visibleEntries.length}
          runningProcessDetails={attemptData.runningProcessDetails}
        />
      )),
    [
      visibleEntries,
      handleConversationUpdate,
      attemptData.runningProcessDetails,
    ]
  );

  const hasHiddenEntries = allEntries.length > visibleCount;

  return (
    <div className="flex flex-col h-full">
      {isPlanningMode && latestProcessHasNoPlan && (
        <div className="mb-4 p-3 border border-yellow-500/30 bg-yellow-500/10 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">
                Planning Mode - No Plan Found
              </p>
              <p className="text-yellow-700 mt-1">
                The executor is in planning mode but the latest process did not
                produce a plan. Consider switching to a different executor
                mode.
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto space-y-2"
        ref={scrollContainerRef}
        onScroll={handleLogsScroll}
      >
        {hasHiddenEntries && (
          <div className="flex justify-center py-2">
            <Button
              onClick={() => setVisibleCount((prev) => prev + 100)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Show {Math.min(100, allEntries.length - visibleCount)} more
              entries
            </Button>
          </div>
        )}

        {renderedVisibleEntries}

        {/* Running processes */}
        {runningProcessLogs.map((runningLog, processIndex) => (
          <NormalizedConversationViewer
            key={runningLog.id}
            executionProcess={attemptData.runningProcessDetails[runningLog.id]}
            onConversationUpdate={handleConversationUpdate}
            onDisplayEntriesChange={processIndex === 0 ? setVisibleRunningEntriesCount : undefined}
            visibleEntriesNum={visibleCount}
            diffDeletable
          />
        ))}

        {/* If the coding agent just started and we have nothing to show */}
        {allProcessLogs.length === 0 &&
          !isAttemptRunning &&
          attemptData.processes.filter((p) => p.process_type === 'codingagent')
            .length === 0 && (
            <div className="h-full flex items-center justify-center">
              <Loader size={32} message="Waiting for agent to start..." />
            </div>
          )}
          
        {/* Show button to load more processes if available */}
        {hasMoreProcesses && !isLoadingAllLogs && (
          <div className="flex justify-center py-4 border-t">
            <Button
              onClick={handleLoadAllLogs}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <ChevronDown className="h-4 w-4" />
              Load All Previous Conversations
            </Button>
          </div>
        )}
        
        {isLoadingAllLogs && (
          <div className="flex justify-center py-4">
            <Loader size={24} message="Loading all conversations..." />
          </div>
        )}
      </div>
    </div>
  );
}

export default Conversation;