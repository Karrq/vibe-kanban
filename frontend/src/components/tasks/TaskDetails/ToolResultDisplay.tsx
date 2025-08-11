import type { ToolResult, ActionType } from 'shared/types.ts';
import React from 'react';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';

interface ToolResultDisplayProps {
  toolResult: ToolResult;
  actionType: ActionType;
  expanded: boolean;
  toolName?: string;
  content?: string;
}

export function ToolResultDisplay({ toolResult, actionType, expanded, toolName, content }: ToolResultDisplayProps) {
  if (!toolResult) {
    return null;
  }

  // Check if this is a TodoWrite tool
  const isTodoTool = toolName && (
    toolName.toLowerCase() === 'todowrite' ||
    toolName.toLowerCase() === 'todoread' ||
    toolName.toLowerCase() === 'todo_write' ||
    toolName.toLowerCase() === 'todo_read'
  );

  // Only show special formatting for command_run (Bash), file_read (Read), and TodoWrite tools
  // For other tools, return null to let the parent component handle display
  if (actionType.action !== 'command_run' && actionType.action !== 'file_read' && !isTodoTool) {
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
      <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
        toolResult.is_error 
          ? 'text-red-700 dark:text-red-300' 
          : 'text-gray-700 dark:text-gray-300'
      }`}>
        {toolResult.content}
      </pre>
    );
  } else if (actionType.action === 'file_read') {
    // For Read: show "Reading" in regular text and filename in monospace
    displayContent = (
      <span className="text-sm">
        Reading <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{actionType.path}</span>
      </span>
    );
    // Use standard pre-formatted output for Read
    outputContent = toolResult.content && (
      <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
        toolResult.is_error 
          ? 'text-red-700 dark:text-red-300' 
          : 'text-gray-700 dark:text-gray-300'
      }`}>
        {toolResult.content}
      </pre>
    );
  } else if (isTodoTool) {
    // For TodoWrite: show "Updated TODO list" when collapsed
    displayContent = (
      <span className="text-sm">
        Updated TODO list
      </span>
    );
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