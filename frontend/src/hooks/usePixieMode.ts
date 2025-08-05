import { useState, useEffect } from 'react';

const PIXIE_MODE_KEY = 'vibe-kanban-pixie-mode';

export function usePixieMode() {
  const [pixieMode, setPixieModeState] = useState<boolean>(() => {
    const stored = localStorage.getItem(PIXIE_MODE_KEY);
    return stored === 'true';
  });

  const setPixieMode = (enabled: boolean) => {
    setPixieModeState(enabled);
    localStorage.setItem(PIXIE_MODE_KEY, String(enabled));
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PIXIE_MODE_KEY) {
        setPixieModeState(e.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { pixieMode, setPixieMode };
}