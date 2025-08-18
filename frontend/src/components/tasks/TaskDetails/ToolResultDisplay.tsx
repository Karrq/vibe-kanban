import type { ToolResult, ActionType } from 'shared/types.ts';
import React from 'react';
import MarkdownRenderer from '@/components/ui/markdown-renderer.tsx';

interface ToolResultDisplayProps {
  toolResult: ToolResult;
  actionType: ActionType;
  expanded: boolean;
  toolName?: string;
  content?: string;
  toolArgs?: any;
  sessionIdToCommand?: Record<string, string>;
}

export function ToolResultDisplay({ toolResult, actionType, expanded, toolName, content, toolArgs, sessionIdToCommand }: ToolResultDisplayProps) {
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

  // Check if this is a search-related tool even if action is 'other'
  const isSearchTool = toolName && (
    toolName.toLowerCase() === 'grep' ||
    toolName.toLowerCase() === 'search' ||
    toolName.toLowerCase() === 'websearch' ||
    toolName.toLowerCase() === 'web_search' ||
    toolName.toLowerCase() === 'glob'
  );

  // Check if this is a BashOutput tool
  const isBashOutputTool = toolName && toolName.toLowerCase() === 'bashoutput';

  // Check if this is a KillBash tool
  const isKillBashTool = toolName && toolName.toLowerCase() === 'killbash';

  // Only show special formatting for command_run (Bash), file_read (Read), search, TodoWrite, BashOutput, KillBash, and search tools
  // For other tools, return null to let the parent component handle display
  if (actionType.action !== 'command_run' && actionType.action !== 'file_read' && actionType.action !== 'search' && !isTodoTool && !isBashOutputTool && !isKillBashTool && !isSearchTool) {
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
  } else if (actionType.action === 'search') {
    // For Search (usually grep): show the query that was searched
    displayContent = (
      <span className="text-sm">
        Searching with grep for: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{actionType.query}</span>
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
          Searching with find for: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{pattern}</span>
        </span>
      );
    } else if (toolName?.toLowerCase() === 'grep') {
      // For grep, show the search pattern
      const pattern = toolArgs?.pattern || '';
      displayContent = (
        <span className="text-sm">
          Searching with grep for: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{pattern}</span>
        </span>
      );
    } else if (toolName?.toLowerCase() === 'websearch' || toolName?.toLowerCase() === 'web_search') {
      // For WebSearch, get the query from tool_args
      const query = toolArgs?.query || '';
      displayContent = (
        <span className="text-sm">
          Searching web for: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{query}</span>
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
  } else if (isBashOutputTool) {
    // For BashOutput: parse bash_id from tool args and get original command
    const bashId = toolArgs?.bash_id || toolArgs?.shell_id;
    const originalCommand = bashId && sessionIdToCommand ? sessionIdToCommand[bashId] : null;
    
    displayContent = (
      <span className="text-sm">
        {originalCommand ? (
          <>Bash output of: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{originalCommand}</span></>
        ) : (
          <>Bash output retrieval{bashId && (
            <span className="ml-1 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-xs">
              {bashId}
            </span>
          )}</>
        )}
      </span>
    );
    
    // Parse stdout content from the output
    let parsedContent = toolResult.content;
    let noNewOutput = false;
    
    if (toolResult.content && !toolResult.is_error) {
      const stdoutMatch = toolResult.content.match(/<stdout>([\s\S]*?)<\/stdout>/);
      if (stdoutMatch && stdoutMatch[1]) {
        parsedContent = stdoutMatch[1].trim();
      } else if (toolResult.content.includes('<status>') && !toolResult.content.includes('<stdout>')) {
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
          <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
            toolResult.is_error 
              ? 'text-red-700 dark:text-red-300' 
              : 'text-gray-700 dark:text-gray-300'
          }`}>
            {parsedContent}
          </pre>
        )}
      </div>
    );
  } else if (isKillBashTool) {
    // For KillBash: parse bash_id or shell_id from tool args and get original command
    const bashId = toolArgs?.shell_id || toolArgs?.bash_id;
    const originalCommand = bashId && sessionIdToCommand ? sessionIdToCommand[bashId] : null;
    
    displayContent = (
      <span className="text-sm">
        {originalCommand ? (
          <>Kill bash session: <span className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono">{originalCommand}</span></>
        ) : (
          <>Kill bash session{bashId && (
            <span className="ml-1 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-xs">
              {bashId}
            </span>
          )}</>
        )}
      </span>
    );
    // Show the result message
    outputContent = toolResult.content && (
      <pre className={`text-xs font-mono whitespace-pre-wrap break-words p-3 ${
        toolResult.is_error 
          ? 'text-red-700 dark:text-red-300' 
          : 'text-gray-700 dark:text-gray-300'
      }`}>
        {toolResult.content}
      </pre>
    );
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