import { useState, useMemo, useRef, useCallback, useTransition, memo } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ArrowDown, GitBranch as GitBranchIcon, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { GitBranch } from 'shared/types.ts';

type Props = {
  branches: GitBranch[];
  selectedBranch: string | null;
  onBranchSelect: (branch: string) => void;
  placeholder?: string;
  className?: string;
  excludeCurrentBranch?: boolean;
};

// Constants for virtualization
const VISIBLE_ITEMS = 20;
const ITEM_HEIGHT = 32; // Approximate height of each menu item

// Helper function to check if a branch is a VK branch - moved outside component for better performance
const isVKBranch = (branchName: string): boolean => {
  // Check if branch starts with vk- or has vk- after the remote name (e.g., origin/vk-)
  return branchName.startsWith('vk-') || branchName.includes('/vk-');
};

// Memoized branch item component for better performance
const BranchItem = memo(({ 
  branch, 
  isCurrentAndExcluded, 
  isSelected,
  onSelect 
}: { 
  branch: GitBranch; 
  isCurrentAndExcluded: boolean;
  isSelected: boolean;
  onSelect: (name: string) => void;
}) => {
  const handleClick = useCallback(() => {
    if (!isCurrentAndExcluded) {
      onSelect(branch.name);
    }
  }, [isCurrentAndExcluded, onSelect, branch.name]);

  const menuItem = (
    <DropdownMenuItem
      onClick={handleClick}
      disabled={isCurrentAndExcluded}
      className={`${isSelected ? 'bg-accent' : ''} ${
        isCurrentAndExcluded ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <span className={branch.is_current ? 'font-medium' : ''}>
          {branch.name}
        </span>
        <div className="flex gap-1">
          {branch.is_current && (
            <span className="text-xs bg-green-100 text-green-800 px-1 rounded">
              current
            </span>
          )}
          {branch.is_remote && (
            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
              remote
            </span>
          )}
        </div>
      </div>
    </DropdownMenuItem>
  );

  if (isCurrentAndExcluded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{menuItem}</TooltipTrigger>
        <TooltipContent>
          <p>Cannot rebase a branch onto itself</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return menuItem;
});
BranchItem.displayName = 'BranchItem';

const BranchSelector = memo(({
  branches,
  selectedBranch,
  onBranchSelect,
  placeholder = 'Select a branch',
  className = '',
  excludeCurrentBranch = false,
}: Props) => {
  const [branchSearchTerm, setBranchSearchTerm] = useState('');
  const [isPending, startTransition] = useTransition();
  const [scrollOffset, setScrollOffset] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Debounced search term update
  const handleSearchChange = useCallback((value: string) => {
    startTransition(() => {
      setBranchSearchTerm(value);
      setScrollOffset(0); // Reset scroll when searching
    });
  }, []);

  // Pre-filter branches to separate VK and non-VK branches for better performance
  const nonVkBranches = useMemo(() => {
    const nonVk: GitBranch[] = [];
    
    for (const branch of branches) {
      if (!isVKBranch(branch.name)) {
        nonVk.push(branch);
      }
    }
    
    return nonVk;
  }, [branches]);

  // Filter branches based on search term and options
  const filteredBranches = useMemo(() => {
    const searchTerm = branchSearchTerm.trim().toLowerCase();
    
    if (searchTerm) {
      // When searching, show all branches that match (including VK branches)
      const searchLower = searchTerm.toLowerCase();
      return branches.filter((branch) =>
        branch.name.toLowerCase().includes(searchLower)
      );
    } else {
      // When not searching, use pre-filtered non-VK branches
      return nonVkBranches;
    }
  }, [branches, nonVkBranches, branchSearchTerm]);

  const displayName = useMemo(() => {
    if (!selectedBranch) {
      // If no branch is selected, try to show the current branch
      const currentBranch = branches.find((b) => b.is_current);
      if (currentBranch) {
        // For remote branches, skip the first segment
        const parts = currentBranch.name.split('/');
        if (parts.length > 2) {
          return parts.slice(1).join('/');
        }
        return currentBranch.name;
      }
      return placeholder;
    }

    // For remote branches, skip the first segment (the remote name)
    // but preserve the rest of the branch structure
    const parts = selectedBranch.split('/');
    if (parts.length > 2) {
      // Has multiple segments like "origin/feat/my-feature"
      // Skip the first part (remote) and keep the rest
      return parts.slice(1).join('/');
    }
    
    return selectedBranch;
  }, [selectedBranch, placeholder, branches]);

  const handleBranchSelect = useCallback((branchName: string) => {
    onBranchSelect(branchName);
    setBranchSearchTerm('');
  }, [onBranchSelect]);

  // Calculate virtualization parameters - separated to avoid recalculation
  const startIndex = Math.floor(scrollOffset / ITEM_HEIGHT);
  const endIndex = Math.min(
    startIndex + VISIBLE_ITEMS + 2, // Add buffer
    filteredBranches.length
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollOffset(target.scrollTop);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`w-full justify-between text-xs ${className}`}
        >
          <div className="flex items-center gap-1.5">
            <GitBranchIcon className="h-3 w-3" />
            <span className="truncate">{displayName}</span>
          </div>
          <ArrowDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search branches..."
              value={branchSearchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8"
              onKeyDown={(e) => {
                // Prevent the dropdown from closing when typing
                e.stopPropagation();
              }}
              autoFocus
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        <TooltipProvider>
          <div 
            className="max-h-64 overflow-y-auto"
            ref={scrollContainerRef}
            onScroll={filteredBranches.length > VISIBLE_ITEMS ? handleScroll : undefined}
          >
            {isPending && branchSearchTerm ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                Searching...
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No branches found
              </div>
            ) : filteredBranches.length > VISIBLE_ITEMS ? (
              // Use virtualization for large lists
              <div style={{ height: filteredBranches.length * ITEM_HEIGHT, position: 'relative' }}>
                <div style={{ transform: `translateY(${startIndex * ITEM_HEIGHT}px)` }}>
                  {filteredBranches.slice(startIndex, endIndex).map((branch) => (
                    <BranchItem
                      key={branch.name}
                      branch={branch}
                      isCurrentAndExcluded={excludeCurrentBranch && branch.is_current}
                      isSelected={selectedBranch === branch.name}
                      onSelect={handleBranchSelect}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Render all items for small lists
              filteredBranches.map((branch) => (
                <BranchItem
                  key={branch.name}
                  branch={branch}
                  isCurrentAndExcluded={excludeCurrentBranch && branch.is_current}
                  isSelected={selectedBranch === branch.name}
                  onSelect={handleBranchSelect}
                />
              ))
            )}
          </div>
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

BranchSelector.displayName = 'BranchSelector';

export default BranchSelector;
