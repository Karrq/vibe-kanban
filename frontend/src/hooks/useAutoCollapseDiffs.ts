import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vibe-kanban-auto-collapse-diffs';

export function useAutoCollapseDiffs() {
  const [autoCollapseDiffs, setAutoCollapseDiffsState] = useState<boolean>(() => {
    // Default to true (collapsed by default)
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  const setAutoCollapseDiffs = (value: boolean) => {
    setAutoCollapseDiffsState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  };

  // Listen for changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setAutoCollapseDiffsState(e.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { autoCollapseDiffs, setAutoCollapseDiffs };
}