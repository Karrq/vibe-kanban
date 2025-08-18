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

  // Check if this is a BashOutput tool
  const isBashOutputTool = toolName && toolName.toLowerCase() === 'bashoutput';

  // Check if this is a KillBash tool
  const isKillBashTool = toolName && toolName.toLowerCase() === 'killbash';
  
  // Check if this is a Task tool (subagent invocation)
  const isTaskTool = toolName && toolName.toLowerCase() === 'task';

  // Only show special formatting for command_run (Bash), file_read (Read), TodoWrite, BashOutput, KillBash, and Task tools
  // For other tools, return null to let the parent component handle display
  if (actionType.action !== 'command_run' && actionType.action !== 'file_read' && !isTodoTool && !isBashOutputTool && !isKillBashTool && !isTaskTool) {
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
  } else if (isTaskTool) {
    // For Task: show just the description when collapsed (as before)
    const subagentType = toolArgs?.subagent_type || 'general-purpose';
    const description = toolArgs?.description || 'Task delegation';
    const prompt = toolArgs?.prompt;
    
    displayContent = (
      <span className="text-sm">
        {description}
      </span>
    );
    
    // Show subagent type and full prompt when expanded
    if (expanded && prompt) {
      outputContent = (
        <div className="space-y-2">
          <div className="px-3 pt-3">
            <span className="text-xs text-gray-600 dark:text-gray-400">Subagent type: </span>
            <span className="text-sm font-mono text-blue-600 dark:text-blue-400">{subagentType}</span>
          </div>
          <div className="px-3 pb-3">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Full prompt:</div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-gray-100 dark:bg-gray-800 p-2 rounded">
              {prompt}
            </pre>
          </div>
          {toolResult.content && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Result:</div>
              <pre className={`text-xs font-mono whitespace-pre-wrap break-words ${
                toolResult.is_error 
                  ? 'text-red-700 dark:text-red-300' 
                  : 'text-gray-700 dark:text-gray-300'
              }`}>
                {toolResult.content}
              </pre>
            </div>
          )}
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