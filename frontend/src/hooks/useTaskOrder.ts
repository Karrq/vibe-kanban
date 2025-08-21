import { useCallback, useEffect, useState } from 'react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useArchive } from '@/contexts/ArchiveContext';

type TaskOrder = {
  [projectId: string]: string[]; // Array of task IDs in order
};

export function useTaskOrder(projectId: string | undefined) {
  const [taskOrder, setTaskOrder] = useState<string[]>([]);
  const { isTaskArchived } = useArchive();

  // Load task order from localStorage
  useEffect(() => {
    if (!projectId) return;
    
    const storedOrder = localStorage.getItem('vibe-kanban-task-order');
    if (storedOrder) {
      try {
        const allOrders: TaskOrder = JSON.parse(storedOrder);
        setTaskOrder(allOrders[projectId] || []);
      } catch (e) {
        console.error('Failed to parse task order from localStorage:', e);
      }
    }
  }, [projectId]);

  // Save task order to localStorage
  const saveTaskOrder = useCallback((newOrder: string[]) => {
    if (!projectId) return;
    
    const storedOrder = localStorage.getItem('vibe-kanban-task-order');
    let allOrders: TaskOrder = {};
    
    if (storedOrder) {
      try {
        allOrders = JSON.parse(storedOrder);
      } catch (e) {
        console.error('Failed to parse task order from localStorage:', e);
      }
    }
    
    allOrders[projectId] = newOrder;
    localStorage.setItem('vibe-kanban-task-order', JSON.stringify(allOrders));
    setTaskOrder(newOrder);
  }, [projectId]);

  // Sort tasks based on stored order, always placing archived items last
  const sortTasks = useCallback((tasks: TaskWithAttemptStatus[]): TaskWithAttemptStatus[] => {
    // Separate active and archived tasks
    const activeTasks = tasks.filter(t => !isTaskArchived(t.id));
    const archivedTasks = tasks.filter(t => isTaskArchived(t.id));
    
    // Sort active tasks based on stored order
    const sortedActive = taskOrder.length === 0 ? activeTasks : (() => {
      const taskMap = new Map(activeTasks.map(task => [task.id, task]));
      const sorted: TaskWithAttemptStatus[] = [];
      const seenIds = new Set<string>();
      
      // First, add active tasks in the stored order
      for (const taskId of taskOrder) {
        const task = taskMap.get(taskId);
        if (task) {
          sorted.push(task);
          seenIds.add(taskId);
        }
      }
      
      // Then, add any active tasks that aren't in the stored order
      for (const task of activeTasks) {
        if (!seenIds.has(task.id)) {
          sorted.push(task);
        }
      }
      
      return sorted;
    })();
    
    // Archived tasks always come after active ones (in their original order)
    return [...sortedActive, ...archivedTasks];
  }, [taskOrder, isTaskArchived]);

  // Update order when tasks are reordered
  const updateTaskOrder = useCallback((
    tasks: TaskWithAttemptStatus[],
    activeId: string,
    overId: string
  ) => {
    const activeIndex = tasks.findIndex(t => t.id === activeId);
    const overIndex = tasks.findIndex(t => t.id === overId);
    
    if (activeIndex === -1 || overIndex === -1) return tasks;
    
    const reorderedTasks = [...tasks];
    const [movedTask] = reorderedTasks.splice(activeIndex, 1);
    reorderedTasks.splice(overIndex, 0, movedTask);
    
    // Save the new order
    saveTaskOrder(reorderedTasks.map(t => t.id));
    
    return reorderedTasks;
  }, [saveTaskOrder]);

  // Remove a task from the stored order (e.g., when archived)
  const removeFromOrder = useCallback((taskId: string) => {
    if (!projectId) return;
    
    const storedOrder = localStorage.getItem('vibe-kanban-task-order');
    let allOrders: TaskOrder = {};
    
    if (storedOrder) {
      try {
        allOrders = JSON.parse(storedOrder);
      } catch (e) {
        console.error('Failed to parse task order from localStorage:', e);
      }
    }
    
    if (allOrders[projectId]) {
      allOrders[projectId] = allOrders[projectId].filter(id => id !== taskId);
      localStorage.setItem('vibe-kanban-task-order', JSON.stringify(allOrders));
      setTaskOrder(allOrders[projectId]);
    }
  }, [projectId]);

  return {
    sortTasks,
    updateTaskOrder,
    saveTaskOrder,
    removeFromOrder,
  };
}