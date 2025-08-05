import type { ToolResult, ActionType } from 'shared/types.ts';

interface ToolResultDisplayProps {
  toolResult: ToolResult;
  actionType: ActionType;
  expanded: boolean;
}

export function ToolResultDisplay({ toolResult, actionType, expanded }: ToolResultDisplayProps) {
  if (!toolResult) {
    return null;
  }

  // Extract display content based on action type
  let displayContent: string | null = null;
  
  switch (actionType.action) {
    case 'command_run':
      displayContent = actionType.command;
      break;
    case 'file_read':
      displayContent = `Reading ${actionType.path}`;
      break;
    case 'file_write':
      displayContent = `Writing to ${actionType.path}`;
      break;
    case 'search':
      displayContent = `Searching for: ${actionType.query}`;
      break;
    case 'web_fetch':
      displayContent = `Fetching ${actionType.url}`;
      break;
    default:
      // For other tools, show a generic message
      displayContent = 'Tool execution';
  }
  
  return (
    <>
      {/* Tool action display */}
      {displayContent && (
        <div className="flex items-center gap-2">
          <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
            {displayContent}
          </span>
          {toolResult.exit_code !== null && toolResult.exit_code !== 0 && (
            <span className="text-xs text-red-600 dark:text-red-400">
              exit code: {toolResult.exit_code}
            </span>
          )}
        </div>
      )}
      
      {/* Output display when expanded */}
      {expanded && toolResult.content && (
        <div className="mt-2 overflow-x-auto max-h-80 border rounded-md bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
          <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
            toolResult.is_error 
              ? 'text-red-700 dark:text-red-300' 
              : 'text-gray-700 dark:text-gray-300'
          }`}>
            {toolResult.content}
          </pre>
        </div>
      )}
    </>
  );
}