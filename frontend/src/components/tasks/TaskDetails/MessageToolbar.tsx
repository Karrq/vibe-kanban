import { useState } from 'react';
import { Copy, Layers, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type MessageToolbarProps = {
  onCopy: () => void;
  onCompact?: () => void;
  showCompact?: boolean;
  isCompacting?: boolean;
};

export function MessageToolbar({ onCopy, onCompact, showCompact = false, isCompacting = false }: MessageToolbarProps) {
  const [copiedIndex, setCopiedIndex] = useState<boolean>(false);

  const handleCopy = async () => {
    await onCopy();
    setCopiedIndex(true);
    setTimeout(() => {
      setCopiedIndex(false);
    }, 2000);
  };

  return (
    <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
      <TooltipProvider>
        {showCompact && onCompact && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCompact}
                disabled={isCompacting}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Compact conversation"
              >
                {isCompacting ? (
                  <Loader2 className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400 animate-spin" />
                ) : (
                  <Layers className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isCompacting ? 'Compacting...' : 'Compact conversation context'}</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Copy message"
            >
              {copiedIndex ? (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium px-1">
                  Copied!
                </span>
              ) : (
                <Copy className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy message</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}