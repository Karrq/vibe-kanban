import { useState, useEffect, useCallback } from 'react';

export interface PageVisibilityState {
  isVisible: boolean;
  lastHiddenTime?: number;
  resumeCount: number;
}

export function usePageVisibility(onResume?: () => void, onHide?: () => void) {
  const [state, setState] = useState<PageVisibilityState>({
    isVisible: !document.hidden,
    resumeCount: 0,
  });

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Page is being hidden
      setState(prev => ({
        ...prev,
        isVisible: false,
        lastHiddenTime: Date.now(),
      }));
      onHide?.();
    } else {
      // Page is becoming visible again
      setState(prev => ({
        ...prev,
        isVisible: true,
        resumeCount: prev.resumeCount + 1,
      }));
      onResume?.();
    }
  }, [onResume, onHide]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for focus/blur as backup for mobile browsers
    const handleFocus = () => {
      if (!state.isVisible) {
        setState(prev => ({
          ...prev,
          isVisible: true,
          resumeCount: prev.resumeCount + 1,
        }));
        onResume?.();
      }
    };

    const handleBlur = () => {
      // Only update if not already hidden
      if (state.isVisible && document.hidden) {
        setState(prev => ({
          ...prev,
          isVisible: false,
          lastHiddenTime: Date.now(),
        }));
        onHide?.();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleVisibilityChange, onResume, onHide, state.isVisible]);

  const getTimeSinceHidden = useCallback(() => {
    if (!state.lastHiddenTime) return 0;
    return Date.now() - state.lastHiddenTime;
  }, [state.lastHiddenTime]);

  return {
    ...state,
    getTimeSinceHidden,
  };
}