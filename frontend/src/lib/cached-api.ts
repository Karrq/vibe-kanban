import { offlineStorage } from './offline-storage';
import { offlineFallback } from './offline-fallback';
import { projectsApi, tasksApi, templatesApi } from './api';
import type {
  ProjectWithBranch,
  TaskWithAttemptStatus,
  TaskTemplate,
  CreateTask,
  UpdateTask,
} from 'shared/types';

export interface CachedData<T> {
  data: T;
  isStale: boolean;
  lastSynced?: number;
  fromCache: boolean;
}

class CachedApi {
  private syncInProgress = new Set<string>();
  private useIndexedDB = true;

  constructor() {
    // Check if we can use IndexedDB (requires HTTPS or localhost)
    const isSecureContext = window.isSecureContext;
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    this.useIndexedDB = isSecureContext || isLocalhost;
    
    if (!this.useIndexedDB) {
      console.info('Using localStorage fallback for offline caching (IndexedDB requires HTTPS)');
    }
  }

  // Project operations
  async getProject(id: string, forceRefresh = false): Promise<CachedData<ProjectWithBranch | null>> {
    const cacheKey = `project-${id}`;
    
    // Try to get from cache first
    if (!forceRefresh && !navigator.onLine) {
      const cached = this.useIndexedDB 
        ? await offlineStorage.getProject(id)
        : offlineFallback.get<ProjectWithBranch>(`project-${id}`);
      if (cached) {
        return {
          data: cached,
          isStale: true,
          lastSynced: Date.now() - 60000, // Approximate
          fromCache: true,
        };
      }
    }

    // If online or force refresh, try to fetch
    if (navigator.onLine && !this.syncInProgress.has(cacheKey)) {
      this.syncInProgress.add(cacheKey);
      try {
        const fresh = await projectsApi.getWithBranch(id);
        if (this.useIndexedDB) {
          await offlineStorage.saveProject(fresh);
        } else {
          offlineFallback.set(`project-${id}`, fresh);
        }
        this.syncInProgress.delete(cacheKey);
        return {
          data: fresh,
          isStale: false,
          lastSynced: Date.now(),
          fromCache: false,
        };
      } catch (error) {
        this.syncInProgress.delete(cacheKey);
        // Fall back to cache on error
        const cached = this.useIndexedDB 
          ? await offlineStorage.getProject(id)
          : offlineFallback.get<ProjectWithBranch>(`project-${id}`);
        if (cached) {
          return {
            data: cached,
            isStale: true,
            lastSynced: Date.now() - 60000,
            fromCache: true,
          };
        }
        throw error;
      }
    }

    // Return cached data if available
    const cached = this.useIndexedDB 
      ? await offlineStorage.getProject(id)
      : offlineFallback.get<ProjectWithBranch>(`project-${id}`);
    return {
      data: cached || null,
      isStale: !!cached,
      lastSynced: cached ? Date.now() - 60000 : undefined,
      fromCache: true,
    };
  }

  async getAllProjects(forceRefresh = false): Promise<CachedData<ProjectWithBranch[]>> {
    const cacheKey = 'all-projects';
    
    // Try cache first if offline
    if (!forceRefresh && !navigator.onLine) {
      const cached = await offlineStorage.getAllProjects();
      return {
        data: cached,
        isStale: true,
        lastSynced: Date.now() - 60000,
        fromCache: true,
      };
    }

    // If online, fetch fresh data
    if (navigator.onLine && !this.syncInProgress.has(cacheKey)) {
      this.syncInProgress.add(cacheKey);
      try {
        const fresh = await projectsApi.getAll();
        // Save all projects to cache
        await Promise.all(fresh.map((p: any) => {
          // Convert Project to ProjectWithBranch format for storage
          const projectWithBranch: ProjectWithBranch = {
            ...p,
            current_branch: null,
            branches: [],
          };
          return offlineStorage.saveProject(projectWithBranch);
        }));
        this.syncInProgress.delete(cacheKey);
        // Convert back to array of ProjectWithBranch
        const projectsWithBranch = fresh.map((p: any) => ({
          ...p,
          current_branch: null,
          branches: [],
        }));
        return {
          data: projectsWithBranch,
          isStale: false,
          lastSynced: Date.now(),
          fromCache: false,
        };
      } catch (error) {
        this.syncInProgress.delete(cacheKey);
        // Fall back to cache
        const cached = await offlineStorage.getAllProjects();
        return {
          data: cached,
          isStale: true,
          lastSynced: Date.now() - 60000,
          fromCache: true,
        };
      }
    }

    // Return cached data
    const cached = await offlineStorage.getAllProjects();
    return {
      data: cached,
      isStale: true,
      lastSynced: Date.now() - 60000,
      fromCache: true,
    };
  }

  // Task operations
  async getTasksByProject(projectId: string, forceRefresh = false): Promise<CachedData<TaskWithAttemptStatus[]>> {
    const cacheKey = `tasks-${projectId}`;
    
    // Try cache first if offline
    if (!forceRefresh && !navigator.onLine) {
      const cached = this.useIndexedDB
        ? await offlineStorage.getTasksByProject(projectId)
        : offlineFallback.get<TaskWithAttemptStatus[]>(`tasks-${projectId}`) || [];
      return {
        data: cached,
        isStale: true,
        lastSynced: Date.now() - 60000,
        fromCache: true,
      };
    }

    // If online, fetch fresh data
    if (navigator.onLine && !this.syncInProgress.has(cacheKey)) {
      this.syncInProgress.add(cacheKey);
      try {
        const fresh = await tasksApi.getAll(projectId);
        if (this.useIndexedDB) {
          await offlineStorage.saveTasks(fresh, projectId);
        } else {
          offlineFallback.set(`tasks-${projectId}`, fresh);
        }
        this.syncInProgress.delete(cacheKey);
        return {
          data: fresh,
          isStale: false,
          lastSynced: Date.now(),
          fromCache: false,
        };
      } catch (error) {
        this.syncInProgress.delete(cacheKey);
        // Fall back to cache
        const cached = this.useIndexedDB
          ? await offlineStorage.getTasksByProject(projectId)
          : offlineFallback.get<TaskWithAttemptStatus[]>(`tasks-${projectId}`) || [];
        return {
          data: cached,
          isStale: true,
          lastSynced: Date.now() - 60000,
          fromCache: true,
        };
      }
    }

    // Return cached data
    const cached = this.useIndexedDB
      ? await offlineStorage.getTasksByProject(projectId)
      : offlineFallback.get<TaskWithAttemptStatus[]>(`tasks-${projectId}`) || [];
    return {
      data: cached,
      isStale: true,
      lastSynced: Date.now() - 60000,
      fromCache: true,
    };
  }

  async getTask(id: string, forceRefresh = false): Promise<CachedData<TaskWithAttemptStatus | null>> {
    const cacheKey = `task-${id}`;
    
    // Try cache first if offline
    if (!forceRefresh && !navigator.onLine) {
      const cached = await offlineStorage.getTask(id);
      return {
        data: cached || null,
        isStale: true,
        lastSynced: Date.now() - 60000,
        fromCache: true,
      };
    }

    // If online, fetch fresh data
    if (navigator.onLine && !this.syncInProgress.has(cacheKey)) {
      this.syncInProgress.add(cacheKey);
      try {
        // Need projectId to get task - try to get from cache first
        const cachedTask = await offlineStorage.getTask(id);
        if (!cachedTask || !cachedTask.project_id) {
          throw new Error('Cannot fetch task without project ID');
        }
        const fresh = await tasksApi.getById(cachedTask.project_id, id);
        if (fresh && 'project_id' in fresh) {
          await offlineStorage.updateTask(fresh as TaskWithAttemptStatus, fresh.project_id);
        }
        this.syncInProgress.delete(cacheKey);
        return {
          data: fresh as TaskWithAttemptStatus,
          isStale: false,
          lastSynced: Date.now(),
          fromCache: false,
        };
      } catch (error) {
        this.syncInProgress.delete(cacheKey);
        // Fall back to cache
        const cached = await offlineStorage.getTask(id);
        return {
          data: cached || null,
          isStale: true,
          lastSynced: Date.now() - 60000,
          fromCache: true,
        };
      }
    }

    // Return cached data
    const cached = await offlineStorage.getTask(id);
    return {
      data: cached || null,
      isStale: true,
      lastSynced: Date.now() - 60000,
      fromCache: true,
    };
  }

  async createTask(projectId: string, task: CreateTask): Promise<TaskWithAttemptStatus> {
    if (!navigator.onLine) {
      // Queue for later sync
      await offlineStorage.addOfflineChange({
        type: 'create_task',
        projectId,
        data: task,
        timestamp: Date.now(),
      });
      throw new Error('Cannot create tasks while offline. Changes will be synced when connection is restored.');
    }

    const created = await tasksApi.create(projectId, task);
    // Convert Task to TaskWithAttemptStatus
    const taskWithStatus: TaskWithAttemptStatus = {
      ...created,
      has_in_progress_attempt: false,
      has_merged_attempt: false,
      last_attempt_failed: false,
      latest_attempt_executor: null,
    };
    await offlineStorage.updateTask(taskWithStatus, projectId);
    return taskWithStatus;
  }

  async updateTask(projectId: string, id: string, updates: UpdateTask): Promise<TaskWithAttemptStatus> {
    if (!navigator.onLine) {
      // Queue for later sync
      await offlineStorage.addOfflineChange({
        type: 'update_task',
        projectId,
        taskId: id,
        data: updates,
        timestamp: Date.now(),
      });
      
      // Update local cache optimistically
      const cached = await offlineStorage.getTask(id);
      if (cached) {
        const updated = { ...cached, ...updates };
        await offlineStorage.updateTask(updated as TaskWithAttemptStatus, projectId);
        return updated as TaskWithAttemptStatus;
      }
      throw new Error('Cannot update task while offline');
    }

    const updated = await tasksApi.update(projectId, id, updates);
    // Convert Task to TaskWithAttemptStatus
    const taskWithStatus: TaskWithAttemptStatus = {
      ...updated,
      has_in_progress_attempt: false,
      has_merged_attempt: false,
      last_attempt_failed: false,
      latest_attempt_executor: null,
    };
    await offlineStorage.updateTask(taskWithStatus, projectId);
    return taskWithStatus;
  }

  // Template operations
  async getTemplates(projectId?: string, forceRefresh = false): Promise<CachedData<TaskTemplate[]>> {
    const cacheKey = projectId ? `templates-${projectId}` : 'templates-global';
    
    // Try cache first if offline
    if (!forceRefresh && !navigator.onLine) {
      const cached = await offlineStorage.getTemplates();
      return {
        data: cached,
        isStale: true,
        lastSynced: Date.now() - 60000,
        fromCache: true,
      };
    }

    // If online, fetch fresh data
    if (navigator.onLine && !this.syncInProgress.has(cacheKey)) {
      this.syncInProgress.add(cacheKey);
      try {
        const fresh = projectId 
          ? await templatesApi.listByProject(projectId)
          : await templatesApi.listGlobal();
        await offlineStorage.saveTemplates(fresh);
        this.syncInProgress.delete(cacheKey);
        return {
          data: fresh,
          isStale: false,
          lastSynced: Date.now(),
          fromCache: false,
        };
      } catch (error) {
        this.syncInProgress.delete(cacheKey);
        // Fall back to cache
        const cached = await offlineStorage.getTemplates();
        return {
          data: cached,
          isStale: true,
          lastSynced: Date.now() - 60000,
          fromCache: true,
        };
      }
    }

    // Return cached data
    const cached = await offlineStorage.getTemplates();
    return {
      data: cached,
      isStale: true,
      lastSynced: Date.now() - 60000,
      fromCache: true,
    };
  }

  // Sync offline changes
  async syncOfflineChanges(): Promise<void> {
    if (!navigator.onLine) return;

    const changes = await offlineStorage.getOfflineChanges();
    if (changes.length === 0) return;

    for (const change of changes) {
      try {
        switch (change.type) {
          case 'create_task':
            await tasksApi.create(change.projectId, change.data);
            break;
          case 'update_task':
            await tasksApi.update(change.projectId, change.taskId, change.data);
            break;
          // Add more change types as needed
        }
      } catch (error) {
        console.error('Failed to sync offline change:', error);
        // Keep the change for retry
        continue;
      }
    }

    // Clear successfully synced changes
    await offlineStorage.clearOfflineChanges();
  }

  // Force refresh all cached data for a project
  async refreshProject(projectId: string): Promise<void> {
    await Promise.all([
      this.getProject(projectId, true),
      this.getTasksByProject(projectId, true),
      this.getTemplates(projectId, true),
    ]);
  }
}

export const cachedApi = new CachedApi();