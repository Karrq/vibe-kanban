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
};

const ConversationEntry = ({
  item,
  idx,
  handleConversationUpdate,
  visibleEntriesLength,
  runningProcessDetails,
  sessionIdToCommand,
}: Props) => {
  // Check if this is a prompt entry (special entry with entryIndex === -1)
  const isPromptEntry = item.entryIndex === -1 && item.processPrompt;
  
  // For running processes, render the live viewer below the static entries
  if (item.processIsRunning && idx === visibleEntriesLength - 1) {
    // Only render the live viewer for the last entry of a running process
    const runningProcess = runningProcessDetails[item.processId];
    if (runningProcess) {
      return (
        <div key={item.entry.timestamp || idx}>
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
  } else if (isPromptEntry) {
    // Render prompt entries with the special Prompt component
    return (
      <div key={item.entry.timestamp || idx}>
        <Prompt prompt={item.processPrompt || ''} />
      </div>
    );
  } else {
    // Regular entry
    return (
      <div key={item.entry.timestamp || idx}>
        <DisplayConversationEntry
          entry={item.entry}
          index={idx}
          diffDeletable
          sessionIdToCommand={sessionIdToCommand}
        />
      </div>
    );
  }
};

export default ConversationEntry;
