import { useEffect, useState } from 'react';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

export function OfflineIndicator() {
  const { isOnline, wasOffline, clearWasOffline, effectiveType } = useOfflineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    if (wasOffline && isOnline) {
      setShowBackOnline(true);
      const timer = setTimeout(() => {
        setShowBackOnline(false);
        clearWasOffline();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [wasOffline, isOnline, clearWasOffline]);

  // Don't show anything if online and not recently offline
  if (isOnline && !showBackOnline) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 px-4 py-2 text-sm font-medium text-white transition-all duration-300',
        isOnline ? 'bg-green-600' : 'bg-orange-600',
        'animate-in slide-in-from-top-2'
      )}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span>Back online</span>
            {effectiveType && (
              <span className="text-xs opacity-75">({effectiveType})</span>
            )}
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>You are offline - Some features may be limited</span>
          </>
        )}
      </div>
    </div>
  );
}

interface StaleDataBadgeProps {
  lastSynced?: number;
  className?: string;
}

export function StaleDataBadge({ lastSynced, className }: StaleDataBadgeProps) {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastSynced) return;

    const updateTimeAgo = () => {
      const diff = Date.now() - lastSynced;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setTimeAgo(`${days}d ago`);
      } else if (hours > 0) {
        setTimeAgo(`${hours}h ago`);
      } else if (minutes > 0) {
        setTimeAgo(`${minutes}m ago`);
      } else {
        setTimeAgo('Just now');
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastSynced]);

  if (!lastSynced || !timeAgo) return null;

  // Only show if data is older than 5 minutes
  const isStale = Date.now() - lastSynced > 5 * 60 * 1000;
  if (!isStale) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>Cached: {timeAgo}</span>
    </div>
  );
}