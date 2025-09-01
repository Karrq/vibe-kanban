import { RefreshCw, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionRestartBannerProps {
  className?: string;
  type?: 'executor' | 'restart';
}

const SessionRestartBanner = ({ className, type = 'restart' }: SessionRestartBannerProps) => {
  const isExecutor = type === 'executor';
  const Icon = isExecutor ? Play : RefreshCw;
  const message = isExecutor ? 'Start of session' : 'Conversation restarted with new session';
  
  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-2 mb-4 rounded-md",
      "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800",
      className
    )}>
      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {message}
      </span>
    </div>
  );
};

export default SessionRestartBanner;