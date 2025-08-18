import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ThemeMode } from 'shared/types';

type ThemeProviderProps = {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
};

type ThemeProviderState = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  initialTheme = 'system',
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // Check localStorage first for persisted theme
    const storedTheme = localStorage.getItem('vibe-kanban-theme');
    if (storedTheme && ['light', 'dark', 'system', 'purple', 'green', 'blue', 'orange', 'red'].includes(storedTheme)) {
      return storedTheme as ThemeMode;
    }
    // If no stored theme, use initialTheme or default to 'system'
    return initialTheme || 'system';
  });

  // Sync with config theme if localStorage doesn't have a theme
  useEffect(() => {
    const storedTheme = localStorage.getItem('vibe-kanban-theme');
    if (!storedTheme && initialTheme) {
      setThemeState(initialTheme);
      localStorage.setItem('vibe-kanban-theme', initialTheme);
    }
  }, [initialTheme]);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove(
      'light',
      'dark',
      'purple',
      'green',
      'blue',
      'orange',
      'red'
    );

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(systemTheme);

      // Listen for system theme changes
      const handleChange = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark');
        root.classList.add(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    root.classList.add(theme);
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    // Persist theme to localStorage
    localStorage.setItem('vibe-kanban-theme', newTheme);
  };

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
