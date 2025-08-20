import { useEffect, useState } from 'react';
import { WifiOff, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  dataAge?: number | null;
  hasPendingChanges?: boolean;
  onRetry?: () => void;
}

export function OfflineIndicator({ 
  dataAge, 
  hasPendingChanges = false,
  onRetry 
}: OfflineIndicatorProps) {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline && isOnline) {
      // Show reconnection message
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  // Calculate data freshness
  const getDataFreshnessMessage = () => {
    if (!dataAge) return null;
    
    const minutes = Math.floor(dataAge / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `Data from ${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `Data from ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Recent data';
    }
  };

  if (showReconnected) {
    return (
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2">
        <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Connection restored</span>
        </div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2">
        <div className="bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">You're offline</span>
              {dataAge && (
                <span className="text-xs opacity-90">{getDataFreshnessMessage()}</span>
              )}
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="ml-2 p-1 hover:bg-orange-600 rounded transition-colors"
                title="Retry connection"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isSlowConnection) {
    return (
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2">
        <div className="bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Slow connection detected</span>
        </div>
      </div>
    );
  }

  if (hasPendingChanges) {
    return (
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-2">
        <div className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">Syncing changes...</span>
        </div>
      </div>
    );
  }

  return null;
}

interface DataSyncIndicatorProps {
  lastSync?: number | null;
  isStale?: boolean;
  className?: string;
}

export function DataSyncIndicator({ 
  lastSync, 
  isStale = false,
  className 
}: DataSyncIndicatorProps) {
  const { isOnline } = useNetworkStatus();
  
  const getSyncMessage = () => {
    if (!lastSync) return 'Never synced';
    
    const age = Date.now() - lastSync;
    const minutes = Math.floor(age / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `Last sync: ${hours}h ago`;
    } else if (minutes > 0) {
      return `Last sync: ${minutes}m ago`;
    } else {
      return 'Recently synced';
    }
  };

  if (!isOnline || isStale) {
    return (
      <div className={cn(
        "text-xs text-muted-foreground flex items-center gap-1",
        isStale && "text-orange-500",
        !isOnline && "text-red-500",
        className
      )}>
        {!isOnline ? (
          <>
            <WifiOff className="h-3 w-3" />
            <span>Offline mode</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-3 w-3" />
            <span>{getSyncMessage()}</span>
          </>
        )}
      </div>
    );
  }

  return null;
}