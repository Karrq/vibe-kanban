import { useCallback, useEffect, useState } from 'react';
import type { Project } from 'shared/types';

export function useProjectOrder() {
  const [projectOrder, setProjectOrder] = useState<string[]>([]);

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

  // Sort projects based on stored order
  const sortProjects = useCallback((projects: Project[]): Project[] => {
    if (projectOrder.length === 0) return projects;
    
    // Create a map for quick lookup
    const projectMap = new Map(projects.map(project => [project.id, project]));
    const sortedProjects: Project[] = [];
    const seenIds = new Set<string>();
    
    // First, add projects in the stored order
    for (const projectId of projectOrder) {
      const project = projectMap.get(projectId);
      if (project) {
        sortedProjects.push(project);
        seenIds.add(projectId);
      }
    }
    
    // Then, add any projects that aren't in the stored order (new projects)
    for (const project of projects) {
      if (!seenIds.has(project.id)) {
        sortedProjects.push(project);
      }
    }
    
    return sortedProjects;
  }, [projectOrder]);

  // Update order when projects are reordered
  const updateProjectOrder = useCallback((
    projects: Project[],
    activeId: string,
    overId: string
  ) => {
    const activeIndex = projects.findIndex(p => p.id === activeId);
    const overIndex = projects.findIndex(p => p.id === overId);
    
    if (activeIndex === -1 || overIndex === -1) return projects;
    
    const reorderedProjects = [...projects];
    const [movedProject] = reorderedProjects.splice(activeIndex, 1);
    reorderedProjects.splice(overIndex, 0, movedProject);
    
    // Save the new order
    saveProjectOrder(reorderedProjects.map(p => p.id));
    
    return reorderedProjects;
  }, [saveProjectOrder]);

  return {
    sortProjects,
    updateProjectOrder,
    saveProjectOrder,
  };
}