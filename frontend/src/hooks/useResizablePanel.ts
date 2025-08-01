import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'vibe-kanban-task-panel-width';
const MIN_WIDTH = 400;
const DEFAULT_WIDTH = 800;
const MAX_WIDTH_PERCENTAGE = 0.85; // Leave at least 15% for kanban view

interface UseResizablePanelOptions {
  minWidth?: number;
  defaultWidth?: number;
  storageKey?: string;
}

export function useResizablePanel(options: UseResizablePanelOptions = {}) {
  const {
    minWidth = MIN_WIDTH,
    defaultWidth = DEFAULT_WIDTH,
    storageKey = STORAGE_KEY,
  } = options;
  
  // Calculate dynamic max width based on window size
  const getMaxWidth = () => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH * 2;
    return Math.floor(window.innerWidth * MAX_WIDTH_PERCENTAGE);
  };

  // Load initial width from localStorage
  const getInitialWidth = () => {
    if (typeof window === 'undefined') return defaultWidth;
    
    const stored = localStorage.getItem(storageKey);
    const maxWidth = getMaxWidth();
    
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
        return parsed;
      }
    }
    return defaultWidth;
  };

  const [width, setWidth] = useState(getInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Save width to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
  }, [width, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = startXRef.current - e.clientX;
    const maxWidth = getMaxWidth();
    const newWidth = Math.min(
      Math.max(startWidthRef.current + deltaX, minWidth),
      maxWidth
    );
    
    setWidth(newWidth);
  }, [isResizing, minWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Handle window resize to ensure width doesn't exceed max
  useEffect(() => {
    const handleWindowResize = () => {
      const maxWidth = getMaxWidth();
      setWidth(prevWidth => Math.min(prevWidth, maxWidth));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  return {
    width,
    isResizing,
    handleMouseDown,
  };
}