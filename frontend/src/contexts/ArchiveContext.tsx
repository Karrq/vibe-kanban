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
      return {
        tasks: new Set(parsed.tasks || []),
        projects: new Set(parsed.projects || []),
      };
    }
  } catch (error) {
    console.error('Failed to load archive state:', error);
  }
  return { tasks: new Set(), projects: new Set() };
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

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveArchiveState(archiveState);
  }, [archiveState]);

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
    setArchiveState(prev => ({
      ...prev,
      projects: new Set([...prev.projects, projectId]),
    }));
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

  // Filter functions that handle search visibility logic
  const filterTasks = useCallback(<T extends { id: string; project_id?: string }>(
    tasks: T[],
    searchQuery: string = '',
    projectId?: string
  ): { visible: T[], hasOnlyArchived: boolean, archivedCount: number } => {
    // Filter by project if projectId is provided
    const projectTasks = projectId ? tasks.filter(t => t.project_id === projectId) : tasks;
    
    // Separate archived and non-archived tasks
    const nonArchived = projectTasks.filter(task => !archiveState.tasks.has(task.id));
    const archived = projectTasks.filter(task => archiveState.tasks.has(task.id));
    
    // If showing archived, include all tasks regardless of archive status
    if (visibilityState.showArchivedTasks && !searchQuery.trim()) {
      return {
        visible: projectTasks,
        hasOnlyArchived: false,
        archivedCount: archived.length
      };
    }
    
    if (!searchQuery.trim()) {
      // No search - hide archived items unless toggle is on
      return { 
        visible: nonArchived, 
        hasOnlyArchived: nonArchived.length === 0 && archived.length > 0,
        archivedCount: archived.length
      };
    }

    // During search - check if only archived items match
    const query = searchQuery.toLowerCase();
    const matchesSearch = (task: T) => {
      // Assume task has title and possibly description
      const taskWithSearch = task as any;
      return (
        taskWithSearch.title?.toLowerCase().includes(query) ||
        taskWithSearch.name?.toLowerCase().includes(query) ||
        taskWithSearch.description?.toLowerCase().includes(query)
      );
    };

    const nonArchivedMatches = nonArchived.filter(matchesSearch);
    const archivedMatches = archived.filter(matchesSearch);

    // If showing archived, include both archived and non-archived matches
    if (visibilityState.showArchivedTasks) {
      const allMatches = [...nonArchivedMatches, ...archivedMatches];
      return {
        visible: allMatches,
        hasOnlyArchived: false,
        archivedCount: archived.length
      };
    }

    if (nonArchivedMatches.length === 0 && archivedMatches.length > 0) {
      // Only archived items match - show them
      return { 
        visible: archivedMatches, 
        hasOnlyArchived: true,
        archivedCount: archived.length
      };
    }

    // Show only non-archived matches
    return { 
      visible: nonArchivedMatches, 
      hasOnlyArchived: false,
      archivedCount: archived.length
    };
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
    // If showing archived, include all projects regardless of archive status
    if (visibilityState.showArchivedProjects && !searchQuery.trim()) {
      return {
        visible: projects,
        hasOnlyArchived: false
      };
    }
    
    if (!searchQuery.trim()) {
      // No search - hide archived items unless toggle is on
      const visible = projects.filter(project => !archiveState.projects.has(project.id));
      return { visible, hasOnlyArchived: visible.length === 0 && projects.length > 0 };
    }

    // During search - check if only archived items match
    const query = searchQuery.toLowerCase();
    const matchingProjects = projects.filter(project => {
      // Assume project has name and possibly description
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