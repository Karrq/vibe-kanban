import type { ToolResult, ActionType } from 'shared/types.ts';
import React from 'react';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';

interface ToolResultDisplayProps {
  toolResult: ToolResult | null;
  actionType: ActionType;
  expanded: boolean;
  toolName?: string;
  content?: string;
  toolArgs?: any;
  sessionIdToCommand?: Record<string, string>;
}

export function ToolResultDisplay({
  toolResult,
  actionType,
  expanded,
  toolName,
  content,
  toolArgs,
  sessionIdToCommand,
}: ToolResultDisplayProps) {
  // Check if this is a TodoWrite tool
  const isTodoTool =
    toolName &&
    (toolName.toLowerCase() === 'todowrite' ||
      toolName.toLowerCase() === 'todoread' ||
      toolName.toLowerCase() === 'todo_write' ||
      toolName.toLowerCase() === 'todo_read');

  // Check if this is a search-related tool even if action is 'other'
  const isSearchTool =
    toolName &&
    (toolName.toLowerCase() === 'grep' ||
      toolName.toLowerCase() === 'search' ||
      toolName.toLowerCase() === 'websearch' ||
      toolName.toLowerCase() === 'web_search' ||
      toolName.toLowerCase() === 'glob');

  // Check if this is a BashOutput tool
  const isBashOutputTool = toolName && toolName.toLowerCase() === 'bashoutput';

  // Check if this is a KillBash tool
  const isKillBashTool = toolName && toolName.toLowerCase() === 'killbash';

  // Check if this is a Task tool (subagent invocation)
  const isTaskTool = toolName && toolName.toLowerCase() === 'task';
  
  // Check if this is an ExitPlanMode tool
  const isExitPlanModeTool = toolName && toolName.toLowerCase() === 'exitplanmode';

  // Check if this is a file editing tool (Edit, Write, MultiEdit, etc.)
  const isFileEditingTool = 
    toolName &&
    (toolName.toLowerCase() === 'edit' ||
      toolName.toLowerCase() === 'write' ||
      toolName.toLowerCase() === 'multiedit' ||
      toolName.toLowerCase() === 'edit_file' ||
      toolName.toLowerCase() === 'create_file' ||
      toolName.toLowerCase() === 'notebookedit');

  // Check if this is a file/directory reading tool (Read, etc.)
  // Note: LS is intentionally not included here as it should be handled as an unknown tool
  // to show its args and results properly
  const isFileReadingTool =
    toolName &&
    (toolName.toLowerCase() === 'read' ||
      toolName.toLowerCase() === 'read_file');

  // Check if this is a known tool with special formatting
  const isKnownTool = 
    actionType.action === 'command_run' ||
    actionType.action === 'file_read' ||
    actionType.action === 'file_write' ||
    actionType.action === 'search' ||
    actionType.action === 'web_fetch' ||
    actionType.action === 'task_create' ||
    actionType.action === 'plan_presentation' ||
    isTodoTool ||
    isBashOutputTool ||
    isKillBashTool ||
    isSearchTool ||
    isTaskTool ||
    isExitPlanModeTool ||
    isFileEditingTool ||
    isFileReadingTool;

  // For unknown tools, show tool name and expandable args/result
  if (!isKnownTool) {
    return (
      <>
        {/* Tool name display */}
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {toolName || 'Unknown Tool'}
          </span>
        </div>

        {/* Expandable args and result when expanded */}
        {expanded && (
          <div className="mt-2 space-y-2">
            {/* Tool Arguments Card */}
            {toolArgs && (
              <div className="border rounded-md bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Tool Arguments
                  </span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 text-gray-700 dark:text-gray-300">
                  {(() => {
                    // Handle Claude executor's wrapper format
                    if (typeof toolArgs === 'object' && toolArgs._tool_input) {
                      // Extract the actual tool input from the wrapper
                      return JSON.stringify(toolArgs._tool_input, null, 2);
                    }
                    // Otherwise display as-is
                    return typeof toolArgs === 'string' 
                      ? toolArgs 
                      : JSON.stringify(toolArgs, null, 2);
                  })()}
                </pre>
              </div>
            )}

            {/* Tool Result Card */}
            {toolResult && (
              <div className="border rounded-md bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Tool Result
                  </span>
                  {toolResult.exit_code !== null && toolResult.exit_code !== 0 && (
                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                      (exit code: {toolResult.exit_code})
                    </span>
                  )}
                </div>
                <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
                  toolResult.is_error
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {(() => {
                    if (!toolResult.content) return '(empty result)';
                    
                    // Try to parse as JSON for pretty printing
                    try {
                      const parsed = JSON.parse(toolResult.content);
                      return JSON.stringify(parsed, null, 2);
                    } catch {
                      // If not JSON, return as-is
                      return toolResult.content;
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  if (!toolResult) {
    return null;
  }

  // Display content based on action type or tool name
  let displayContent: React.ReactNode = null;
  let outputContent: React.ReactNode = null;

  if (actionType.action === 'command_run') {
    // For Bash: show command in monospace
    displayContent = (
      <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
        {actionType.command}
      </span>
    );
    // Use standard pre-formatted output for Bash
    outputContent = toolResult.content && (
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
          toolResult.is_error
            ? 'text-red-700 dark:text-red-300'
            : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {toolResult.content}
      </pre>
    );
  } else if (actionType.action === 'file_read') {
    // For Read: show "Reading" in regular text and filename in monospace
    displayContent = (
      <span className="text-sm">
        Reading{' '}
        <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
          {actionType.path}
        </span>
      </span>
    );
    // Use standard pre-formatted output for Read
    outputContent = toolResult.content && (
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
          toolResult.is_error
            ? 'text-red-700 dark:text-red-300'
            : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {toolResult.content}
      </pre>
    );
  } else if (actionType.action === 'search') {
    // For Search (usually grep): show the query that was searched
    displayContent = (
      <span className="text-sm">
        Searching with grep for:{' '}
        <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
          {actionType.query}
        </span>
      </span>
    );
    // Show search results when expanded
    outputContent = toolResult.content && (
      <div className="p-3">
        <MarkdownRenderer
          content={toolResult.content}
          className={`whitespace-pre-wrap break-words text-sm ${
            toolResult.is_error
              ? 'text-red-700 dark:text-red-300'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        />
      </div>
    );
  } else if (isSearchTool && actionType.action === 'other') {
    // For other search tools (grep, glob, websearch, etc.)
    // Special handling for each search tool type
    if (toolName?.toLowerCase() === 'glob') {
      // Extract the search pattern from tool_args
      const pattern = toolArgs?.pattern || '';
      displayContent = (
        <span className="text-sm">
          Searching with find for:{' '}
          <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
            {pattern}
          </span>
        </span>
      );
    } else if (toolName?.toLowerCase() === 'grep') {
      // For grep, show the search pattern
      const pattern = toolArgs?.pattern || '';
      displayContent = (
        <span className="text-sm">
          Searching with grep for:{' '}
          <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
            {pattern}
          </span>
        </span>
      );
    } else if (
      toolName?.toLowerCase() === 'websearch' ||
      toolName?.toLowerCase() === 'web_search'
    ) {
      // For WebSearch, get the query from tool_args
      const query = toolArgs?.query || '';
      displayContent = (
        <span className="text-sm">
          Searching web for:{' '}
          <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
            {query}
          </span>
        </span>
      );
    } else {
      displayContent = (
        <span className="text-sm">
          {toolName}: {actionType.description || 'Searching...'}
        </span>
      );
    }
    // Show search results when expanded
    outputContent = toolResult.content && (
      <div className="p-3">
        <MarkdownRenderer
          content={toolResult.content}
          className={`whitespace-pre-wrap break-words text-sm ${
            toolResult.is_error
              ? 'text-red-700 dark:text-red-300'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        />
      </div>
    );
  } else if (isTodoTool) {
    // For TodoWrite: show "Updated TODO list" when collapsed
    displayContent = <span className="text-sm">Updated TODO list</span>;
    // Show the formatted todo list when expanded
    if (expanded && content) {
      outputContent = (
        <div className="font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/20 px-2 py-1 rounded">
          <MarkdownRenderer
            content={content}
            className="whitespace-pre-wrap break-words text-sm"
          />
        </div>
      );
    }
  } else if (isBashOutputTool) {
    // For BashOutput: parse bash_id from tool args and get original command
    const bashId = toolArgs?.bash_id || toolArgs?.shell_id;
    const originalCommand =
      bashId && sessionIdToCommand ? sessionIdToCommand[bashId] : null;

    displayContent = (
      <span className="text-sm">
        {originalCommand ? (
          <>
            Bash output of:{' '}
            <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
              {originalCommand}
            </span>
          </>
        ) : (
          <>
            Bash output retrieval
            {bashId && (
              <span className="ml-1 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-xs">
                {bashId}
              </span>
            )}
          </>
        )}
      </span>
    );

    // Parse stdout content from the output
    let parsedContent = toolResult.content;
    let noNewOutput = false;

    if (toolResult.content && !toolResult.is_error) {
      const stdoutMatch = toolResult.content.match(
        /<stdout>([\s\S]*?)<\/stdout>/
      );
      if (stdoutMatch && stdoutMatch[1]) {
        parsedContent = stdoutMatch[1].trim();
      } else if (
        toolResult.content.includes('<status>') &&
        !toolResult.content.includes('<stdout>')
      ) {
        // No stdout tags found - likely no new output
        parsedContent = null;
        noNewOutput = true;
      }
    }

    // Use parsed content for display
    outputContent = (
      <div>
        {noNewOutput && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic p-3">
            No new output
          </div>
        )}
        {parsedContent && (
          <pre
            className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
              toolResult.is_error
                ? 'text-red-700 dark:text-red-300'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {parsedContent}
          </pre>
        )}
      </div>
    );
  } else if (isKillBashTool) {
    // For KillBash: parse bash_id or shell_id from tool args and get original command
    const bashId = toolArgs?.shell_id || toolArgs?.bash_id;
    const originalCommand =
      bashId && sessionIdToCommand ? sessionIdToCommand[bashId] : null;

    displayContent = (
      <span className="text-sm">
        {originalCommand ? (
          <>
            Kill bash session:{' '}
            <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">
              {originalCommand}
            </span>
          </>
        ) : (
          <>
            Kill bash session
            {bashId && (
              <span className="ml-1 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-xs">
                {bashId}
              </span>
            )}
          </>
        )}
      </span>
    );
    // Show the result message
    outputContent = toolResult.content && (
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
          toolResult.is_error
            ? 'text-red-700 dark:text-red-300'
            : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {toolResult.content}
      </pre>
    );
  } else if (isTaskTool) {
    // For Task: show just the description when collapsed (as before)
    const subagentType = toolArgs?.subagent_type || 'general-purpose';
    const description = toolArgs?.description || 'Task delegation';
    const prompt = toolArgs?.prompt;

    displayContent = <span className="text-sm">{description}</span>;

    // Show subagent type and full prompt when expanded
    if (expanded && prompt) {
      outputContent = (
        <div className="space-y-2">
          <div className="px-3 pt-3">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Type:{' '}
            </span>
            <span className="text-sm font-mono text-blue-600 dark:text-blue-400">
              {subagentType}
            </span>
          </div>
          <div className="px-3 pb-3">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Prompt:
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-gray-100 dark:bg-gray-800 p-2 rounded">
              {prompt}
            </pre>
          </div>
          {toolResult.content && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Result:
              </div>
              <pre
                className={`text-xs font-mono whitespace-pre-wrap break-words ${
                  toolResult.is_error
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {toolResult.content}
              </pre>
            </div>
          )}
        </div>
      );
    }
  } else if (isExitPlanModeTool) {
    // For ExitPlanMode: show "Exiting plan mode" when collapsed
    displayContent = <span className="text-sm">Exiting plan mode</span>;
    
    // Extract the plan from tool args, handling Claude executor's wrapper format
    let plan = '';
    if (toolArgs) {
      // Handle Claude executor's wrapper format
      if (typeof toolArgs === 'object' && toolArgs._tool_input && toolArgs._tool_input.plan) {
        plan = toolArgs._tool_input.plan;
      } else if (typeof toolArgs === 'object' && toolArgs.plan) {
        plan = toolArgs.plan;
      } else if (typeof toolArgs === 'string') {
        // Try to parse if it's a JSON string
        try {
          const parsed = JSON.parse(toolArgs);
          plan = parsed.plan || parsed._tool_input?.plan || '';
        } catch {
          // Not JSON, use as-is
          plan = toolArgs;
        }
      }
    }
    
    // Show the plan when expanded
    if (expanded && plan) {
      outputContent = (
        <div className="space-y-2">
          <div className="px-3 py-3">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
              Plan:
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={plan} />
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <>
      {/* Tool action display */}
      {displayContent && (
        <div className="flex items-center gap-2">
          {displayContent}
          {toolResult.exit_code !== null && toolResult.exit_code !== 0 && (
            <span className="text-xs text-red-600 dark:text-red-400">
              exit code: {toolResult.exit_code}
            </span>
          )}
        </div>
      )}

      {/* Output display when expanded */}
      {expanded && outputContent && (
        <div className="mt-2 overflow-x-auto max-h-80 border rounded-md bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
          {outputContent}
        </div>
      )}
    </>
  );
}
