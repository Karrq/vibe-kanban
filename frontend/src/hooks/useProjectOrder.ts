import { useCallback, useEffect, useState } from 'react';
import type { Project } from 'shared/types';
import { useArchive } from '@/contexts/ArchiveContext';
import { arrayMove } from '@dnd-kit/sortable';

export function useProjectOrder() {
  const [projectOrder, setProjectOrder] = useState<string[]>([]);
  const { isProjectArchived } = useArchive();

  // Load project order from localStorage
  useEffect(() => {
    const storedOrder = localStorage.getItem('vibe-kanban-project-order');
    if (storedOrder) {
      try {
        const order: string[] = JSON.parse(storedOrder);
        setProjectOrder(order);
      } catch (e) {
        console.error('Failed to parse project order from localStorage:', e);
      }
    }
  }, []);

  // Save project order to localStorage
  const saveProjectOrder = useCallback((newOrder: string[]) => {
    localStorage.setItem('vibe-kanban-project-order', JSON.stringify(newOrder));
    setProjectOrder(newOrder);
  }, []);

  // Sort projects based on stored order, always placing archived items last
  const sortProjects = useCallback((projects: Project[]): Project[] => {
    // Separate active and archived projects
    const activeProjects = projects.filter(p => !isProjectArchived(p.id));
    const archivedProjects = projects.filter(p => isProjectArchived(p.id));
    
    // Sort active projects based on stored order
    const sortedActive = projectOrder.length === 0 ? activeProjects : (() => {
      const projectMap = new Map(activeProjects.map(project => [project.id, project]));
      const sorted: Project[] = [];
      const seenIds = new Set<string>();
      
      // First, add active projects in the stored order
      for (const projectId of projectOrder) {
        const project = projectMap.get(projectId);
        if (project) {
          sorted.push(project);
          seenIds.add(projectId);
        }
      }
      
      // Then, add any active projects that aren't in the stored order
      for (const project of activeProjects) {
        if (!seenIds.has(project.id)) {
          sorted.push(project);
        }
      }
      
      return sorted;
    })();
    
    // Archived projects always come after active ones (in their original order)
    return [...sortedActive, ...archivedProjects];
  }, [projectOrder, isProjectArchived]);

  // Update order when projects are reordered
  const updateProjectOrder = useCallback((
    projects: Project[],
    activeId: string,
    overId: string
  ) => {
    // Only work with active (non-archived) projects for reordering
    const activeProjects = projects.filter(p => !isProjectArchived(p.id));
    const archivedProjects = projects.filter(p => isProjectArchived(p.id));
    
    const activeIndex = activeProjects.findIndex(p => p.id === activeId);
    const overIndex = activeProjects.findIndex(p => p.id === overId);
    
    if (activeIndex === -1 || overIndex === -1) return projects;
    
    // Use arrayMove to maintain stable ordering
    const reorderedActive = arrayMove(activeProjects, activeIndex, overIndex);
    
    // Save only the IDs of active projects (archived projects are not in the order)
    saveProjectOrder(reorderedActive.map(p => p.id));
    
    // Return combined array with archived projects always at the end
    return [...reorderedActive, ...archivedProjects];
  }, [saveProjectOrder, isProjectArchived]);

  // Remove a project from the stored order (e.g., when archived)
  const removeFromOrder = useCallback((projectId: string) => {
    const newOrder = projectOrder.filter(id => id !== projectId);
    saveProjectOrder(newOrder);
  }, [projectOrder, saveProjectOrder]);

  return {
    sortProjects,
    updateProjectOrder,
    saveProjectOrder,
    removeFromOrder,
  };
}