import { ConversationEntryDisplayType } from '@/lib/types';
import DisplayConversationEntry from '../DisplayConversationEntry';
import { NormalizedConversationViewer } from './NormalizedConversationViewer';
import Prompt from './Prompt';
import { Loader } from '@/components/ui/loader.tsx';
import { ExecutionProcess } from 'shared/types';

type Props = {
  item: ConversationEntryDisplayType;
  idx: number;
  handleConversationUpdate: () => void;
  visibleEntriesLength: number;
  runningProcessDetails: Record<string, ExecutionProcess>;
  sessionIdToCommand?: Record<string, string>;
  isLastEntry?: boolean;
  onCompact?: () => void;
  isCompacting?: boolean;
};

const ConversationEntry = ({
  item,
  idx,
  handleConversationUpdate,
  visibleEntriesLength,
  runningProcessDetails,
  sessionIdToCommand,
  isLastEntry = false,
  onCompact,
  isCompacting = false,
}: Props) => {
  // Show prompt only for the first entry of each process
  // For follow-up processes: show at the start of each follow-up
  // For main process: show at the start
  const showPrompt = item.processPrompt && item.isFirstInProcess;
  // For running processes, render the live viewer below the static entries
  if (item.processIsRunning && idx === visibleEntriesLength - 1) {
    // Only render the live viewer for the last entry of a running process
    const runningProcess = runningProcessDetails[item.processId];
    if (runningProcess) {
      return (
        <div key={item.entry.timestamp || idx}>
          {showPrompt && <Prompt prompt={item.processPrompt || ''} />}
          <NormalizedConversationViewer
            executionProcess={runningProcess}
            onConversationUpdate={handleConversationUpdate}
            diffDeletable
          />
        </div>
      );
    }
    // Fallback: show loading if not found
    return <Loader message="Loading live logs..." size={24} className="py-4" />;
  } else {
    return (
      <div key={item.entry.timestamp || idx}>
        {showPrompt && <Prompt prompt={item.processPrompt || ''} />}
        <DisplayConversationEntry
          entry={item.entry}
          index={idx}
          diffDeletable
          sessionIdToCommand={sessionIdToCommand}
          isLast={isLastEntry}
          onCompact={onCompact}
          isCompacting={isCompacting}
        />
      </div>
    );
  }
};

export default ConversationEntry;
