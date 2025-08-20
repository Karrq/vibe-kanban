import { memo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TaskDetailsToolbar from '@/components/tasks/TaskDetailsToolbar.tsx';

function CollapsibleToolbar() {
  // Check if we're on mobile and set initial collapsed state accordingly
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      // Collapsed by default on mobile (< 1280px)
      return window.innerWidth < 1280;
    }
    return false;
  });

  // Update collapsed state when window resizes across the breakpoint
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 1280;
      // Only auto-collapse when going from desktop to mobile
      if (isMobile && window.innerWidth >= 1280) {
        setIsHeaderCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="border-b">
      <div className="px-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Task Details
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsHeaderCollapsed((prev) => !prev)}
          className="h-6 w-6 p-0"
        >
          {isHeaderCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!isHeaderCollapsed && <TaskDetailsToolbar />}
    </div>
  );
}

export default memo(CollapsibleToolbar);
