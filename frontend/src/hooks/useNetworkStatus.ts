import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  effectiveType?: string;
}

export function useNetworkStatus(): NetworkStatus {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlowConnection: false,
  });

  useEffect(() => {
    const updateOnlineStatus = () => {
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;

      const isSlowConnection = connection ? 
        ['slow-2g', '2g', '3g'].includes(connection.effectiveType) : false;

      setNetworkStatus({
        isOnline: navigator.onLine,
        isSlowConnection,
        effectiveType: connection?.effectiveType,
      });
    };

    // Initial check
    updateOnlineStatus();

    // Event listeners for online/offline status
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Check for connection changes
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (connection) {
      connection.addEventListener('change', updateOnlineStatus);
    }

    // Periodic check for network status (useful for mobile browsers)
    const intervalId = setInterval(updateOnlineStatus, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      if (connection) {
        connection.removeEventListener('change', updateOnlineStatus);
      }
      clearInterval(intervalId);
    };
  }, []);

  return networkStatus;
}