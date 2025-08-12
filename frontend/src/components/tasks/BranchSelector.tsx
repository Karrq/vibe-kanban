import { useState, useMemo, useRef, useCallback, useTransition } from 'react';
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

function BranchSelector({
  branches,
  selectedBranch,
  onBranchSelect,
  placeholder = 'Select a branch',
  className = '',
  excludeCurrentBranch = false,
}: Props) {
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

  // Helper function to check if a branch is a VK branch
  const isVKBranch = (branchName: string): boolean => {
    // Check if branch starts with vk- or has vk- after the remote name (e.g., origin/vk-)
    return branchName.startsWith('vk-') || branchName.includes('/vk-');
  };

  // Filter branches based on search term and options
  const filteredBranches = useMemo(() => {
    let filtered = branches;

    const searchTerm = branchSearchTerm.trim();
    
    if (searchTerm) {
      // When searching, show all branches that match (including VK branches)
      filtered = filtered.filter((branch) =>
        branch.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      // When not searching, hide VK branches by default
      filtered = filtered.filter((branch) => !isVKBranch(branch.name));
    }

    return filtered;
  }, [branches, branchSearchTerm]);

  const displayName = useMemo(() => {
    if (!selectedBranch) return placeholder;

    // For remote branches, skip the first segment (the remote name)
    // but preserve the rest of the branch structure
    const parts = selectedBranch.split('/');
    if (parts.length > 2) {
      // Has multiple segments like "origin/feat/my-feature"
      // Skip the first part (remote) and keep the rest
      return parts.slice(1).join('/');
    }
    
    return selectedBranch;
  }, [selectedBranch, placeholder]);

  const handleBranchSelect = (branchName: string) => {
    onBranchSelect(branchName);
    setBranchSearchTerm('');
  };

  // Calculate virtualization parameters
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollOffset / ITEM_HEIGHT);
    const endIndex = Math.min(
      startIndex + VISIBLE_ITEMS + 2, // Add buffer
      filteredBranches.length
    );
    return { startIndex, endIndex };
  }, [scrollOffset, filteredBranches.length]);

  // Memoize branch items to avoid re-creating them on every render
  const branchItems = useMemo(() => {
    const { startIndex, endIndex } = visibleRange;
    const items = [];
    
    for (let i = startIndex; i < endIndex; i++) {
      const branch = filteredBranches[i];
      if (!branch) continue;
      
      const isCurrentAndExcluded = excludeCurrentBranch && branch.is_current;
      items.push({
        branch,
        isCurrentAndExcluded,
        key: branch.name,
        index: i,
      });
    }
    
    return items;
  }, [filteredBranches, excludeCurrentBranch, visibleRange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollOffset(target.scrollTop);
  }, []);

  // Render individual branch item
  const renderBranchItem = useCallback(({ branch, isCurrentAndExcluded }: { branch: GitBranch; isCurrentAndExcluded: boolean }) => {
    const menuItem = (
      <DropdownMenuItem
        key={branch.name}
        onClick={() => {
          if (!isCurrentAndExcluded) {
            handleBranchSelect(branch.name);
          }
        }}
        disabled={isCurrentAndExcluded}
        className={`${selectedBranch === branch.name ? 'bg-accent' : ''} ${
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
        <Tooltip key={branch.name}>
          <TooltipTrigger asChild>{menuItem}</TooltipTrigger>
          <TooltipContent>
            <p>Cannot rebase a branch onto itself</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return menuItem;
  }, [selectedBranch, handleBranchSelect]);

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
                <div style={{ transform: `translateY(${visibleRange.startIndex * ITEM_HEIGHT}px)` }}>
                  {branchItems.map((item) => renderBranchItem(item))}
                </div>
              </div>
            ) : (
              // Render all items for small lists
              filteredBranches.map((branch) => {
                const isCurrentAndExcluded = excludeCurrentBranch && branch.is_current;
                return renderBranchItem({ branch, isCurrentAndExcluded });
              })
            )}
          </div>
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BranchSelector;
