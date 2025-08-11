import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface ArchiveState {
  tasks: Set<string>;
  projects: Set<string>;
}

interface VisibilityState {
  showArchivedTasks: boolean;
  showArchivedProjects: boolean;
}

interface ArchiveContextType {
  // Task operations
  isTaskArchived: (taskId: string) => boolean;
  archiveTask: (taskId: string) => void;
  unarchiveTask: (taskId: string) => void;
  toggleTaskArchive: (taskId: string) => void;
  filterTasks: <T extends { id: string; project_id?: string }>(
    tasks: T[],
    searchQuery?: string,
    projectId?: string
  ) => { visible: T[]; hasOnlyArchived: boolean; archivedCount: number };
  getArchivedTasks: <T extends { id: string; project_id?: string }>(
    tasks: T[],
    projectId?: string
  ) => T[];

  // Project operations
  isProjectArchived: (projectId: string) => boolean;
  archiveProject: (projectId: string) => void;
  unarchiveProject: (projectId: string) => void;
  toggleProjectArchive: (projectId: string) => void;
  filterProjects: <T extends { id: string }>(
    projects: T[],
    searchQuery?: string
  ) => { visible: T[]; hasOnlyArchived: boolean };

  // Visibility toggles
  showArchivedTasks: boolean;
  toggleShowArchivedTasks: () => void;
  showArchivedProjects: boolean;
  toggleShowArchivedProjects: () => void;

  // Counts
  archivedCounts: {
    tasks: number;
    projects: number;
  };
  
  // Quick checks for performance
  hasArchivedTasks: boolean;
  hasArchivedProjects: boolean;
  getProjectArchivedTaskCount: (tasks: { id: string; project_id?: string }[], projectId: string) => number;
  
  // Performance optimizations for common case (many archived items)
  shouldFetchItem: (id: string, type: 'task' | 'project') => boolean;
  getVisibleIds: (allIds: string[], type: 'task' | 'project') => string[];

  // Direct access to sets if needed
  archivedTaskIds: Set<string>;
  archivedProjectIds: Set<string>;
}

const ARCHIVE_STORAGE_KEY = 'vibe-kanban-archive';

const getInitialArchiveState = (): ArchiveState => {
  try {
    const stored = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const state: ArchiveState = {
        tasks: new Set<string>(parsed.tasks || []),
        projects: new Set<string>(parsed.projects || []),
      };
      return state;
    }
  } catch (error) {
    console.error('Failed to load archive state:', error);
  }
  return { tasks: new Set<string>(), projects: new Set<string>() };
};

const saveArchiveState = (state: ArchiveState) => {
  try {
    const serialized = {
      tasks: Array.from(state.tasks),
      projects: Array.from(state.projects),
    };
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.error('Failed to save archive state:', error);
  }
};

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const [archiveState, setArchiveState] = useState<ArchiveState>(getInitialArchiveState);
  const [visibilityState, setVisibilityState] = useState<VisibilityState>({
    showArchivedTasks: false,
    showArchivedProjects: false,
  });
  
  // Memoized cache for archive counts by project
  const projectArchiveCountCache = useMemo(() => new Map<string, number>(), []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveArchiveState(archiveState);
    // Clear cache when archive state changes
    projectArchiveCountCache.clear();
  }, [archiveState, projectArchiveCountCache]);

  const isTaskArchived = useCallback((taskId: string) => {
    return archiveState.tasks.has(taskId);
  }, [archiveState.tasks]);

  const isProjectArchived = useCallback((projectId: string) => {
    return archiveState.projects.has(projectId);
  }, [archiveState.projects]);

  const archiveTask = useCallback((taskId: string) => {
    setArchiveState(prev => ({
      ...prev,
      tasks: new Set([...prev.tasks, taskId]),
    }));
  }, []);

  const unarchiveTask = useCallback((taskId: string) => {
    setArchiveState(prev => {
      const newTasks = new Set(prev.tasks);
      newTasks.delete(taskId);
      return { ...prev, tasks: newTasks };
    });
  }, []);

  const toggleTaskArchive = useCallback((taskId: string) => {
    setArchiveState(prev => {
      const newTasks = new Set(prev.tasks);
      if (newTasks.has(taskId)) {
        newTasks.delete(taskId);
      } else {
        newTasks.add(taskId);
      }
      return { ...prev, tasks: newTasks };
    });
  }, []);

  const archiveProject = useCallback((projectId: string) => {
    setArchiveState(prev => {
      // Ensure no duplicates by creating new Set properly
      const newProjects = new Set(prev.projects);
      newProjects.add(projectId);
      return { ...prev, projects: newProjects };
    });
  }, []);

  const unarchiveProject = useCallback((projectId: string) => {
    setArchiveState(prev => {
      const newProjects = new Set(prev.projects);
      newProjects.delete(projectId);
      return { ...prev, projects: newProjects };
    });
  }, []);

  const toggleProjectArchive = useCallback((projectId: string) => {
    setArchiveState(prev => {
      const newProjects = new Set(prev.projects);
      if (newProjects.has(projectId)) {
        newProjects.delete(projectId);
      } else {
        newProjects.add(projectId);
      }
      return { ...prev, projects: newProjects };
    });
  }, []);

  // Visibility toggle functions
  const toggleShowArchivedTasks = useCallback(() => {
    setVisibilityState(prev => ({
      ...prev,
      showArchivedTasks: !prev.showArchivedTasks,
    }));
  }, []);

  const toggleShowArchivedProjects = useCallback(() => {
    setVisibilityState(prev => ({
      ...prev,
      showArchivedProjects: !prev.showArchivedProjects,
    }));
  }, []);

  // Optimized filter function for the common case where many items are archived
  const filterTasks = useCallback(<T extends { id: string; project_id?: string }>(
    tasks: T[],
    searchQuery: string = '',
    projectId?: string
  ): { visible: T[], hasOnlyArchived: boolean, archivedCount: number } => {
    // Most efficient path: When many items are archived and we're not showing them
    // Use single pass with early termination for common case
    const query = searchQuery.trim().toLowerCase();
    const isSearching = query.length > 0;
    
    let visible: T[] = [];
    let archivedCount = 0;
    let archivedMatchCount = 0;
    
    // Single pass through tasks
    for (const task of tasks) {
      // Skip if wrong project
      if (projectId && task.project_id !== projectId) continue;
      
      const isArchived = archiveState.tasks.has(task.id);
      
      if (isArchived) {
        archivedCount++;
        
        // Only process archived items if showing them or searching
        if (!visibilityState.showArchivedTasks && !isSearching) continue;
        
        if (isSearching) {
          const taskWithSearch = task as any;
          const matches = (
            taskWithSearch.title?.toLowerCase().includes(query) ||
            taskWithSearch.name?.toLowerCase().includes(query) ||
            taskWithSearch.description?.toLowerCase().includes(query)
          );
          
          if (matches) {
            archivedMatchCount++;
            if (visibilityState.showArchivedTasks) {
              visible.push(task);
            }
          }
        } else if (visibilityState.showArchivedTasks) {
          visible.push(task);
        }
      } else {
        // Non-archived item
        if (isSearching) {
          const taskWithSearch = task as any;
          const matches = (
            taskWithSearch.title?.toLowerCase().includes(query) ||
            taskWithSearch.name?.toLowerCase().includes(query) ||
            taskWithSearch.description?.toLowerCase().includes(query)
          );
          
          if (matches) {
            visible.push(task);
          }
        } else {
          // Not searching, not archived - always visible
          visible.push(task);
        }
      }
    }
    
    // Determine if we should show archived items that match search
    const hasOnlyArchived = isSearching && visible.length === 0 && archivedMatchCount > 0;
    
    if (hasOnlyArchived && !visibilityState.showArchivedTasks) {
      // Re-collect archived matches
      visible = tasks.filter(task => {
        if (projectId && task.project_id !== projectId) return false;
        if (!archiveState.tasks.has(task.id)) return false;
        
        const taskWithSearch = task as any;
        return (
          taskWithSearch.title?.toLowerCase().includes(query) ||
          taskWithSearch.name?.toLowerCase().includes(query) ||
          taskWithSearch.description?.toLowerCase().includes(query)
        );
      });
    }
    
    return { visible, hasOnlyArchived, archivedCount };
  }, [archiveState.tasks, visibilityState.showArchivedTasks]);

  // Get archived tasks filtered by project if needed
  const getArchivedTasks = useCallback(<T extends { id: string; project_id?: string }>(
    tasks: T[],
    projectId?: string
  ): T[] => {
    const projectTasks = projectId ? tasks.filter(t => t.project_id === projectId) : tasks;
    return projectTasks.filter(task => archiveState.tasks.has(task.id));
  }, [archiveState.tasks]);

  const filterProjects = useCallback(<T extends { id: string }>(
    projects: T[],
    searchQuery: string = ''
  ): { visible: T[], hasOnlyArchived: boolean } => {
    // Early return if no archived items exist
    if (archiveState.projects.size === 0) {
      if (!searchQuery.trim()) {
        return { 
          visible: projects, 
          hasOnlyArchived: false
        };
      }
      
      const query = searchQuery.toLowerCase();
      const filtered = projects.filter(project => {
        const projectWithSearch = project as any;
        return (
          projectWithSearch.name?.toLowerCase().includes(query) ||
          projectWithSearch.description?.toLowerCase().includes(query)
        );
      });
      
      return {
        visible: filtered,
        hasOnlyArchived: false
      };
    }
    
    // If showing archived, include all projects regardless of archive status
    if (visibilityState.showArchivedProjects && !searchQuery.trim()) {
      return {
        visible: projects,
        hasOnlyArchived: false
      };
    }
    
    if (!searchQuery.trim()) {
      // Fast path: No search - just filter out archived items
      const visible = projects.filter(project => !archiveState.projects.has(project.id));
      return { visible, hasOnlyArchived: visible.length === 0 && projects.length > 0 };
    }

    // During search - check if only archived items match
    const query = searchQuery.toLowerCase();
    const matchingProjects = projects.filter(project => {
      const projectWithSearch = project as any;
      return (
        projectWithSearch.name?.toLowerCase().includes(query) ||
        projectWithSearch.description?.toLowerCase().includes(query)
      );
    });

    const nonArchivedMatches = matchingProjects.filter(project => !archiveState.projects.has(project.id));
    const archivedMatches = matchingProjects.filter(project => archiveState.projects.has(project.id));

    // If showing archived, include both archived and non-archived matches
    if (visibilityState.showArchivedProjects) {
      return { visible: matchingProjects, hasOnlyArchived: false };
    }

    if (nonArchivedMatches.length === 0 && archivedMatches.length > 0) {
      // Only archived items match - show them
      return { visible: matchingProjects, hasOnlyArchived: true };
    }

    // Show only non-archived matches
    return { visible: nonArchivedMatches, hasOnlyArchived: false };
  }, [archiveState.projects, visibilityState.showArchivedProjects]);

  // Get counts for UI
  const archivedCounts = useMemo(() => ({
    tasks: archiveState.tasks.size,
    projects: archiveState.projects.size,
  }), [archiveState]);
  
  // Quick performance checks
  const hasArchivedTasks = useMemo(() => archiveState.tasks.size > 0, [archiveState.tasks]);
  const hasArchivedProjects = useMemo(() => archiveState.projects.size > 0, [archiveState.projects]);
  
  const getProjectArchivedTaskCount = useCallback((
    tasks: { id: string; project_id?: string }[],
    projectId: string
  ): number => {
    if (archiveState.tasks.size === 0) return 0;
    
    // Check cache first
    const cacheKey = `${projectId}_${tasks.length}`;
    if (projectArchiveCountCache.has(cacheKey)) {
      return projectArchiveCountCache.get(cacheKey)!;
    }
    
    let count = 0;
    tasks.forEach(task => {
      if (task.project_id === projectId && archiveState.tasks.has(task.id)) {
        count++;
      }
    });
    
    // Cache the result
    projectArchiveCountCache.set(cacheKey, count);
    return count;
  }, [archiveState.tasks, projectArchiveCountCache]);
  
  // Performance optimization: Check if we should fetch an item based on archive status
  const shouldFetchItem = useCallback((id: string, type: 'task' | 'project'): boolean => {
    const archiveSet = type === 'task' ? archiveState.tasks : archiveState.projects;
    const showArchived = type === 'task' ? visibilityState.showArchivedTasks : visibilityState.showArchivedProjects;
    
    // If showing archived items, fetch everything
    if (showArchived) return true;
    
    // Otherwise, only fetch non-archived items
    return !archiveSet.has(id);
  }, [archiveState, visibilityState]);
  
  // Performance optimization: Get list of visible IDs for batch operations
  const getVisibleIds = useCallback((allIds: string[], type: 'task' | 'project'): string[] => {
    const archiveSet = type === 'task' ? archiveState.tasks : archiveState.projects;
    const showArchived = type === 'task' ? visibilityState.showArchivedTasks : visibilityState.showArchivedProjects;
    
    // If showing archived items, return all IDs
    if (showArchived) return allIds;
    
    // Otherwise, filter out archived items
    return allIds.filter(id => !archiveSet.has(id));
  }, [archiveState, visibilityState]);

  const value = useMemo(() => ({
    // Task operations
    isTaskArchived,
    archiveTask,
    unarchiveTask,
    toggleTaskArchive,
    filterTasks,
    getArchivedTasks,

    // Project operations
    isProjectArchived,
    archiveProject,
    unarchiveProject,
    toggleProjectArchive,
    filterProjects,

    // Visibility toggles
    showArchivedTasks: visibilityState.showArchivedTasks,
    toggleShowArchivedTasks,
    showArchivedProjects: visibilityState.showArchivedProjects,
    toggleShowArchivedProjects,

    // Counts
    archivedCounts,
    
    // Quick checks for performance
    hasArchivedTasks,
    hasArchivedProjects,
    getProjectArchivedTaskCount,
    
    // Performance optimizations
    shouldFetchItem,
    getVisibleIds,

    // Direct access to sets if needed
    archivedTaskIds: archiveState.tasks,
    archivedProjectIds: archiveState.projects,
  }), [
    isTaskArchived,
    archiveTask,
    unarchiveTask,
    toggleTaskArchive,
    filterTasks,
    getArchivedTasks,
    isProjectArchived,
    archiveProject,
    unarchiveProject,
    toggleProjectArchive,
    filterProjects,
    visibilityState.showArchivedTasks,
    toggleShowArchivedTasks,
    visibilityState.showArchivedProjects,
    toggleShowArchivedProjects,
    archivedCounts,
    hasArchivedTasks,
    hasArchivedProjects,
    getProjectArchivedTaskCount,
    shouldFetchItem,
    getVisibleIds,
    archiveState.tasks,
    archiveState.projects,
  ]);

  return (
    <ArchiveContext.Provider value={value}>
      {children}
    </ArchiveContext.Provider>
  );
}

export function useArchive() {
  const context = useContext(ArchiveContext);
  if (context === undefined) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
}